// The email sign-up button and its form. The homepage draws it under the desktop search field; a daily
// report draws it just before the issue time. Clicking either button opens the same centered dialog.
import { useEffect, useState, type FormEvent } from "react";
import type { ReportKind } from "@aihot/contracts/site";
import { defineWebModule } from "@aihot/web/modules";
import { Sheet } from "@aihot/web/components/ui/Sheet";
import { useSiteLanguage } from "@aihot/web/features/i18n/SiteLanguage";

type SubscribeSource = "home" | "daily";
type SaveState = { kind: "idle" } | { kind: "sending" } | { kind: "success"; status: "pending" | "active" } | { kind: "error"; message: string };

function SubscribeDialog({ open, onClose, source }: { open: boolean; onClose: () => void; source: SubscribeSource }) {
  const lang = useSiteLanguage() === "en" ? "en" : "zh";
  const en = lang === "en";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  useEffect(() => {
    if (!open) {
      setEmail("");
      setState({ kind: "idle" });
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const response = await fetch("/api/site/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source, lang }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; status?: "pending" | "active"; message?: string };
      if (!response.ok || !data.ok || !data.status) {
        setState({ kind: "error", message: en ? "Subscription is temporarily unavailable. Please try again later." : (data.message ?? "订阅暂时无法使用，请稍后再试。") });
        return;
      }
      setState({ kind: "success", status: data.status });
      setEmail("");
    } catch {
      setState({ kind: "error", message: en ? "Subscription is temporarily unavailable. Please try again later." : "订阅暂时无法使用，请稍后再试。" });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} centered title={en ? "Get the AutoHot weekly briefing" : "订阅 AutoHot 每周汽车简报"}>
      <div className="px-5 pb-5 sm:px-6">
        <p className="text-[14px] font-semibold text-accent">{en ? "Free weekly briefing" : "每周精选 · 免费订阅"}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          {en ? "Once you confirm your email, you will receive the most important global automotive stories every Monday. You can unsubscribe from every email." : "确认邮箱后，每周一收到本周值得关注的全球汽车行业动态。每封邮件都可一键退订。"}
        </p>
        <form className="mt-5 flex flex-col gap-2" onSubmit={submit}>
          <label className="sr-only" htmlFor={`subscribe-email-${source}`}>{en ? "Email" : "邮箱"}</label>
          <input
            id={`subscribe-email-${source}`}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => { setEmail(event.target.value); if (state.kind === "error") setState({ kind: "idle" }); }}
            placeholder={en ? "Your email" : "你的邮箱"}
            className="h-11 min-w-0 rounded-full border border-line-strong bg-surface px-4 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent"
          />
          <button
            type="submit"
            disabled={state.kind === "sending"}
            className="h-11 rounded-full bg-accent px-6 text-[14px] font-medium text-accent-contrast transition-colors hover:bg-accent-ink disabled:opacity-60"
          >
            {state.kind === "sending" ? (en ? "Sending…" : "发送中…") : (en ? "Get the weekly briefing" : "订阅周报")}
          </button>
        </form>
        {state.kind === "success" && (
          <p className="mt-2 text-[12.5px] text-accent">
            {state.status === "active"
              ? (en ? "This email is already confirmed. No further action is needed." : "这个邮箱已经确认订阅，无需重复操作。")
              : (en ? "Confirmation email sent. Open it and click the confirmation link to finish subscribing." : "确认邮件已发送，请打开邮件并点击确认链接完成订阅。")}
          </p>
        )}
        {state.kind === "error" && <p className="mt-2 text-[12.5px] text-hot">{state.message}</p>}
        <p className="mt-2 text-[12px] text-ink-4">{en ? "We use your address only for the newsletter you requested." : "邮箱只用于发送你主动订阅的简报。"}</p>
      </div>
    </Sheet>
  );
}

function SubscribeButton({ source, label, className }: { source: SubscribeSource; label: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{label}</button>
      <SubscribeDialog open={open} onClose={() => setOpen(false)} source={source} />
    </>
  );
}

function HomeSubscribe() {
  const en = useSiteLanguage() === "en";
  return <SubscribeButton source="home" label={en ? "Weekly briefing" : "每周简报"} className="self-end rounded-full border border-accent/35 bg-accent-soft px-3.5 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent-softer" />;
}

function ReportSubscribe({ kind }: { kind: ReportKind }) {
  const en = useSiteLanguage() === "en";
  if (kind !== "daily") return null;
  return <SubscribeButton source="daily" label={en ? "Weekly email" : "订阅周报"} className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent-softer" />;
}

export const emailSubscribe = defineWebModule({
  name: "email-subscribe",
  homePage: async () => ({ default: HomeSubscribe }),
  reportPage: async () => ({ default: ReportSubscribe }),
});
