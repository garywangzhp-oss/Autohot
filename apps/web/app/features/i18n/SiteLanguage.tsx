// Site-wide language state. English is carried in the URL (`?lang=en`) so SSR, shared caches and copied
// links all resolve to the same language. Public links pass through this module to keep the parameter.
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { SiteLanguage } from "@aihot/contracts/site";

const LanguageContext = createContext<SiteLanguage>("zh");

export function SiteLanguageProvider({ lang, children }: { lang: SiteLanguage; children: ReactNode }) {
  return <LanguageContext.Provider value={lang}>{children}</LanguageContext.Provider>;
}

export function useSiteLanguage(): SiteLanguage {
  return useContext(LanguageContext);
}

/** Add or remove the site language without touching unrelated query parameters. */
export function withLanguageHref(to: string, lang: SiteLanguage): string {
  if (lang !== "en" || !to.startsWith("/") || to.startsWith("//") || /^\/(?:api|admin)(?:\/|$)/.test(to)) return to;
  const url = new URL(to, "http://site.local");
  url.searchParams.set("lang", "en");
  return url.pathname + url.search + url.hash;
}

export function LocalizedLink({ to, ...props }: ComponentProps<typeof Link>) {
  const lang = useSiteLanguage();
  return <Link {...props} to={typeof to === "string" ? withLanguageHref(to, lang) : to} />;
}

export function SiteLanguageToggle({ className = "" }: { className?: string }) {
  const lang = useSiteLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const next: SiteLanguage = lang === "en" ? "zh" : "en";
  const switchLanguage = () => {
    const url = new URL(location.pathname + location.search + location.hash, window.location.origin);
    if (next === "en") url.searchParams.set("lang", "en");
    else url.searchParams.delete("lang");
    navigate(url.pathname + url.search + url.hash, { preventScrollReset: true, viewTransition: true });
  };
  return (
    <button
      type="button"
      onClick={switchLanguage}
      className={`inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface px-3 text-[12px] font-semibold text-ink-2 transition-colors hover:border-accent hover:text-accent ${className}`}
      aria-label={lang === "en" ? "Switch to Chinese" : "切换到英文"}
    >
      {lang === "en" ? "中文" : "EN"}
    </button>
  );
}

export const SITE_TEXT = {
  zh: {
    featured: "精选",
    all: "全部汽车动态",
    hot: "热点榜",
    daily: "日报",
    weekly: "周报",
    monthly: "月报",
    topics: "主题",
    saved: "收藏",
    more: "我的",
    about: "关于",
    changelog: "更新日志",
    feedback: "反馈",
    privacy: "隐私说明",
    terms: "使用规则",
    search: "搜索",
    filter: "筛选",
    cookie: "Cookie 设置",
    language: "语言",
    back: "返回",
    source: "来源",
    openOriginal: "打开原文",
    loading: "正在加载",
    unavailable: "暂时无法加载",
    empty: "这里还没有内容",
  },
  en: {
    featured: "Featured",
    all: "All automotive stories",
    hot: "Trending",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    topics: "Topics",
    saved: "Saved",
    more: "Me",
    about: "About",
    changelog: "Changelog",
    feedback: "Feedback",
    privacy: "Privacy",
    terms: "Terms",
    search: "Search",
    filter: "Filter",
    cookie: "Cookie settings",
    language: "Language",
    back: "Back",
    source: "Source",
    openOriginal: "Open original",
    loading: "Loading",
    unavailable: "Temporarily unavailable",
    empty: "Nothing here yet",
  },
} as const;

export function useSiteText() {
  return SITE_TEXT[useSiteLanguage()];
}
