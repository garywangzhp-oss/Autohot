// The email sign-up card. It is mounted once at the bottom of the public site and only draws on the
// home page and daily report, where a reader is most likely to want the next issue.
import { useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { defineWebModule } from "@aihot/web/modules";

type SaveState = { kind: "idle" } | { kind: "sending" } | { kind: "success"; already: boolean } | { kind: "error"; message: string };

function SubscribeCard({ source }: { source: "home" | "daily" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SaveState>({ kind: "idle" });

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
    <section className="mx-auto mt-6 w-full max-w-[640px] px-[var(--gutter-l)] lg:max-w-[var(--page-max-wide)] lg:px-7">
      <div className="rounded-card border border-line-strong bg-surface p-5 shadow-sm sm:p-6">
        <div className="text-[17px] font-bold text-ink">订阅汽车热点简报</div>
        <p className="mt-1.5 max-w-[720px] text-[13px] leading-relaxed text-ink-3">
          留下邮箱，接收全球汽车行业精选、日报和重要动态。
        </p>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
          <label className="sr-only" htmlFor={`subscribe-email-${source}`}>邮箱</label>
          <input
            id={`subscribe-email-${source}`}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => { setEmail(event.target.value); if (state.kind === "error") setState({ kind: "idle" }); }}
            placeholder="你的邮箱"
            className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent"
          />
          <button
            type="submit"
            disabled={state.kind === "sending"}
            className="h-11 shrink-0 rounded-full bg-accent px-6 text-[14px] font-medium text-accent-contrast transition-colors hover:bg-accent-ink disabled:opacity-60"
          >
            {state.kind === "sending" ? "提交中…" : "订阅"}
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
    </section>
  );
}

function SubscribeSlot() {
  const { pathname } = useLocation();
  const home = pathname === "/";
  const daily = pathname === "/daily" || /^\/daily\/\d{4}-\d{2}-\d{2}$/.test(pathname);
  return home || daily ? <SubscribeCard source={home ? "home" : "daily"} /> : null;
}

export const emailSubscribe = defineWebModule({
  name: "email-subscribe",
  root: { Bottom: SubscribeSlot },
});
