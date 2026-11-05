// English report projections. Item titles and summaries are copied from publication_localizations; the
// report structure, ordering, IDs and metrics stay exactly the Chinese edition. No model call is needed:
// daily editions have no prose of their own, and weekly/monthly prose is replaced by a bounded English
// overview generated from the same ordered entries. Recent reports are refreshed after article
// localizations arrive, so a report never freezes a partial fallback forever.
import { SECTION_LABELS } from "@aihot/contracts/taxonomy";
import { SITE_EN } from "@aihot/site";
import { sql } from "../db.ts";

type Content = Record<string, any>;

interface LocalizedItem {
  id: string;
  title: string;
  summary: string | null;
}

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

export interface ReportLocalizeResult {
  reportId: number;
  kind: "daily" | "weekly" | "monthly";
  key: string;
}

function localizedEntry(raw: Record<string, any>, items: Map<string, LocalizedItem>): Record<string, any> {
  const out = { ...raw };
  const found = raw.itemId ? items.get(String(raw.itemId)) : null;
  if (found) {
    out.title = found.title;
    if (found.summary !== null) out.summary = found.summary;
  }
  if (Array.isArray(raw.related)) out.related = raw.related.map((entry: Record<string, any>) => localizedEntry(entry, items));
  return out;
}

function englishOverview(kind: "weekly" | "monthly", titles: string[]): string | null {
  const shown = titles.filter(Boolean).slice(0, 3);
  if (!shown.length) return null;
  const span = kind === "weekly" ? "This week" : "This month";
  const noun = titles.length === 1 ? "story" : "stories";
  return `${span} ${titles.length} ${noun} shaped the agenda. The most closely followed: ${shown.join("; ")}.`;
}

export function englishReportContent(kind: "daily" | "weekly" | "monthly", key: string, content: Content, items: Map<string, LocalizedItem>): Content {
  if (kind === "daily") {
    const out: Content = { ...content };
    if (content.lead) {
      const lead = content.leadItemId ? items.get(String(content.leadItemId)) : null;
      out.lead = {
        ...content.lead,
        title: lead?.title ?? content.lead.title,
        leadParagraph: lead?.summary ?? content.lead.leadParagraph,
      };
    }
    out.sections = (content.sections ?? []).map((section: Record<string, any>) => ({
      ...section,
      label: SECTION_LABELS[String(section.label)] ?? section.label,
      items: (section.items ?? []).map((entry: Record<string, any>) => localizedEntry(entry, items)),
    }));
    out.flashes = (content.flashes ?? []).map((entry: Record<string, any>) => localizedEntry(entry, items));
    return out;
  }

  const themes = (content.themes ?? []).map((theme: Record<string, any>) => ({
    ...theme,
    heading: SECTION_LABELS[String(theme.heading)] ?? theme.heading,
    summary: null,
    storyRefs: (theme.storyRefs ?? []).map((entry: Record<string, any>) => localizedEntry(entry, items)),
  }));
  const ordered: LocalizedItem[] = (content.storyOrder ?? []).map((id: string) => items.get(String(id))).filter((item: LocalizedItem | undefined): item is LocalizedItem => !!item);
  const lead = content.leadItemId ? items.get(String(content.leadItemId)) : ordered[0];
  const title = `${SITE_EN.name} ${kind === "weekly" ? "Weekly" : "Monthly"} · ${key}`;
  return {
    ...content,
    title,
    headline: lead?.title ?? content.headline,
    leadItemId: lead ? String(content.leadItemId ?? ordered[0]?.id ?? "") || null : content.leadItemId,
    overview: englishOverview(kind, ordered.map((item) => item.title)),
    themes,
  };
}

async function localizedItems(ids: string[]): Promise<Map<string, LocalizedItem>> {
  if (!ids.length) return new Map();
  const rows = await sql<{ id: string; title: string; summary: string | null }[]>`
    SELECT p.article_id AS id, coalesce(l.title, p.original_title, p.title) AS title,
      coalesce(l.summary, a.excerpt, p.summary) AS summary
    FROM publications p JOIN articles a ON a.id = p.article_id
    LEFT JOIN publication_localizations l ON l.article_id = p.article_id AND l.lang = 'en' AND l.revision >= a.revision
    WHERE p.article_id = ANY(${ids}::text[])`;
  return new Map(rows.map((row) => [row.id, { id: row.id, title: row.title, summary: row.summary }]));
}

function itemIds(content: Content): string[] {
  const entries = [
    ...(content.sections ?? []).flatMap((section: Record<string, any>) => section.items ?? []),
    ...(content.flashes ?? []),
    ...(content.themes ?? []).flatMap((theme: Record<string, any>) => theme.storyRefs ?? []),
  ];
  return [...new Set(entries.flatMap((entry: Record<string, any>) => [entry.itemId, ...(entry.related ?? []).map((related: Record<string, any>) => related.itemId)]).filter(Boolean).map(String))] as string[];
}

/** Rebuild English copies for recent reports and any report that has never had one. */
export async function localizePendingReports(opts: { limit?: number } = {}): Promise<{ done: ReportLocalizeResult[] }> {
  const rows = await sql<Array<{ id: number; kind: "daily" | "weekly" | "monthly"; key: string; revision: number; content: Content; en_revision: number | null }>>`
    WITH citations AS (${REPORT_CITATIONS})
    SELECT r.id, r.kind, r.key, r.revision, r.content, l.revision AS en_revision
    FROM reports r
    LEFT JOIN report_localizations l ON l.report_id = r.id AND l.lang = 'en'
    WHERE l.report_id IS NULL OR l.revision < r.revision OR r.generated_at > now() - interval '14 days'
      OR EXISTS (
        SELECT 1
        FROM citations c
        JOIN publications p ON p.article_id = c.article_id
        JOIN articles a ON a.id = p.article_id
        LEFT JOIN publication_localizations pl
          ON pl.article_id = p.article_id AND pl.lang = 'en' AND pl.revision >= a.revision
        WHERE c.report_id = r.id AND p.visibility = 'public' AND pl.article_id IS NULL
      )
    ORDER BY r.generated_at DESC
    LIMIT ${opts.limit ?? 80}`;
  const done: ReportLocalizeResult[] = [];
  for (const row of rows) {
    const items = await localizedItems(itemIds(row.content));
    const content = englishReportContent(row.kind, row.key, row.content, items);
    await sql`
      INSERT INTO report_localizations(report_id, lang, revision, content, origin)
      VALUES(${row.id}, 'en', ${row.revision}, ${sql.json(content as never)}, 'model')
      ON CONFLICT(report_id, lang) DO UPDATE SET revision = EXCLUDED.revision, content = EXCLUDED.content, origin = EXCLUDED.origin, updated_at = now()
      WHERE report_localizations.revision <= EXCLUDED.revision`;
    done.push({ reportId: row.id, kind: row.kind, key: row.key });
  }
  return { done };
}
