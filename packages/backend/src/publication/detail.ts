// Item detail and Markdown export, both behind the same visibility and licence rules.
import type { OutlineEntry, SiteItemDetail, SiteLanguage, StoryRef } from "@aihot/contracts/site";
import { ITEM_COPY, ITEM_COPY_EN, SITE, SITE_EN } from "@aihot/site";
import { bodyToMarkdown } from "../content/markdown.ts";
import { sql } from "../db.ts";
import { proxyBodyImages } from "../media/imgproxy.ts";
import { textToHtml } from "../content/sanitize.ts";
import { exportTranslation, isChineseBody, ITEM_COLUMNS, ITEM_FROM, seatHolders, showsPost, toItemSummary, xView, type ItemRow } from "./items.ts";
import { evidenceCondition, listedCondition } from "./scope.ts";
import { itemUrl } from "./links.ts";
import { hasItemPage, publicSourceName } from "./rules.ts";
import { topicLinks, topicMembership } from "./topics.ts";

interface DetailRow extends ItemRow {
  body_html: string | null;
  body_text: string | null;
  body_status: string;
  tr_html: string | null;
  tr_complete: boolean | null;
  en_body_html: string | null;
  en_body_complete: boolean | null;
  topics: string[];
}

export type DetailResult =
  | { kind: "found"; item: SiteItemDetail; row: DetailRow }
  | { kind: "not_found" };

/** Adds stable ids to h2–h4 and returns the outline. */
function withOutline(html: string): { html: string; outline: OutlineEntry[] } {
  const outline: OutlineEntry[] = [];
  let n = 0;
  const out = html.replace(/<h([2-4])(?: id="sec-\d+")?>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    n += 1;
    const id = `sec-${n}`;
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (text) outline.push({ id, text: text.slice(0, 80), level: Number(level) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, outline };
}

async function loadRow(id: string): Promise<DetailRow | null> {
  const [row] = await sql<DetailRow[]>`
    SELECT ${ITEM_COLUMNS}, a.body_html, a.body_text, a.body_status, tr.body_html AS tr_html, tr.complete AS tr_complete, el.body_html AS en_body_html, el.body_complete AS en_body_complete,
      ${topicMembership()} AS topics
    ${ITEM_FROM}
    WHERE p.article_id = ${id}`;
  return row ?? null;
}

/**
 * The body a page reads in `language` when it has it, else in the other: Chinese is the article's own text
 * or a translation (shown even before it is complete), the original only the article's own. `page` turns
 * the HTML shown into what is sent, with its outline.
 */
function readingBody(
  language: "zh" | "original" | "en",
  zh: { html: string; kind: "translation" | "original" } | null,
  original: string | null,
  english: { html: string; complete: boolean } | null,
  complete: boolean,
  page: (html: string) => { html: string; outline: OutlineEntry[] },
): Pick<SiteItemDetail, "body" | "outline" | "hasTranslation" | "hasEnglishTranslation" | "bodyLanguage"> {
  const bodyLanguage: "zh" | "original" | "en" = language === "en" && english?.html ? "en"
    : language === "original" && original ? "original" : zh?.html ? "zh" : original ? "original" : "zh";
  const shown = bodyLanguage === "en" ? english!.html : bodyLanguage === "zh" ? zh!.html : original;
  const sent = shown ? page(shown) : { html: shown, outline: [] };
  return {
    body: {
      zh: bodyLanguage === "zh" ? sent.html : null,
      original: bodyLanguage === "original" ? sent.html : null,
      en: bodyLanguage === "en" ? sent.html : null,
      zhKind: zh?.kind ?? null,
      complete: bodyLanguage === "en" ? english?.complete ?? false : complete,
    },
    outline: sent.outline,
    hasTranslation: zh?.kind === "translation" && !!zh.html && !!original,
    hasEnglishTranslation: !!english?.html,
    bodyLanguage,
  };
}

/**
 * Public detail (rules.hasItemPage) in one language, Chinese unless the original is asked for: items the
 * lists leave out (low relevance, merged duplicates, no Chinese summary yet) keep a noindex page;
 * withdrawn and hot_signal items are a 404.
 */
export async function loadItemDetail(id: string, language: "zh" | "original" | "en" = "zh", now = new Date()): Promise<DetailResult> {
  const row = await loadRow(id);
  if (!row || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return { kind: "not_found" };

  const summary = toItemSummary(row, language === "en" ? "en" : "zh");
  if (row.visibility === "summary-only") {
    const item: SiteItemDetail = {
      ...summary,
      selected: false,
      score: null,
      category: null,
      story: null,
      reason: null,
      tags: [],
      x: null,
      readingMode: "summary-only",
      author: null,
      body: null,
      outline: [],
      relatedStories: [],
      topics: [],
      indexable: false,
      markdownAvailable: false,
      group: null,
      hasTranslation: false,
      hasEnglishTranslation: false,
      bodyLanguage: "original",
    };
    return { kind: "found", item, row };
  }

  const related = await sql<StoryRef[]>`
    SELECT DISTINCT st.public_id::text AS "publicId", st.title
    FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id JOIN stories st ON st.id = f.story_id
    WHERE fa.article_id = ${id} AND fa.role <> 'mention' AND st.merged_into IS NULL
    ORDER BY "publicId" LIMIT 6`;

  let x: SiteItemDetail["x"] = null;
  let reading: Pick<SiteItemDetail, "body" | "outline" | "hasTranslation" | "hasEnglishTranslation" | "bodyLanguage"> = { body: null, outline: [], hasTranslation: false, hasEnglishTranslation: false, bodyLanguage: "original" };
  if (showsPost(row)) {
    const post = xView(row, false, true, language === "en" ? "en" : "zh");
    const text = String(row.x_post?.text ?? row.body_text ?? "");
    const englishText = row.en_body_text?.trim() ?? "";
    // A post's text is sent as written: its headings make the outline, without anchors.
    reading = readingBody(language, post?.translation ? { html: textToHtml(post.translation), kind: "translation" } : null, text ? textToHtml(text) : null,
      englishText ? { html: textToHtml(englishText), complete: true } : null, true,
      (html) => ({ html, outline: withOutline(html).outline }));
    if (post) {
      const { text: _text, translation: _translation, ...shown } = post;
      x = shown;
    }
  } else if (row.body_mode === "full" && row.body_html) {
    const chinese = isChineseBody(row);
    const zh = chinese ? { html: row.body_html, kind: "original" as const } : row.tr_html ? { html: row.tr_html, kind: "translation" as const } : null;
    const english = row.en_body_html ? { html: row.en_body_html, complete: row.en_body_complete ?? false } : null;
    reading = readingBody(language, zh, chinese ? null : row.body_html, english, chinese ? true : row.tr_complete ?? false, (html) => withOutline(proxyBodyImages(html)));
  }

  let group: SiteItemDetail["group"] = null;
  if (row.fact_id) {
    const [g] = await sql<{ public_id: string; reports: number; sources: number }[]>`
      SELECT f.public_id, count(p.article_id) AS reports, count(DISTINCT p.source_id) AS sources
      FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.id = ${row.fact_id} AND ${evidenceCondition()} AND ${listedCondition(now)}
      GROUP BY f.public_id`;
    if (g) {
      group = {
        factId: g.public_id,
        reportCount: Number(g.reports),
        additionalSourceCount: Math.max(0, Number(g.sources) - 1),
      };
    }
  }

  // The reason goes with the seat; a report yielding it points to the one holding it.
  const sameEvent = (await seatHolders([row], now, sql, language === "en" ? "en" : "zh")).get(row.id) ?? null;
  const item: SiteItemDetail = {
    ...summary,
    x,
    ...(sameEvent ? { reason: null, sameEvent } : {}),
    readingMode: "full",
    author: row.author,
    body: reading.body,
    outline: reading.outline,
    relatedStories: related,
    topics: topicLinks(row.topics, language === "en" ? "en" : "zh"),
    indexable: row.indexable,
    markdownAvailable: markdownAvailable(row),
    group,
    hasTranslation: reading.hasTranslation,
    hasEnglishTranslation: reading.hasEnglishTranslation,
    bodyLanguage: reading.bodyLanguage,
  };
  return { kind: "found", item, row };
}

/**
 * Same predicate for the export button and the export route: a public page with something to export
 * (a summary, the post where pages show it, or a full-text body).
 */
export function markdownAvailable(row: {
  visibility: string; source_mode: string; summary: string | null; body_mode: string; body_html?: string | null; channel: string; x_post: Record<string, any> | null;
}): boolean {
  if (row.visibility !== "public" || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return false;
  return !!row.summary || (showsPost(row) && !!row.x_post?.text) || (row.body_mode === "full" && !!row.body_html);
}

export async function exportMarkdown(id: string, lang: SiteLanguage = "zh"): Promise<{ filename: string; body: string } | null> {
  const row = await loadRow(id);
  if (!row || !markdownAvailable(row)) return null;
  const en = lang === "en";
  const summaryRow = toItemSummary(row, lang);
  const lines: string[] = [];
  lines.push(`# ${summaryRow.title}`, "");
  if (row.original_title) lines.push(`> ${en ? "Original title" : "原标题"}：${row.original_title}`, "");
  lines.push(`- ${en ? "Source" : "来源"}：${publicSourceName(row.source_name)}`);
  // Without a reliable date from the original, the time it was collected says so.
  lines.push(row.published_at ? `- ${en ? "Published" : "发布时间"}：${row.published_at.toISOString()}` : `- ${en ? "Collected" : "收录时间"}：${row.discovered_at.toISOString()}`);
  lines.push(`- ${en ? SITE_EN.name : SITE.name}：${itemUrl(row.id)}${en ? "?lang=en" : ""}`);
  lines.push(`- ${en ? "Original" : "原文"}：${row.url}`, "");
  if (summaryRow.summary) lines.push(`## ${en ? "Summary" : "摘要"}`, "", summaryRow.summary, "");
  if (row.selected && row.seat && summaryRow.reason) lines.push(`## ${en ? ITEM_COPY_EN.reasonLabel : ITEM_COPY.reasonLabel}`, "", summaryRow.reason, "");
  if (showsPost(row) && row.x_post?.text) {
    lines.push(`## ${en ? "Post" : "正文"}`, "", String(en ? row.en_body_text ?? row.x_post.text : row.x_post.text), "");
    if (row.zh_text && !en) lines.push("## 中文译文", "", row.zh_text, "");
    const q = row.x_post.quoted as { handle?: string; text?: string; url?: string } | null | undefined;
    if (q?.text) lines.push(`## 引用 @${q.handle ?? ""}`, "", ...String(q.text).split("\n").map((l) => `> ${l}`), "", ...(q.url ? [q.url, ""] : []));
    if (q?.text && row.quoted_zh && !en) lines.push("### 引用中文译文", "", ...row.quoted_zh.split("\n").map((l) => `> ${l}`), "");
  } else if (row.body_mode === "full" && row.body_html) {
    if (en) {
      if (row.en_body_html) lines.push("## Article text · English", "", bodyToMarkdown(row.en_body_html, row.url), "");
      else lines.push(isChineseBody(row) ? "## Article text · Chinese" : "## Article text · Original language", "", bodyToMarkdown(row.body_html, row.url), "");
      return { filename: `${SITE.mcpPrefix}-${row.id}.md`, body: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
    }
    const translation = exportTranslation(row);
    if (translation) lines.push("## 正文 · 中文译文", "", bodyToMarkdown(translation, row.url), "");
    lines.push(isChineseBody(row) ? "## 正文" : "## 正文 · 原文", "", bodyToMarkdown(row.body_html, row.url), "");
  }
  return { filename: `${SITE.mcpPrefix}-${row.id}.md`, body: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
}
