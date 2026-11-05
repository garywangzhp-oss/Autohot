import type { HotEntryView } from "@aihot/contracts/site";
import { useSiteLanguage } from "../i18n/SiteLanguage";

/** Change against six hours before the ranking: up in the hot tone, down quiet, new stories marked new, none while sources are behind. */
export function Delta({ trend, pct, className = "" }: { trend: HotEntryView["trend"]; pct: number | null; className?: string }) {
  const en = useSiteLanguage() === "en";
  const base = `inline-flex h-[22px] shrink-0 items-center gap-0.5 rounded-full px-2 text-[11.5px] font-medium tabular-nums ${className}`;
  if (trend === "unknown") return <span className={`${base} bg-bg-sunk text-ink-4 dark:bg-bg-muted/60`} title={en ? "Some sources are behind, so there is no comparison with six hours ago yet" : "部分信源的采集暂时落后，先不和 6 小时前比较"}>{en ? "No comparison" : "暂不比较"}</span>;
  if (trend === "new" || pct === null) return <span className={`${base} bg-accent-soft text-accent`}>{en ? "New" : "新上榜"}</span>;
  if (trend === "flat") return <span className={`${base} bg-bg-sunk text-ink-4 dark:bg-bg-muted/60`} title={en ? "Compared with six hours ago" : "较 6 小时前"}>{en ? "Flat" : "持平"}</span>;
  const up = trend === "up";
  return (
    <span className={`${base} ${up ? "bg-hot-soft text-hot" : "bg-bg-sunk text-ink-4 dark:bg-bg-muted/60"}`} title={en ? "Compared with six hours ago" : "较 6 小时前"}>
      {up ? "↑" : "↓"} {Math.abs(Math.round(pct))}%
    </span>
  );
}
