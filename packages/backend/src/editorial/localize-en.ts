// English localization of selected public reports: title, summary and reason in one editor call, then
// the licensed full text block by block. Readers never translate on page view. Every model call goes
// through the normal receipt and budget path, and failed bodies can be retried without paying twice for
// the already stored copy.
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { z } from "zod";
import { sql } from "../db.ts";
import { sanitizeBody, textToHtml } from "../content/sanitize.ts";
import { chatJson } from "../providers/llm.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { modelFor } from "./models.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { segmentsOf, shield, unshield } from "./translate.ts";

export const LOCALIZE_EN_PROMPT_VERSION = promptVersion("localize-en", "translate-en-body");
const SYSTEM_COPY = promptText("localize-en");
const SYSTEM_BODY = promptText("translate-en-body");
const BATCH_CHARS = 3500;
const MAX_CHARS = 60_000;

/** Every article cited by a report, including report-only supplements and related reports. */
const REPORT_CITATIONS = sql`
  SELECT r.id AS report_id, j #>> '{}' AS article_id
  FROM reports r CROSS JOIN LATERAL jsonb_path_query(r.content, '$.**.itemId') j
  WHERE jsonb_typeof(j) = 'string'
  UNION
  SELECT r.id, value
  FROM reports r CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(r.content->'storyOrder') = 'array' THEN r.content->'storyOrder' ELSE '[]'::jsonb END
  ) value
  UNION
  SELECT r.id, value
  FROM reports r CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(r.content->'highlights') = 'array' THEN r.content->'highlights' ELSE '[]'::jsonb END
  ) value
`;

const CopySchema = z.object({
  title: z.string().trim().min(1).max(600),
  summary: z.string().trim().max(4000).nullable().catch(null),
  reason: z.string().trim().max(2000).nullable().catch(null),
});
const SegmentsSchema = z.object({ t: z.array(z.string()) });

type Pending = {
  article_id: string;
  revision: number;
  title: string;
  summary: string | null;
  reason: string | null;
  body_mode: "full" | "summary";
  channel: "news" | "x";
  language: string | null;
  body_html: string | null;
  body_text: string | null;
  x_post: { text?: string } | null;
  zh_html: string | null;
  en_title: string | null;
  en_summary: string | null;
  en_reason: string | null;
  en_body_html: string | null;
  en_body_text: string | null;
  en_body_complete: boolean | null;
  en_revision: number | null;
};

export interface LocalizeResult {
  articleId: string;
  revision: number;
  status: "translated" | "partial" | "skipped";
  reason?: string;
  bodySegments?: number;
}

class LocalizationInterruptedError extends Error {}

function translatedText(html: string): string {
  return cheerio.load(html, null, false).root().text().replace(/\s+/g, " ").trim();
}

async function callSegments(articleId: string, revision: number, index: number, parts: string[], attemptTag?: string): Promise<string[] | null> {
  if (shutdownSignal.signal.aborted) throw new LocalizationInterruptedError("worker shutting down");
  const model = await modelFor("translate");
  const response = await chatJson({
    model,
    purpose: "translate_body_en",
    subject: `article:${articleId}@${revision}:en#${index}`,
    promptVersion: LOCALIZE_EN_PROMPT_VERSION,
    system: SYSTEM_BODY,
    user: JSON.stringify({ segments: parts }),
    schema: SegmentsSchema,
    temperature: 0.2,
    maxTokens: Math.min(8000, Math.ceil(parts.join("").length * 1.5) + 500),
    timeoutMs: 180_000,
    attemptTag,
  });
  return response.data.t.length === parts.length ? response.data.t : null;
}

async function translateParts(articleId: string, revision: number, parts: string[], attemptTag?: string): Promise<Array<string | null>> {
  const out: Array<string | null> = new Array(parts.length).fill(null);
  let start = 0;
  let index = 0;
  while (start < parts.length) {
    let end = start;
    let chars = 0;
    while (end < parts.length && (end === start || chars + parts[end]!.length <= BATCH_CHARS)) chars += parts[end++]!.length;
    const batch = parts.slice(start, end);
    let done = await callSegments(articleId, revision, index++, batch, attemptTag);
    if (!done && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      const left = await callSegments(articleId, revision, index++, batch.slice(0, mid), attemptTag);
      const right = await callSegments(articleId, revision, index++, batch.slice(mid), attemptTag);
      done = left && right ? [...left, ...right] : null;
    }
    if (done) done.forEach((text, n) => (out[start + n] = text));
    start = end;
  }
  return out;
}

async function translateHtml(articleId: string, revision: number, html: string): Promise<{ html: string; text: string; complete: boolean; segments: number }> {
  const $ = cheerio.load(html, null, false);
  const blocks = segmentsOf($);
  if (!blocks.length) return { html, text: translatedText(html), complete: true, segments: 0 };
  let budget = MAX_CHARS;
  const chosen: Element[] = [];
  for (const block of blocks) {
    const source = $(block).html() ?? "";
    if (source.length > budget) break;
    budget -= source.length;
    chosen.push(block);
  }
  const shielded = chosen.map((block) => shield($(block).html() ?? ""));
  const restore = (answers: Array<string | null>) => answers.map((answer, i) => answer === null ? null : unshield(answer, shielded[i]!));
  const translated = restore(await translateParts(articleId, revision, shielded.map((block) => block.html)));
  const missing = translated.flatMap((value, i) => value === null ? [i] : []);
  if (missing.length) {
    const retry = await translateParts(articleId, revision, missing.map((i) => shielded[i]!.html), "retry");
    missing.forEach((i, n) => (translated[i] = retry[n] ? unshield(retry[n]!, shielded[i]!) : null));
  }
  let done = 0;
  chosen.forEach((block, i) => {
    const value = translated[i];
    if (value) {
      $(block).html(value);
      done += 1;
    }
  });
  const result = sanitizeBody($.html());
  return { html: result, text: translatedText(result), complete: done === blocks.length, segments: done };
}

async function translatePost(articleId: string, revision: number, text: string): Promise<{ html: string; text: string; complete: boolean; segments: number }> {
  const [value] = await translateParts(articleId, revision, [text]);
  if (!value) return { html: textToHtml(text), text, complete: false, segments: 0 };
  return { html: textToHtml(value), text: value, complete: true, segments: 1 };
}

function recordAttempt(row: Pending, outcome: LocalizeResult["status"] | "failed", reason: string | null): Promise<unknown> {
  return sql`
    INSERT INTO localization_attempts(entity_kind, entity_id, lang, revision, attempts, outcome, reason)
    VALUES('publication', ${row.article_id}, 'en', ${row.revision}, 1, ${outcome}, ${reason})
    ON CONFLICT(entity_kind, entity_id, lang) DO UPDATE SET
      attempts = CASE WHEN localization_attempts.revision = EXCLUDED.revision THEN localization_attempts.attempts + 1 ELSE 1 END,
      revision = EXCLUDED.revision, outcome = EXCLUDED.outcome, reason = EXCLUDED.reason, updated_at = now()`;
}

async function localize(row: Pending): Promise<LocalizeResult> {
  let copy = row.en_revision === row.revision && row.en_title
    ? { title: row.en_title, summary: row.en_summary, reason: row.en_reason }
    : null;
  if (!copy) {
    const model = await modelFor("translate");
    const response = await chatJson({
      model,
      purpose: "localize_article_en",
      subject: `article:${row.article_id}@${row.revision}:en-copy`,
      promptVersion: LOCALIZE_EN_PROMPT_VERSION,
      system: SYSTEM_COPY,
      user: JSON.stringify({ title: row.title, summary: row.summary, reason: row.reason }),
      schema: CopySchema,
      temperature: 0.2,
      maxTokens: 2200,
      timeoutMs: 120_000,
    });
    copy = response.data;
  }

  const postText = String(row.x_post?.text ?? row.body_text ?? "").trim();
  const bodyRequired = row.body_mode === "full" && (row.channel === "x" ? !!postText : !!(row.body_html || row.zh_html));
  let bodyHtml: string | null = row.en_revision === row.revision ? row.en_body_html : null;
  let bodyText: string | null = row.en_revision === row.revision ? row.en_body_text : null;
  let bodyComplete = row.en_revision === row.revision ? row.en_body_complete ?? false : false;
  let bodySegments = 0;

  if (bodyRequired && !bodyHtml) {
    const englishSource = row.language === "en";
    if (row.channel === "x") {
      const result = englishSource
        ? { html: textToHtml(postText), text: postText, complete: true, segments: 1 }
        : await translatePost(row.article_id, row.revision, postText);
      bodyHtml = result.html;
      bodyText = result.text;
      bodyComplete = result.complete;
      bodySegments = result.segments;
    } else {
      const source = row.body_html ?? row.zh_html;
      if (source) {
        if (englishSource) {
          const clean = sanitizeBody(source);
          bodyHtml = clean;
          bodyText = translatedText(clean);
          bodyComplete = true;
        } else {
          const result = await translateHtml(row.article_id, row.revision, source);
          bodyHtml = result.html;
          bodyText = result.text;
          bodyComplete = result.complete;
          bodySegments = result.segments;
        }
      }
    }
  } else if (!bodyRequired) {
    bodyComplete = true;
  }

  await sql`
    INSERT INTO publication_localizations(article_id, lang, revision, title, summary, reason, body_html, body_text, body_complete, origin)
    VALUES(${row.article_id}, 'en', ${row.revision}, ${copy.title}, ${copy.summary}, ${copy.reason}, ${bodyHtml}, ${bodyText}, ${bodyComplete}, 'model')
    ON CONFLICT(article_id, lang) DO UPDATE SET
      revision = EXCLUDED.revision, title = EXCLUDED.title, summary = EXCLUDED.summary, reason = EXCLUDED.reason,
      body_html = EXCLUDED.body_html, body_text = EXCLUDED.body_text, body_complete = EXCLUDED.body_complete,
      origin = EXCLUDED.origin, updated_at = now()
    WHERE publication_localizations.revision <= EXCLUDED.revision`;
  return { articleId: row.article_id, revision: row.revision, status: bodyComplete ? "translated" : "partial", bodySegments };
}

/** Fill English localizations for selected public reports, newest first, within a bounded run. */
export async function localizePendingEnglish(opts: { limit?: number; budgetMs?: number } = {}): Promise<{ done: LocalizeResult[] }> {
  const started = Date.now();
  const configuredLimit = Number(process.env.LOCALIZE_EN_LIMIT ?? "");
  const limit = opts.limit ?? (Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20);
  const rows = await sql<Pending[]>`
    WITH citations AS (${REPORT_CITATIONS})
    SELECT p.article_id, p.title, p.summary, p.reason, p.body_mode, p.channel,
      a.revision, a.language, a.body_html, a.body_text, a.x_post, tr.body_html AS zh_html,
      l.title AS en_title, l.summary AS en_summary, l.reason AS en_reason,
      l.body_html AS en_body_html, l.body_text AS en_body_text, l.body_complete AS en_body_complete, l.revision AS en_revision
    FROM publications p
    JOIN articles a ON a.id = p.article_id
    LEFT JOIN translations tr ON tr.article_id = p.article_id AND tr.lang = 'zh' AND tr.revision >= a.revision
    LEFT JOIN publication_localizations l ON l.article_id = p.article_id AND l.lang = 'en'
    LEFT JOIN localization_attempts t ON t.entity_kind = 'publication' AND t.entity_id = p.article_id AND t.lang = 'en'
    WHERE p.visibility = 'public'
      AND (p.selected OR p.article_id IN (SELECT article_id FROM citations))
      AND (
        l.article_id IS NULL OR l.revision < a.revision OR
        (p.body_mode = 'full' AND coalesce(l.body_complete, false) = false AND (a.body_html IS NOT NULL OR tr.body_html IS NOT NULL OR a.x_post->>'text' IS NOT NULL))
      )
      AND (t.entity_id IS NULL OR t.revision < a.revision OR (t.outcome IN ('failed', 'partial') AND t.attempts < 3))
    ORDER BY p.discovered_at DESC, p.article_id DESC
    LIMIT ${limit}`;
  const done: LocalizeResult[] = [];
  for (const row of rows) {
    if (Date.now() - started > (opts.budgetMs ?? 4 * 60_000) || shutdownSignal.signal.aborted) break;
    try {
      const result = await localize(row);
      done.push(result);
      await recordAttempt(row, result.status, result.reason ?? null);
    } catch (error) {
      if (error instanceof LocalizationInterruptedError) break;
      const message = (error as Error).message;
      if (/disabled|not configured|budget/i.test(message)) break;
      done.push({ articleId: row.article_id, revision: row.revision, status: "skipped", reason: message.slice(0, 240) });
      await recordAttempt(row, "failed", message.slice(0, 300));
    }
  }
  return { done };
}

export function isEnglishLocalizationCurrent(row: { language?: string | null; en_revision?: number | null; revision?: number | null }): boolean {
  return row.en_revision !== null && row.en_revision !== undefined && row.revision !== null && row.revision !== undefined && row.en_revision >= row.revision;
}

export function englishBodyText(row: { en_body_text?: string | null; body_text?: string | null }): string {
  return collapseWhitespace(row.en_body_text ?? row.body_text ?? "");
}
