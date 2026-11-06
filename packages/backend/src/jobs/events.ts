// Event jobs: serial grouping, debounced digests.
import type { PgBoss } from "pg-boss";
import { groupArticle } from "../events/group.ts";
import { composeStoryDigest } from "../events/digest.ts";
import { settleNonEditorial } from "./content.ts";
import { enqueue, ensureQueue, getBoss, QUEUES, work } from "./queue.ts";
import { sql } from "../db.ts";

export async function registerEventJobs(boss: PgBoss) {
  // Serial on purpose: two reports of the same new fact must not both create it.
  await work(boss, QUEUES.group, { localConcurrency: 1, pollingIntervalSeconds: 0.5 }, async ({ articleId, signalOnly }) => {
    // A discussion post comes here straight from collection: record it first (settleNonEditorial).
    if (signalOnly && !(await settleNonEditorial(articleId)).group) return { verdict: "skipped" };
    const result = await groupArticle(articleId, { signalOnly });
    if (result.storyId && !result.verdict.startsWith("signal")) {
      await enqueue(QUEUES.digest, { storyId: result.storyId }, { singletonKey: `story:${result.storyId}`, startAfter: 60 });
    }
    return result;
  });
  await work(boss, QUEUES.digest, { localConcurrency: 3, pollingIntervalSeconds: 5 }, ({ storyId }) => composeStoryDigest(storyId));
}

const STALE_GROUP_JOB_MS = 30 * 60_000;

/** Cancel a grouping job that stopped advancing for half an hour; its article is then repaired below. */
async function cancelStaleGroupJobs(now = Date.now()): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    SELECT j.id FROM pgboss.job j JOIN articles a ON a.id = j.data->>'articleId'
    WHERE j.name = ${QUEUES.group} AND j.state IN ('created', 'retry', 'active')
      AND coalesce(j.started_on, j.created_on) < ${new Date(now - STALE_GROUP_JOB_MS)}
      AND a.grouping_status = 'pending' AND a.grouping_receipt_id IS NULL
    ORDER BY coalesce(j.started_on, j.created_on) LIMIT 100`;
  if (!rows.length) return 0;
  const boss = await getBoss();
  let cancelled = 0;
  for (const row of rows) {
    try {
      await boss.cancel(QUEUES.group, row.id);
      cancelled += 1;
    } catch {
      // Another worker may have completed it between the read and the cancel. The next sweep rechecks.
    }
  }
  return cancelled;
}

/** Missing or stale jobs are repaired; a terminal job that left the article pending gets a bounded recovery. */
export async function sweepUngrouped(): Promise<{ enqueued: number; cancelled: number }> {
  await ensureQueue(QUEUES.group);
  const cancelled = await cancelStaleGroupJobs();
  const errors: Array<{ articleId: string; error: Error }> = [];
  const result = await sql.begin(async (tx) => {
    // A failed job keeps its old singleton key forever. The last job's recoveryAttempt lets this
    // sweep create a fresh key, while the cap stops a permanently broken article from retrying forever.
    const rows = await tx<{ id: string; failed_job_id: string | null; recovery_attempt: number }[]>`
      SELECT a.id, latest.id AS failed_job_id, coalesce(latest.recovery_attempt, 0) AS recovery_attempt
      FROM articles a JOIN sources s ON s.id = a.source_id
      LEFT JOIN LATERAL (
        SELECT j.id, j.state, coalesce((j.data->>'recoveryAttempt')::int, 0) AS recovery_attempt
        FROM pgboss.job j
        WHERE j.name = ${QUEUES.group} AND j.data->>'articleId' = a.id
        ORDER BY j.created_on DESC LIMIT 1
      ) latest ON true
      WHERE a.grouping_status = 'pending' AND a.created_at < now() - interval '3 minutes'
        AND a.grouping_receipt_id IS NULL
        AND s.participation_mode = 'editorial' AND a.processing_state = 'analyzed' AND EXISTS (
          SELECT 1 FROM analyses an WHERE an.article_id = a.id AND an.input_revision = a.revision AND an.relevance = 'pass')
        AND NOT EXISTS (SELECT 1 FROM pgboss.job j WHERE j.name = ${QUEUES.group}
          AND j.data->>'articleId' = a.id AND j.state IN ('created', 'active', 'retry'))
      ORDER BY a.created_at LIMIT 100 FOR UPDATE OF a SKIP LOCKED`;
    let enqueued = 0;
    const MAX_RECOVERY_ATTEMPTS = 2;
    for (const row of rows) {
      try {
        const queued = await tx.savepoint(async (sp) => {
          if (row.failed_job_id && row.recovery_attempt >= MAX_RECOVERY_ATTEMPTS) {
            await sp`UPDATE articles SET grouping_status = 'failed', grouping_error = 'grouping job failed after automatic recovery attempts'
                     WHERE id = ${row.id} AND grouping_status = 'pending'`;
            return false;
          }
          const attempt = row.failed_job_id ? row.recovery_attempt + 1 : 0;
          const key = row.failed_job_id ? `auto-repair:${row.id}:${attempt}` : row.id;
          return !!(await enqueue(QUEUES.group, { articleId: row.id, ...(attempt ? { recoveryAttempt: attempt } : {}) },
            { singletonKey: key, priority: -3 }, sp));
        });
        if (queued) enqueued += 1;
      } catch (error) {
        errors.push({ articleId: row.id, error: new Error(String(error)) });
      }
    }
    return { enqueued };
  });
  // Successful repairs are committed even when one article hits a malformed job or a transient pg-boss
  // error; the next five-minute sweep retries only the failed ones.
  if (errors.length) throw new AggregateError(errors.map((item) => item.error), `grouping repair failed for ${errors.map((item) => item.articleId).join(", ")}`);
  return { ...result, cancelled };
}
