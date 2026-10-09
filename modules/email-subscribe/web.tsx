// The email sign-up button and its form. The homepage draws it under the desktop search field; a daily
// report draws it just before the issue time. Clicking either button opens the same centered dialog.
import { useEffect, useState, type FormEvent } from "react";
import type { ReportKind } from "@aihot/contracts/site";
import { defineWebModule } from "@aihot/web/modules";
import { Sheet } from "@aihot/web/components/ui/Sheet";

type SubscribeSource = "home" | "daily";
type SaveState = { kind: "idle" } | { kind: "sending" } | { kind: "success"; already: boolean } | { kind: "error"; message: string };

function SubscribeDialog({ open, onClose, source }: { open: boolean; onClose: () => void; source: SubscribeSource }) {
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
        body: JSON.stringify({ email, source }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; already?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setState({ kind: "error", message: data.message ?? "提交失败，请稍后再试。" });
        return;
      }
      setState({ kind: "success", already: !!data.already });
      setEmail("");
    } catch {
      setState({ kind: "error", message: "提交失败，请稍后再试。" });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} centered title="订阅汽车热点简报">
      <div className="px-5 pb-5 sm:px-6">
        <p className="text-[14px] font-semibold text-accent">新用户可免费体验一个月</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">留下邮箱，接收全球汽车行业精选、日报和重要动态。</p>
        <form className="mt-5 flex flex-col gap-2" onSubmit={submit}>
          <label className="sr-only" htmlFor={`subscribe-email-${source}`}>邮箱</label>
          <input
            id={`subscribe-email-${source}`}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => { setEmail(event.target.value); if (state.kind === "error") setState({ kind: "idle" }); }}
            placeholder="你的邮箱"
            className="h-11 min-w-0 rounded-full border border-line-strong bg-surface px-4 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent"
          />
          <button
            type="submit"
            disabled={state.kind === "sending"}
            className="h-11 rounded-full bg-accent px-6 text-[14px] font-medium text-accent-contrast transition-colors hover:bg-accent-ink disabled:opacity-60"
          >
            {state.kind === "sending" ? "提交中…" : "免费订阅"}
          </button>
        </form>
        {state.kind === "success" && (
          <p className="mt-2 text-[12.5px] text-accent">
            {state.already ? "这个邮箱已经在订阅列表中。" : "订阅成功，邮箱已记录。"}
          </p>
        )}
        {state.kind === "error" && <p className="mt-2 text-[12.5px] text-hot">{state.message}</p>}
        <p className="mt-2 text-[12px] text-ink-4">我们只用于发送订阅内容。</p>
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
  return <SubscribeButton source="home" label="免费订阅" className="self-end rounded-full border border-accent/35 bg-accent-soft px-3.5 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent-softer" />;
}

function ReportSubscribe({ kind }: { kind: ReportKind }) {
  if (kind !== "daily") return null;
  return <SubscribeButton source="daily" label="订阅" className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent-softer" />;
}

export const emailSubscribe = defineWebModule({
  name: "email-subscribe",
  homePage: async () => ({ default: HomeSubscribe }),
  reportPage: async () => ({ default: ReportSubscribe }),
});
