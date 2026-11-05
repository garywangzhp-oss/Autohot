import type { SiteLanguage } from "@aihot/contracts/site";
import { weekdayShort } from "../../lib/format";

/** Release notes carry a little Markdown: **bold** runs. */
export function Inline({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i} className="font-semibold text-ink-2">{part}</b> : part))}</>;
}

export function dateHeading(date: string, lang: SiteLanguage = "zh"): { label: string; weekday: string } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return {
    label: lang === "en" ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00+08:00`)) : `${y} 年 ${m} 月 ${d} 日`,
    weekday: weekdayShort(date, lang),
  };
}
