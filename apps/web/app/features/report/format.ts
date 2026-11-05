// Names, dates and grouping for daily, weekly and monthly reports.
import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { beijingDate, beijingWeekday, isoWeekLabel, isoWeekRange } from "@aihot/contracts/time";
import { EDITION_WHEN, REPORTS, SITE, subjectAfter } from "@aihot/site";
import { RELEASE } from "@aihot/industry/taxonomy";
import { monthDay, weekdayShort } from "../../lib/format.ts";
import type { SiteLanguage } from "@aihot/contracts/site";

export const KINDS: ReportKind[] = ["daily", "weekly", "monthly"];
export const KIND_PATH: Record<ReportKind, string> = { daily: "/daily", weekly: "/weekly", monthly: "/monthly" };
export const KIND_LABEL: Record<ReportKind, string> = { daily: "日报", weekly: "周报", monthly: "月报" };
export const KIND_LABEL_EN: Record<ReportKind, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
export const kindLabel = (kind: ReportKind, lang: "zh" | "en"): string => lang === "en" ? KIND_LABEL_EN[kind] : KIND_LABEL[kind];

export function kindFromPath(pathname: string): ReportKind {
  if (pathname.startsWith("/weekly")) return "weekly";
  if (pathname.startsWith("/monthly")) return "monthly";
  return "daily";
}

/** The kind's RSS feed, announced in the page head so a reader given the page finds it. */
export const feedLink = (kind: ReportKind, lang: SiteLanguage = "zh") => ({ tagName: "link", rel: "alternate", type: "application/rss+xml", title: lang === "en" ? `AutoHot ${KIND_LABEL_EN[kind]}` : `${SITE.name} ${KIND_LABEL[kind]}`, href: `/feed/${kind}.xml` }) as const;

export function reportPath(kind: ReportKind, key: string): string {
  return `${KIND_PATH[kind]}/${key}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

const { measure, noun } = REPORTS.entry;
/** "件大事": what an issue counts its entries in, in the site's words (REPORTS.entry). */
export const ENTRIES_UNIT = `${measure}${noun}`;
export const entriesUnit = (lang: SiteLanguage = "zh") => lang === "en" ? "stories" : ENTRIES_UNIT;

/** "这一天的 4 件 AI 大事" / "本周的 12 件 AI 大事" / "8 月的 20 件 AI 大事" (the subject and REPORTS.entry from site/site.ts). */
export function headline(kind: ReportKind, key: string, count: number, lang: SiteLanguage = "zh"): string {
  if (lang === "en") {
    if (kind === "daily") return `${count} automotive ${count === 1 ? "story" : "stories"} from the day`;
    if (kind === "weekly") return `${count} automotive ${count === 1 ? "story" : "stories"} from the week`;
    return `${count} automotive ${count === 1 ? "story" : "stories"} from ${new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(`${key}-01T12:00:00+08:00`))}`;
  }
  if (kind === "daily") return subjectAfter(`这一天的 ${count} ${measure}`, noun);
  if (kind === "weekly") return subjectAfter(`本周的 ${count} ${measure}`, noun);
  return subjectAfter(`${Number(key.slice(5, 7))} 月的 ${count} ${measure}`, noun);
}

/** "09.16" for a story inside a week or month. */
export function shortDay(iso: string): string {
  return beijingDate(iso).slice(5).replace("-", ".");
}

export interface ArchiveGroup {
  id: string;
  label: string;
  entries: Array<ReportNavigationEntry & { short: string }>;
}

/**
 * The archive column: days grouped by month, weeks by the month their Monday falls in ("第2周"),
 * months by year. Newest first, as the index comes.
 */
export function archiveGroups(kind: ReportKind, index: ReportNavigationEntry[], lang: SiteLanguage = "zh"): ArchiveGroup[] {
  const groups: ArchiveGroup[] = [];
  const push = (id: string, label: string, e: ReportNavigationEntry & { short: string }) => {
    const g = groups[groups.length - 1];
    if (g && g.id === id) g.entries.push(e);
    else groups.push({ id, label, entries: [e] });
  };
  if (kind === "weekly") {
    const byMonth = new Map<string, string[]>();
    for (const e of index) {
      const m = isoWeekRange(e.key)!.start.slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), e.key]);
    }
    for (const e of index) {
      const m = isoWeekRange(e.key)!.start.slice(0, 7);
      const weeks = [...byMonth.get(m)!].sort();
      push(m, lang === "en" ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(new Date(`${m}-01T12:00:00+08:00`)) : `${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月`, { ...e, short: lang === "en" ? `Week ${weeks.indexOf(e.key) + 1}` : `第${weeks.indexOf(e.key) + 1}周` });
    }
    return groups;
  }
  for (const e of index) {
    if (kind === "daily") push(e.key.slice(0, 7), lang === "en" ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(new Date(`${e.key.slice(0, 7)}-01T12:00:00+08:00`)) : `${e.key.slice(0, 4)} 年 ${Number(e.key.slice(5, 7))} 月`, { ...e, short: lang === "en" ? monthDay(e.key, "en") : `${Number(e.key.slice(8, 10))} 日` });
    else push(e.key.slice(0, 4), lang === "en" ? e.key.slice(0, 4) : `${e.key.slice(0, 4)} 年`, { ...e, short: lang === "en" ? new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${e.key}-01-01T12:00:00+08:00`)) : `${Number(e.key.slice(5, 7))} 月` });
  }
  return groups;
}

/** An issue's mark in the archive column: a large number over a small word (a month's number stands alone). */
export function archiveMark(kind: ReportKind, key: string, lang: SiteLanguage = "zh"): { big: string; small: string | null } {
  if (kind === "daily") return { big: key.slice(8, 10), small: weekdayShort(key, lang) };
  if (kind === "weekly") {
    const { start } = isoWeekRange(key)!;
    return { big: key.slice(6), small: lang === "en" ? `from ${start.slice(5).replace("-", ".")}` : `${Number(start.slice(5, 7))}.${Number(start.slice(8, 10))} 起` };
  }
  return { big: key.slice(5, 7), small: null };
}

/** Short chip label for the phone switcher: "今天", "9月26日", "9月第2周", "8 月". */
export function chipLabel(kind: ReportKind, key: string, index: ReportNavigationEntry[], today: string, lang: SiteLanguage = "zh"): string {
  if (kind === "daily") return key === today ? (lang === "en" ? "Today" : "今天") : monthDay(key, lang);
  if (kind === "monthly") return lang === "en" ? new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${key}-01-01T12:00:00+08:00`)) : `${Number(key.slice(5, 7))} 月`;
  const group = archiveGroups("weekly", index, lang).find((g) => g.entries.some((e) => e.key === key));
  const entry = group?.entries.find((e) => e.key === key);
  return group && entry ? (lang === "en" ? `${new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${group.id}-01T12:00:00+08:00`))} · ${entry.short}` : `${Number(group.id.slice(5))}月${entry.short}`) : key;
}

/**
 * "第 N 期": the issue's place in its series as the server counts it over every issue. The navigation
 * index holds only the newest issues, so its length cannot tell.
 */
export function issueNumber(index: ReportNavigationEntry[], key: string): number | null {
  return index.find((e) => e.key === key)?.issueNumber ?? null;
}

/** The masthead's date block: a large figure and two small lines beside it. */
export function dateMark(kind: ReportKind, key: string, lang: SiteLanguage = "zh"): { figure: string; top: string; bottom: string } {
  if (kind === "daily") return lang === "en"
    ? { figure: key.slice(8, 10), top: new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(new Date(`${key}T12:00:00+08:00`)), bottom: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${key}T12:00:00+08:00`)) }
    : { figure: key.slice(8, 10), top: `${key.slice(0, 4)} 年 ${Number(key.slice(5, 7))} 月`, bottom: beijingWeekday(key) };
  if (kind === "weekly") {
    const { start, end } = isoWeekRange(key)!;
    return { figure: key.slice(6), top: lang === "en" ? `${key.slice(0, 4)} · Week ${Number(key.slice(6))}` : `${key.slice(0, 4)} 年第 ${Number(key.slice(6))} 周`, bottom: `${start.slice(5).replace("-", ".")} — ${end.slice(5).replace("-", ".")}` };
  }
  return { figure: key.slice(5, 7), top: key.slice(0, 4), bottom: lang === "en" ? new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(`${key}-01T12:00:00+08:00`)) : `${Number(key.slice(5, 7))} 月` };
}

/** When each kind comes out, for the masthead (the times are the site's, EDITION_WHEN). */
export const EDITION: Record<ReportKind, string> = { daily: `${EDITION_WHEN.daily} 出刊`, weekly: "每周一出刊", monthly: "每月 1 日出刊" };
export const EDITION_EN: Record<ReportKind, string> = { daily: "Published daily at 08:00", weekly: "Published every Monday", monthly: "Published on the 1st" };

/**
 * The masthead's figures, in the order a reader wants them, in the site's words (REPORTS). Releases of the
 * pack's headline launch kind (RELEASE, "个新模型" for AI) count only where the pack has one; zero is left out.
 */
const UNITS = REPORTS.metricUnits;
const METRICS: Array<[key: string, unit: string]> = [
  ["totalEvents", ENTRIES_UNIT],
  ["totalStories", ENTRIES_UNIT],
  ["sourcesCount", UNITS.sourcesCount],
  ["firstPartyEvents", UNITS.firstPartyEvents],
  ...(RELEASE ? [["modelsReleased", RELEASE.unit] as [string, string]] : []),
  ["selectedCount", UNITS.selectedCount],
  ["reportsCovered", UNITS.reportsCovered],
];
export function metricItems(metrics: Record<string, number>, lang: SiteLanguage = "zh"): Array<{ value: number; unit: string }> {
  const units = lang === "en" ? { totalEvents: "stories", totalStories: "stories", sourcesCount: "sources", firstPartyEvents: "first-party reports", modelsReleased: "new models", selectedCount: "featured stories", reportsCovered: "daily editions" } : Object.fromEntries(METRICS) as Record<string, string>;
  return METRICS.filter(([k]) => typeof metrics[k] === "number" && (k !== "modelsReleased" || metrics[k]! > 0)).map(([k]) => ({ value: metrics[k]!, unit: units[k] ?? k }));
}

/** "前一日 · 9月25日", "上一期 · 第 37 周", "下一期 · 7 月". */
export function neighbourLabel(kind: ReportKind, key: string, direction: "prev" | "next", lang: SiteLanguage = "zh"): string {
  if (lang === "en") {
    if (kind === "daily") return `${direction === "prev" ? "Previous day" : "Next day"} · ${monthDay(key, "en")}`;
    const which = direction === "prev" ? "Previous issue" : "Next issue";
    return kind === "weekly" ? `${which} · Week ${Number(key.slice(6))}` : `${which} · ${new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(`${key}-01T12:00:00+08:00`))}`;
  }
  if (kind === "daily") return `${direction === "prev" ? "前一日" : "后一日"} · ${monthDay(key)}`;
  const which = direction === "prev" ? "上一期" : "下一期";
  return kind === "weekly" ? `${which} · 第 ${Number(key.slice(6))} 周` : `${which} · ${Number(key.slice(5, 7))} 月`;
}

const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
/** Page numbers as a Chinese paper prints them: 1 → 一, 12 → 十二, 20 → 二十. */
function cnNumber(n: number): string {
  if (n <= 10) return CN[n]!;
  if (n < 20) return `十${CN[n - 10]}`;
  return `${CN[Math.floor(n / 10)]}十${n % 10 ? CN[n % 10] : ""}`;
}

/** The line above the nameplate: "2026 年 9 月 26 日 · 星期六", "2026 年第 38 周 · 09.14 — 09.20", "2026 年 8 月". */
export function dateLine(kind: ReportKind, key: string, lang: SiteLanguage = "zh"): string {
  const m = dateMark(kind, key, lang);
  if (kind === "daily") return lang === "en" ? `${m.top} ${Number(key.slice(8, 10))} · ${m.bottom}` : `${m.top} ${Number(key.slice(8, 10))} 日 · ${m.bottom}`;
  return kind === "weekly" ? `${m.top} · ${m.bottom}` : `${m.top} ${m.bottom}`;
}

/** What each kind is, under its nameplate. */
export const MOTTO: Record<ReportKind, string> = { daily: `${REPORTS.motto} · 每日要闻`, weekly: `${REPORTS.motto} · 每周综述`, monthly: `${REPORTS.motto} · 每月盘点` };
export const MOTTO_EN: Record<ReportKind, string> = { daily: "AUTOMOTIVE · DAILY BRIEFING", weekly: "AUTOMOTIVE · WEEKLY REVIEW", monthly: "AUTOMOTIVE · MONTHLY REVIEW" };

export interface PeriodCell {
  key: string | null;
  /** Hover text: "9月26日 · 第 158 期". */
  label: string;
  state: "current" | "issue" | "none" | "pad";
}

/**
 * The dot grid beside the date in the masthead: the days of this issue's month (dailies, Monday first),
 * the weeks of its year (weeklies) or the months of its year (monthlies), each marked as this issue,
 * an issue that exists, or none. This issue's own number (`current`) labels it, also when it is older
 * than the navigation.
 */
export function periodGrid(kind: ReportKind, key: string, index: ReportNavigationEntry[], current: number, lang: SiteLanguage = "zh"): { title: string; note: string; columns: number; heads: string[] | null; cells: PeriodCell[] } {
  const exists = new Set(index.map((e) => e.key));
  const cell = (k: string, name: string): PeriodCell => {
    const n = k === key ? current : issueNumber(index, k);
    return { key: k, label: n ? `${name} · ${lang === "en" ? "Issue" : "第"} ${n}${lang === "en" ? "" : " 期"}` : `${name} · ${lang === "en" ? "Not published" : "未出刊"}`, state: k === key ? "current" : exists.has(k) ? "issue" : "none" };
  };
  const count = (cells: PeriodCell[]) => cells.filter((c) => c.state === "issue" || c.state === "current").length;
  const year = key.slice(0, 4);
  if (kind === "daily") {
    const m = Number(key.slice(5, 7));
    const days = new Date(Date.UTC(Number(year), m, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(Number(year), m - 1, 1)).getUTCDay() + 6) % 7;
    const cells: PeriodCell[] = [
      ...Array.from({ length: lead }, (): PeriodCell => ({ key: null, label: "", state: "pad" })),
      ...Array.from({ length: days }, (_, i) => {
        const day = `${key.slice(0, 7)}-${pad(i + 1)}`;
        return cell(day, monthDay(day, lang));
      }),
    ];
    return { title: lang === "en" ? new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(`${key.slice(0, 7)}-01T12:00:00+08:00`)) : `${cnNumber(m)}月`, note: lang === "en" ? `${count(cells)} issues this month` : `本月 ${count(cells)} 期`, columns: 7, heads: lang === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["一", "二", "三", "四", "五", "六", "日"], cells };
  }
  if (kind === "weekly") {
    // 28 December always falls in its year's last ISO week.
    const weeks = Number(isoWeekLabel(`${year}-12-28`).slice(6));
    const cells = Array.from({ length: weeks }, (_, i) => {
      const k = `${year}-W${pad(i + 1)}`;
      const { start, end } = isoWeekRange(k)!;
      return cell(k, lang === "en" ? `Week ${i + 1} (${start.slice(5).replace("-", ".")}—${end.slice(5).replace("-", ".")})` : `第 ${i + 1} 周（${start.slice(5).replace("-", ".")}—${end.slice(5).replace("-", ".")}）`);
    });
    return { title: lang === "en" ? year : `${year} 年`, note: lang === "en" ? `${count(cells)} issues this year` : `全年 ${count(cells)} 期`, columns: 13, heads: null, cells };
  }
  const cells = Array.from({ length: 12 }, (_, i) => {
    const monthKey = `${year}-${pad(i + 1)}`;
    const name = lang === "en"
      ? new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(`${monthKey}-01T12:00:00+08:00`))
      : `${i + 1} 月`;
    return cell(monthKey, name);
  });
  return { title: lang === "en" ? year : `${year} 年`, note: lang === "en" ? `${count(cells)} issues this year` : `全年 ${count(cells)} 期`, columns: 6, heads: null, cells };
}
