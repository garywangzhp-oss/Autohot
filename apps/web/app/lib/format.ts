import { beijingDate, beijingTime, beijingWeekday } from "@aihot/contracts/time";
import type { SiteLanguage } from "@aihot/contracts/site";

/** "9月28日" of a calendar date (YYYY-MM-DD). */
export function monthDay(date: string, lang: SiteLanguage = "zh"): string {
  if (lang === "en") {
    return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", month: "short", day: "numeric" })
      .format(new Date(`${date}T12:00:00+08:00`));
  }
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

/** "周六" of a calendar date (YYYY-MM-DD). */
export function weekdayShort(date: string, lang: SiteLanguage = "zh"): string {
  if (lang === "en") {
    return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short" })
      .format(new Date(`${date}T12:00:00+08:00`));
  }
  return beijingWeekday(date).replace("星期", "周");
}

export function relativeTime(iso: string, now = Date.now(), lang: SiteLanguage = "zh"): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return lang === "en" ? "just now" : "刚刚";
  const m = Math.round(s / 60);
  if (m < 60) return lang === "en" ? `${m} min ago` : `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "en" ? `${h} hr ago` : `${h} 小时前`;
  const d = Math.round(h / 24);
  if (d < 30) return lang === "en" ? `${d} days ago` : `${d} 天前`;
  return lang === "en" ? monthDay(beijingDate(iso), "en") : beijingDate(iso);
}

export function fullDateTime(iso: string, lang: SiteLanguage = "zh"): string {
  return `${monthDay(beijingDate(iso), lang)} ${beijingTime(iso)}`;
}

/** "9月24日 10:51" (Beijing), for lists that span days. */
export function monthDayTime(iso: string, lang: SiteLanguage = "zh"): string {
  return `${monthDay(beijingDate(iso), lang)} ${beijingTime(iso)}`;
}

export function sourceInitial(name: string): string {
  const s = name.replace(/^[^\p{L}\p{N}]+/u, "");
  return (s[0] ?? "A").toUpperCase();
}
