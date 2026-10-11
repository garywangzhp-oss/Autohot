import { data as withHeaders, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { apiDeadlineCache, loadOr404, pageExpiresAt } from "../lib/api.server";
import { cachedLoader } from "../lib/page-reuse";
import { filterParams, itemListLd, listPath, pageMeta, readFilters, siteLd } from "../lib/seo";
import type { Screen } from "../components/shell/screens";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { ActiveFilters, CategoryTabs, FeedBar, SearchField } from "../features/feed/Filters";
import { FeedLanguageProvider, HomeLanguageToggle, type FeedLanguage } from "../features/feed/Language";
import { loadParts } from "../site-modules";

export const handle: Screen = { tab: "featured", name: "精选" };
export { shouldRevalidate } from "../lib/page-reuse";
export const clientLoader = cachedLoader<typeof loader>();
const HOME_PARTS = await loadParts((m) => m.homePage);

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lang: FeedLanguage = url.searchParams.get("lang") === "en" ? "en" : "zh";
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const filters = readFilters(url.searchParams);
  const upstream = new Headers();
  const data = await loadOr404<TimelineResponse>(listPath("/api/site/timeline", filterParams(filters)), { responseHeaders: upstream, signal: request.signal });
  return withHeaders({ data, filters, lang, expiresAt: pageExpiresAt(60, upstream) }, { headers: apiDeadlineCache(60, Date.now(), upstream) });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const english = loaderData?.lang === "en";
  const titles = loaderData?.data.cards.map((c) => english ? (c.item.originalTitle || c.item.title) : c.item.title) ?? [];
  return pageMeta({ path, jsonLd: path === "/" ? [...siteLd(), itemListLd("/", english ? "Featured" : "精选", titles)] : undefined });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Home() {
  const { data, filters, lang } = useLoaderData<typeof loader>();
  const title = filters.tag ? `#${filters.tag}` : lang === "en" ? "Featured" : "精选";
  return (
    <FeedLanguageProvider lang={lang}>
    <div className="pb-6">
      {/* Phones: the bar (精选 | 全部, filter, search), the filter in use, today's hot topics, the feed. */}
      <FeedBar base="/" category={filters.category} channel={filters.channel} />
      <ActiveFilters base="/" category={filters.category} channel={filters.channel} tag={filters.tag} />
      <div className="hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{title}</h1>
        <div className="mb-5 mt-4 flex items-start justify-between gap-4">
          <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <HomeLanguageToggle />
              <SearchField keep={{ category: filters.category }} />
            </div>
            {HOME_PARTS.map(({ name, part: Subscribe }) => <Subscribe key={name} />)}
          </div>
        </div>
      </div>

      {data.hot && <HotTopics entries={data.hot} />}

      <Timeline initial={data} filters={data.filters} />
    </div>
    </FeedLanguageProvider>
  );
}
