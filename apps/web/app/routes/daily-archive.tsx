import { useLoaderData } from "react-router";
import { IntentLink } from "../components/ui/IntentLink";
import type { ReportIndexEntry, ReportIndexResponse } from "@aihot/contracts/site";
import { SITE, SITE_EN, withSubject } from "@aihot/site";
import { apiGet, edgeTtl, pageExpiresAt, requestLanguage, withLanguage } from "../lib/api.server";
import { cachedLoader } from "../lib/page-reuse";
import { archiveLd, pageMeta } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { weekdayShort } from "../lib/format";
import { ReportLayout } from "../features/report/ReportLayout";
import { archiveGroups, entriesUnit } from "../features/report/format";
import { Rows, SectionPage } from "../features/report/ReportPaper";
import { Nameplate } from "../features/report/Nameplate";
import type { Screen } from "../components/shell/screens";
import { useSiteLanguage } from "../features/i18n/SiteLanguage";
import type { Route } from "./+types/daily-archive";

export const handle: Screen = { tab: "daily", name: "往期" };
export { shouldRevalidate } from "../lib/page-reuse";
export const clientLoader = cachedLoader<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const { items: index } = await apiGet<ReportIndexResponse>(withLanguage("/api/site/reports/daily", requestLanguage(request)), { signal: request.signal });
  return { index, today: beijingDate(Date.now()), expiresAt: pageExpiresAt(600) };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const en = new URLSearchParams(location.search).get("lang") === "en";
  const path = en ? "/daily/archive?lang=en" : "/daily/archive";
  const entries = (loaderData?.index ?? []).map((e: ReportIndexEntry) => ({ path: en ? `/daily/${e.key}?lang=en` : `/daily/${e.key}`, name: e.title ? `${e.key} · ${e.title}` : `${en ? SITE_EN.name : SITE.name} ${en ? "Daily" : "日报"} · ${e.key}` }));
  return pageMeta({ title: en ? "Daily archive · AutoHot" : `${withSubject("日报")} · 历史存档`, rawTitle: en, description: en ? "Every AutoHot daily edition, archived by date." : `${SITE.name} 历史日报，按日期归档。`, path, image: "/og/pages/daily.png", jsonLd: archiveLd(path, en ? "AutoHot Daily archive" : `${SITE.name} 日报 · 历史存档`, entries) });
}

export function headers() {
  return edgeTtl(600);
}

export default function DailyArchive() {
  const { index, today } = useLoaderData<typeof loader>();
  const lang = useSiteLanguage();
  const en = lang === "en";
  const months = archiveGroups("daily", index, lang);
  return (
    <ReportLayout kind="daily" index={index} current={null} today={today} back={{ to: "/daily", label: en ? "Daily" : "日报" }} title={en ? "Daily archive" : "日报合订本"}>
      <div className="@container">
        <header className="pt-5 lg:pt-0">
          <div className="flex items-center justify-between gap-4 text-[12px] text-ink-4">
            <span>{en ? `${SITE_EN.name} · DAILY` : `${SITE.name} · ${withSubject("日报")}`}</span>
            <span>
              {en ? "Issues" : "共"} <span className="num">{index[0]?.issueNumber ?? 0}</span>{en ? "" : " 期"}
            </span>
          </div>
          <div className="py-6 @[880px]:py-8">
            <h1 id="report-start" data-page-title="">
              <span className="sr-only">{en ? "Daily archive" : "日报合订本"}</span>
              {en ? <span className="block text-[34px] font-black uppercase leading-none tracking-[-0.04em] text-ink @[520px]:text-[48px] @[880px]:text-[64px]">DAILY ARCHIVE</span> : <Nameplate which="archive" className="block h-[50px] w-auto @[520px]:h-[70px] @[880px]:h-[98px]" />}
            </h1>
          </div>
          <div aria-hidden="true" className="border-t border-line-strong" />
        </header>
        {months.map((m) => (
          <SectionPage key={m.id} id={`m-${m.id}`} label={m.label}>
            <Rows items={m.entries}>
              {(e, cell) => (
                <IntentLink viewTransition key={e.key} to={`/daily/${e.key}`} className={`group flex gap-4 py-4 ${cell}`}>
                  <span className="flex w-9 shrink-0 flex-col items-center">
                    <span className="num text-[24px] font-black leading-none tracking-[-0.03em] text-ink transition-colors group-hover:text-accent">{e.key.slice(8, 10)}</span>
                    <span className="mt-1.5 text-[10.5px] leading-none text-ink-4">{weekdayShort(e.key, lang)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold leading-[1.55] text-ink transition-colors group-hover:text-accent">{e.title ?? `${en ? "Daily" : withSubject("日报")} ${e.key}`}</span>
                    <span className="mt-1 block text-[12px] text-ink-4">
                      <span className="num">{e.count}</span>{` ${entriesUnit(lang)}`}
                    </span>
                  </span>
                </IntentLink>
              )}
            </Rows>
          </SectionPage>
        ))}
      </div>
    </ReportLayout>
  );
}
