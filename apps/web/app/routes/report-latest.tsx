import { useLoaderData } from "react-router";
import type { Route } from "./+types/report-latest";
import type { ReportLatestPage } from "@aihot/contracts/site";
import { REPORTS, subjectAfter, withSubject } from "@aihot/site";
import { edgeTtl, loadOr404, pageExpiresAt, requestLanguage, withLanguage } from "../lib/api.server";
import { cachedLoader } from "../lib/page-reuse";
import { pageMeta, reportLd } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { EmptyState } from "../components/ui/Page";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportPaper, reportOutline } from "../features/report/ReportPaper";
import { KIND_LABEL, feedLink, kindFromPath, kindLabel } from "../features/report/format";
import type { Screen } from "../components/shell/screens";
import { loadParts } from "../site-modules";
import { useSiteLanguage } from "../features/i18n/SiteLanguage";

export const handle: Screen = { tab: "daily", name: "日报" };
export { shouldRevalidate } from "../lib/page-reuse";
export const clientLoader = cachedLoader<typeof loader>();
const REPORT_PARTS = await loadParts((m) => m.reportPage);

export async function loader({ request }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const lang = requestLanguage(request);
  const { index, report } = await loadOr404<ReportLatestPage>(withLanguage(`/api/site/reports/${kind}/latest-page`, lang), { signal: request.signal });
  return { kind, report, index, today: beijingDate(Date.now()), expiresAt: pageExpiresAt(600) };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const kind = loaderData?.kind ?? "daily";
  const en = new URLSearchParams(location.search).get("lang") === "en";
  const path = en ? `${location.pathname}?lang=en` : location.pathname;
  const description = en ? `The latest ${kindLabel(kind, "en").toLowerCase()} automotive briefing.` : `${REPORTS.descriptions[kind]}。`;
  const report = loaderData?.report;
  return [...pageMeta({
    title: en ? `${kindLabel(kind, "en")} · AutoHot` : withSubject(KIND_LABEL[kind]),
    rawTitle: en,
    description,
    path,
    image: `/og/pages/${kind}.png`,
    // The latest issue, described at this page's own address (its canonical).
    jsonLd: report ? reportLd(report, path, report.lead?.leadParagraph ?? description) : undefined,
  }), feedLink(kind, en ? "en" : "zh")];
}

export function headers() {
  return edgeTtl(600);
}

export default function ReportLatestPage() {
  const { kind, report, index, today } = useLoaderData<typeof loader>();
  const en = useSiteLanguage() === "en";
  return (
    <ReportLayout kind={kind} index={index} current={report?.key ?? null} today={today} outline={report ? reportOutline(report, en ? "en" : "zh") : []}>
      {report ? <ReportPaper report={report} index={index} editionAction={report.kind === "daily" ? REPORT_PARTS.map(({ name, part: Subscribe }) => <Subscribe key={name} kind={report.kind} />) : undefined} /> : <EmptyState title={en ? `No ${kindLabel(kind, "en").toLowerCase()} issue yet` : subjectAfter("还没有发布", KIND_LABEL[kind])}>{en ? "The first issue will appear here." : "第一期发布后会出现在这里。"}</EmptyState>}
    </ReportLayout>
  );
}
