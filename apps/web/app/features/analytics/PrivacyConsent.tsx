// One first-party consent record controls both Google Analytics and Google AdSense. Neither Google
// script is loaded before the reader opts in, and the same record feeds Google Consent Mode v2.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import {
  LEGACY_ANALYTICS_CONSENT_KEY, PRIVACY_CONSENT_KEY, legacyAnalyticsConsent, parseStoredConsent,
  serializeStoredConsent, type ConsentPreferences,
} from "./consent";

const OPEN_SETTINGS_EVENT = "autohot:open-privacy-settings";

type Gtag = (...args: unknown[]) => void;
type GoogleWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };
type Panel = "notice" | "settings" | null;

function ensureGtag(): Gtag {
  const analytics = window as GoogleWindow;
  analytics.dataLayer = analytics.dataLayer ?? [];
  if (!analytics.gtag) analytics.gtag = (...args: unknown[]) => { analytics.dataLayer!.push(args); };
  if (analytics.dataLayer.length === 0) {
    analytics.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "granted",
      security_storage: "granted",
      wait_for_update: 500,
    });
  }
  return analytics.gtag;
}

function applyGoogleConsent(preferences: ConsentPreferences): void {
  ensureGtag()("consent", "update", {
    analytics_storage: preferences.analytics ? "granted" : "denied",
    ad_storage: preferences.ads ? "granted" : "denied",
    ad_user_data: preferences.ads ? "granted" : "denied",
    ad_personalization: preferences.ads ? "granted" : "denied",
  });
}

function loadScript(id: string, src: string, crossOrigin?: string): void {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  if (crossOrigin) script.crossOrigin = crossOrigin;
  document.head.appendChild(script);
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line-strong"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

function PreferenceRow({ title, detail, checked, onChange, disabled = false }: { title: string; detail: string; checked: boolean; onChange?: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-3 border-t border-line-soft py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-4">{detail}</p>
      </div>
      {disabled ? <span className="shrink-0 pt-0.5 text-[12px] text-ink-4">始终启用</span> : <Toggle checked={checked} onChange={onChange!} label={title} />}
    </div>
  );
}

export function PrivacySettingsButton({ className, children = "Cookie 设置" }: { className?: string; children?: ReactNode }) {
  return (
    <button type="button" aria-haspopup="dialog" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}>
      {children}
    </button>
  );
}

export function PrivacyConsent({ measurementId, adsenseClientId }: { measurementId: string | null; adsenseClientId: string | null }) {
  const location = useLocation();
  const admin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const hasAnalytics = Boolean(measurementId);
  const hasAds = Boolean(adsenseClientId);
  const purpose = hasAnalytics && hasAds ? "了解访问情况和展示广告" : hasAnalytics ? "了解访问情况" : "展示和衡量广告";
  const settingsLead = hasAnalytics && hasAds ? "你可以分别控制访问统计和广告。" : hasAnalytics ? "你可以控制是否启用访问统计。" : "你可以控制是否启用广告。";
  const [ready, setReady] = useState(false);
  const [decided, setDecided] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({ analytics: false, ads: false });
  const [draft, setDraft] = useState<ConsentPreferences>({ analytics: false, ads: false });
  const [panel, setPanel] = useState<Panel>(null);
  const analyticsLoaded = useRef(false);
  const adsLoaded = useRef(false);

  useEffect(() => {
    let stored = null;
    try { stored = parseStoredConsent(window.localStorage.getItem(PRIVACY_CONSENT_KEY)); } catch { /* storage may be blocked */ }
    if (stored) {
      const next = { analytics: stored.analytics, ads: stored.ads };
      setPreferences(next);
      setDraft(next);
      setDecided(true);
      setPanel(null);
    } else {
      let legacy = null;
      try { legacy = window.localStorage.getItem(LEGACY_ANALYTICS_CONSENT_KEY); } catch { /* storage may be blocked */ }
      const next = { analytics: legacyAnalyticsConsent(legacy), ads: false };
      setDraft(next);
      setPanel("notice");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const open = () => {
      setDraft((current) => decided ? preferences : current);
      setPanel("settings");
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, [decided, preferences]);

  useEffect(() => {
    if (!ready || admin || (!hasAnalytics && !hasAds)) return;
    const gtag = ensureGtag();
    applyGoogleConsent(preferences);
    if (!decided) return;

    if (hasAnalytics && preferences.analytics && measurementId && !analyticsLoaded.current) {
      gtag("js", new Date());
      gtag("config", measurementId, { anonymize_ip: true, send_page_view: false });
      loadScript("autohot-google-analytics", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`);
      analyticsLoaded.current = true;
    }
    if (hasAds && preferences.ads && adsenseClientId && !adsLoaded.current) {
      loadScript("autohot-google-adsense", `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClientId)}`, "anonymous");
      adsLoaded.current = true;
    }
  }, [admin, adsenseClientId, decided, hasAds, hasAnalytics, measurementId, preferences, ready]);

  useEffect(() => {
    if (!ready || admin || !decided || !hasAnalytics || !preferences.analytics || !measurementId) return;
    ensureGtag()("event", "page_view", {
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [admin, decided, hasAnalytics, location.pathname, location.search, measurementId, preferences.analytics, ready]);

  if (!ready || admin || (!hasAnalytics && !hasAds) || panel === null) return null;

  const save = (next: ConsentPreferences) => {
    try {
      window.localStorage.setItem(PRIVACY_CONSENT_KEY, serializeStoredConsent(next));
      window.localStorage.removeItem(LEGACY_ANALYTICS_CONSENT_KEY);
    } catch { /* the choice applies for this page even if the browser cannot remember it */ }
    const revokeAds = decided && preferences.ads && !next.ads;
    setPreferences(next);
    setDraft(next);
    setDecided(true);
    setPanel(null);
    // Removing the script is not reliable once AdSense has executed; a reload guarantees no further
    // ad requests after the reader withdraws advertising consent.
    if (revokeAds) window.location.reload();
  };

  if (panel === "notice") {
    return (
      <aside role="dialog" aria-label="隐私选择" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-card border border-line-strong bg-surface p-4 text-[13px] leading-relaxed text-ink-3 shadow-[var(--shadow-pop)] sm:bottom-5 sm:p-5">
        <p className="text-[14px] font-semibold text-ink">你的隐私选择</p>
        <p className="mt-1">
          必要功能会一直启用。只有你同意后，我们才会加载 {hasAnalytics && hasAds ? "Google Analytics 和 Google AdSense" : hasAnalytics ? "Google Analytics" : "Google AdSense"}，用于{purpose}。
        </p>
        <p className="mt-1 text-[12px] text-ink-4">
          你可以拒绝非必要功能，不影响阅读。详见 <a href="/privacy" className="text-accent hover:underline">隐私说明</a>。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => save({ analytics: false, ads: false })} className="h-9 rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink-2 hover:border-ink-4">仅必要</button>
          <button type="button" onClick={() => save({ analytics: hasAnalytics, ads: hasAds })} className="h-9 rounded-full bg-accent px-4 text-[13px] font-medium text-accent-contrast hover:bg-accent-ink">接受全部</button>
        </div>
        <button type="button" onClick={() => setPanel("settings")} className="mt-2 text-[12px] text-accent hover:underline">管理选项</button>
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-3 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && decided) setPanel(null); }}>
      <section role="dialog" aria-modal="true" aria-label="Cookie 设置" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-card border border-line-strong bg-surface p-5 text-ink-3 shadow-[var(--shadow-pop)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-ink">隐私设置</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-4">{settingsLead}必要功能用于登录管理、安全防护和记住本机设置，无法关闭。</p>
          </div>
          {decided && <button type="button" onClick={() => setPanel(null)} className="shrink-0 text-[12.5px] text-ink-4 hover:text-ink">关闭</button>}
        </div>
        <div className="mt-4 rounded-control border border-line p-3">
          <PreferenceRow title="必要功能" detail="站点运行、安全防护，以及收藏、已读和外观等本机设置。" checked disabled />
          {hasAnalytics && <PreferenceRow title="访问统计" detail="通过 Google Analytics 了解页面访问情况，用于改进内容与体验。" checked={draft.analytics} onChange={(analytics) => setDraft({ ...draft, analytics })} />}
          {hasAds && <PreferenceRow title="广告" detail="通过 Google AdSense 及其合作伙伴展示和衡量广告；同意后可能使用 Cookie 或类似标识符。" checked={draft.ads} onChange={(ads) => setDraft({ ...draft, ads })} />}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
          你可以随时回到这里修改或撤回同意。EEA/英国用户还可能在广告加载时看到 Google 认证同意管理平台提供的确认提示。详情见 <a href="/privacy" className="text-accent hover:underline">隐私说明</a>。
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => { if (decided) setPanel(null); else setPanel("notice"); }} className="h-9 rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink-2 hover:border-ink-4">{decided ? "取消" : "返回"}</button>
          <button type="button" onClick={() => save(draft)} className="h-9 rounded-full bg-accent px-4 text-[13px] font-medium text-accent-contrast hover:bg-accent-ink">保存设置</button>
        </div>
      </section>
    </div>
  );
}
