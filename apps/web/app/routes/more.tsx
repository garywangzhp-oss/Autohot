import { useEffect, useState, type ReactNode } from "react";
import { useRouteLoaderData } from "react-router";
import { POLICY, SITE } from "@aihot/site";
import type { loader as rootLoader } from "../root";
import { useChangelogDot } from "../components/shell/Sidebar";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { edgeTtl } from "../lib/api.server";
import { webModules } from "../site-modules";
import { pageMeta } from "../lib/seo";
import { useStarred } from "../lib/local-state";
import { ThemeSwitch } from "../components/shell/ThemeSwitch";
import { PrivacySettingsButton } from "../features/analytics/PrivacyConsent";
import { LocalizedLink as Link, SiteLanguageToggle, useSiteLanguage, useSiteText } from "../features/i18n/SiteLanguage";
import { IconBookmark, IconChevronRight, IconGrid, IconHeart, IconMessage, IconMoon, IconSparkles } from "../components/icons";
import type { Route } from "./+types/more";

export const handle: Screen = { tab: "me", name: "我的" };

export function headers() {
  return edgeTtl(300);
}

export function meta({ location }: Route.MetaArgs) {
  const en = new URLSearchParams(location.search).get("lang") === "en";
  return pageMeta({ title: en ? "Me · AutoHot" : "我的", rawTitle: en, path: en ? "/more?lang=en" : "/more", noindex: true });
}

/**
 * "我的", the phone's last tab (the address stays /more): this browser's bookmarks and appearance first,
 * then the tools, then the site's own pages.
 */
type Row = { to: string; label: string; icon: ReactNode; detail?: ReactNode };

/** The modules' tools first, then the engine's. */
const tools = (lang: "zh" | "en"): Row[] => [
  ...webModules().flatMap((m) => m.tools ?? []),
  { to: "/topics", label: lang === "en" ? "Topics" : "主题", icon: <IconGrid size={20} /> },
];

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="px-4 pb-2 pt-6 text-[13px] font-semibold text-ink-3">{title}</h2>}
      <ul className="card divide-y divide-line-soft overflow-hidden">{children}</ul>
    </section>
  );
}

function RowLink({ row, dot = false }: { row: Row; dot?: boolean }) {
  const en = useSiteLanguage() === "en";
  return (
    <li>
      <Link viewTransition to={row.to} className="flex min-h-[52px] items-center gap-3 px-4 text-[16px] font-medium text-ink transition-colors active:bg-bg-sunk lg:hover:bg-bg-sunk">
        <span className="text-ink-3">{row.icon}</span>
        <span className="flex flex-1 items-center gap-2">
          {row.label}
          {dot && <span className="size-[7px] rounded-full bg-hot" aria-label={en ? "New updates" : "有新的更新"} />}
        </span>
        {row.detail && <span className="text-[14px] font-normal text-ink-4">{row.detail}</span>}
        <IconChevronRight size={16} className="text-ink-4" />
      </Link>
    </li>
  );
}

export default function MorePage() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const changelogDot = useChangelogDot(root?.changelogVersion ?? null);
  const starred = useStarred();
  const lang = useSiteLanguage();
  const text = useSiteText();
  // The count is this browser's: shown once the page runs here, never in the shared server copy.
  const [here, setHere] = useState(false);
  useEffect(() => setHere(true), []);
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      <PhoneBar title={text.more} large />
      <h1 className="hidden pb-4 pt-1 text-[22px] font-bold text-ink lg:block">{text.more}</h1>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-4 2xl:grid-cols-3">
        <Group>
          <RowLink row={{ to: "/starred", label: text.saved, icon: <IconBookmark size={20} />, detail: here && starred.length > 0 ? <span className="num">{starred.length}</span> : undefined }} />
          <li className="flex min-h-[56px] items-center gap-3 px-4 text-[16px] font-medium text-ink">
            <span className="text-ink-3">
              <IconMoon size={20} />
            </span>
            <span className="flex-1">{lang === "en" ? "Appearance" : "外观"}</span>
            <ThemeSwitch className="w-[126px]" />
          </li>
          <li className="flex min-h-[56px] items-center gap-3 px-4 text-[16px] font-medium text-ink">
            <span className="flex-1">{text.language}</span>
            <SiteLanguageToggle />
          </li>
        </Group>
        <Group title={lang === "en" ? "Tools" : "工具与入口"}>
          {tools(lang).map((r) => (
            <RowLink key={r.to} row={r} />
          ))}
        </Group>
        <Group title={text.about}>
          <RowLink row={{ to: "/about", label: lang === "en" ? "About AutoHot" : `关于 ${SITE.name}`, icon: <IconHeart size={20} /> }} />
          <RowLink row={{ to: "/changelog", label: text.changelog, icon: <IconSparkles size={20} /> }} dot={changelogDot} />
          <RowLink row={{ to: "/feedback", label: lang === "en" ? "Feedback" : "意见反馈", icon: <IconMessage size={20} /> }} />
        </Group>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] leading-[2] text-ink-4">
        <Link viewTransition to="/terms" className="hover:text-ink-2">{lang === "en" ? "Terms" : POLICY.terms.name}</Link>
        <Link viewTransition to="/privacy" className="hover:text-ink-2">{text.privacy}</Link>
        <PrivacySettingsButton className="hover:text-ink-2">{text.cookie}</PrivacySettingsButton>
        <a href="/feed.xml" className="hover:text-ink-2">RSS</a>
        {SITE.github && <a href={SITE.github} target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">{lang === "en" ? "GitHub" : "GitHub 开源"}</a>}
        {SITE.icp && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">{SITE.icp}</a>}
      </div>
    </div>
  );
}
