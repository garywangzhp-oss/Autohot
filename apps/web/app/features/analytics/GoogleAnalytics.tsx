// Google Analytics 4, loaded only after the reader grants analytics consent. The measurement ID is
// resolved by the root loader so server rendering and hydration agree; the script never runs on /admin.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

type Consent = "unknown" | "granted" | "denied";
const CONSENT_KEY = "aihot-ga-consent";

type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

function storedConsent(): Consent {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : "unknown";
  } catch {
    return "unknown";
  }
}

function rememberConsent(value: Exclude<Consent, "unknown">): void {
  try { window.localStorage.setItem(CONSENT_KEY, value); } catch { /* storage may be blocked */ }
}

export function GoogleAnalytics({ measurementId }: { measurementId: string | null }) {
  const location = useLocation();
  const [consent, setConsent] = useState<Consent>("unknown");
  const loaded = useRef(false);
  const admin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");

  useEffect(() => {
    setConsent(storedConsent());
  }, []);

  useEffect(() => {
    if (!measurementId || admin || consent !== "granted") return;
    const analytics = window as AnalyticsWindow;
    if (!loaded.current) {
      analytics.dataLayer = analytics.dataLayer ?? [];
      analytics.gtag = (...args: unknown[]) => { analytics.dataLayer!.push(args); };
      analytics.gtag("js", new Date());
      analytics.gtag("config", measurementId, { anonymize_ip: true, send_page_view: false });
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
      loaded.current = true;
    }
    analytics.gtag?.("event", "page_view", {
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [admin, consent, location.pathname, location.search, measurementId]);

  if (!measurementId || admin) return null;
  if (consent !== "unknown") return null;

  const accept = () => {
    rememberConsent("granted");
    setConsent("granted");
  };
  const reject = () => {
    rememberConsent("denied");
    setConsent("denied");
  };

  return (
    <aside role="dialog" aria-label="访问统计选项" className="fixed inset-x-3 bottom-3 z-[65] mx-auto max-w-xl rounded-card border border-line-strong bg-surface p-4 text-[13px] leading-relaxed text-ink-3 shadow-[var(--shadow-pop)] sm:bottom-5 sm:p-5">
      <p className="text-[14px] font-semibold text-ink">访问统计</p>
      <p className="mt-1">我们使用 Google Analytics 了解访问情况，以改进内容和网站体验。你可以允许统计，或只使用必要功能。</p>
      <p className="mt-1 text-[12px] text-ink-4">
        详见 <a href="/privacy" className="text-accent hover:underline">隐私说明</a>。
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={reject} className="h-9 rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink-2 hover:border-ink-4">仅必要</button>
        <button type="button" onClick={accept} className="h-9 rounded-full bg-accent px-4 text-[13px] font-medium text-accent-contrast hover:bg-accent-ink">允许统计</button>
      </div>
    </aside>
  );
}
