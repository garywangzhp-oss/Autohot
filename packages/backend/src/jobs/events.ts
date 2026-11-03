// Event jobs: serial grouping, debounced digests.
import type { PgBoss } from "pg-boss";
import { groupArticle } from "../events/group.ts";
import { composeStoryDigest } from "../events/digest.ts";
import { settleNonEditorial } from "./content.ts";
import { enqueue, ensureQueue, QUEUES, work } from "./queue.ts";
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

/** Missing jobs are repaired; a terminal job that left the article pending gets a bounded recovery. */
export async function sweepUngrouped(): Promise<{ enqueued: number }> {
  await ensureQueue(QUEUES.group);
  return sql.begin(async (tx) => {
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
      if (row.failed_job_id && row.recovery_attempt >= MAX_RECOVERY_ATTEMPTS) {
        await tx`UPDATE articles SET grouping_status = 'failed', grouping_error = 'grouping job failed after automatic recovery attempts'
                 WHERE id = ${row.id} AND grouping_status = 'pending'`;
        continue;
      }
      const attempt = row.failed_job_id ? row.recovery_attempt + 1 : 0;
      const key = row.failed_job_id ? `auto-repair:${row.id}:${attempt}` : row.id;
      if (await enqueue(QUEUES.group, { articleId: row.id, ...(attempt ? { recoveryAttempt: attempt } : {}) }, { singletonKey: key }, tx)) enqueued += 1;
    }
    return { enqueued };
  });
}
