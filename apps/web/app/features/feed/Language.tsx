// The homepage's original-language mode. It is deliberately local to the feed: the rest of the site
// stays Chinese, while the home page can show source titles/summaries and English chrome.
import { createContext, useContext, type ReactNode } from "react";
import type { CategoryKey } from "@aihot/contracts/taxonomy";
import { CATEGORY_LABELS, CATEGORY_LABELS_EN } from "@aihot/contracts/taxonomy";
import { SiteLanguageToggle, useSiteLanguage } from "../i18n/SiteLanguage";

export type FeedLanguage = "zh" | "en";

const LanguageContext = createContext<FeedLanguage | null>(null);

export function FeedLanguageProvider({ lang, children }: { lang: FeedLanguage; children: ReactNode }) {
  return <LanguageContext.Provider value={lang}>{children}</LanguageContext.Provider>;
}

export function useFeedLanguage(): FeedLanguage {
  const local = useContext(LanguageContext);
  const site = useSiteLanguage();
  return local ?? site;
}

export const FEED_TEXT = {
  zh: {
    featured: "精选",
    all: "全部",
    filter: "筛选",
    filterActive: "筛选（已选）",
    search: "搜索",
    searchPlaceholder: "搜索标题、摘要…",
    searchLabel: "搜索标题、摘要与正文",
    clear: "清空",
    none: "不限",
    allCategories: "全部",
    only: "只看",
    today: "今天",
    items: "条",
    loadMore: "加载更多",
    loading: "正在加载",
    retry: "加载失败，点此重试",
    end: "已经到底了",
    emptyTitle: "这个筛选下还没有精选内容",
    emptyBody: "换个类别看看，或者去全部动态里找找。",
    hot: "当前热点",
    fullRanking: "完整榜单",
    heat: "热度",
    new: "新",
    reason: "推荐理由",
    sameNews: "同一新闻，精选展示",
    expand: "展开",
    collapse: "收起",
    feedScope: "看精选或全部",
  },
  en: {
    featured: "Featured",
    all: "All",
    filter: "Filter",
    filterActive: "Filter (active)",
    search: "Search",
    searchPlaceholder: "Search titles and summaries…",
    searchLabel: "Search titles, summaries and text",
    clear: "Clear",
    none: "All",
    allCategories: "All",
    only: "Only",
    today: "Today",
    items: "items",
    loadMore: "Load more",
    loading: "Loading",
    retry: "Load failed — tap to retry",
    end: "End of feed",
    emptyTitle: "No featured stories under this filter",
    emptyBody: "Try another category or browse all stories.",
    hot: "Trending now",
    fullRanking: "Full ranking",
    heat: "heat",
    new: "NEW",
    reason: "Why it matters",
    sameNews: "Also shown as the selected report",
    expand: "Expand",
    collapse: "Collapse",
    feedScope: "Featured or all",
  },
} as const;

export function categoryLabel(lang: FeedLanguage, key: CategoryKey): string {
  return lang === "en" ? CATEGORY_LABELS_EN[key] : CATEGORY_LABELS[key];
}

export function HomeLanguageToggle() {
  return <SiteLanguageToggle />;
}