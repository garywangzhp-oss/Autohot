// 钉钉群机器人，两件事：
//   1) 每天出刊后把当天日报发到群里（一条 markdown）；
//   2) 每 5 分钟看一次新进精选的条目，一条一张 actionCard。
//
// 开关（默认都关）：DINGTALK_PUSH_ENABLED（日报）、DINGTALK_CONTENT_PUSH_ENABLED（精选卡片）。
// 凭据：DINGTALK_WEBHOOK_URL（同一个机器人就行）+ DINGTALK_SECRET（安全设置勾「加签」给的那串）。
//
// 精选卡片为什么不走框架的通知目的地：那张表的 kind 只有 feishu_webhook / feishu_chat / log，
// 加一个 kind 要放宽 CHECK 约束，而在线迁移白名单不允许 DROP CONSTRAINT（scripts/migration-safety.ts），
// 加了会在 tests/migration-check.test.ts 里失败。所以这块由模块自己发：进度是 settings 里的一条
// 水位线（selected_ready_at + article_id），发一条推一格，重启和补跑都不会重发。
import { createHmac } from "node:crypto";
import { sql } from "@aihot/backend/db";
import { selectedContent } from "@aihot/backend/notify/selected-content";
import { dailyWithNotes } from "@aihot/backend/publication/reports";
import { beijingDate } from "@aihot/contracts/time";
import { EDITION_TIMES, SITE } from "@aihot/site";
import type { Finding } from "@aihot/backend/notify/feishu";
import type { ServerModule } from "@aihot/backend/modules";

/** 日报发过的日期；补跑不会重发。 */
const DAILY_SENT = "dingtalk.lastSent";
/** 精选卡片推到哪了（selected_ready_at + article_id）。 */
const CONTENT_CURSOR = "dingtalk.contentCursor";
/** 一条 markdown 里最多列几条新闻。 */
const MAX_ITEMS = 12;
/** 一次最多推几条精选，避免积压时刷屏。 */
const MAX_CARDS_PER_RUN = 5;

const dailyEnabled = () => process.env.DINGTALK_PUSH_ENABLED === "true";
const contentEnabled = () => process.env.DINGTALK_CONTENT_PUSH_ENABLED === "true";
const webhook = () => (process.env.DINGTALK_WEBHOOK_URL ?? "").trim();
const secret = () => (process.env.DINGTALK_SECRET ?? "").trim();

/** 加签：把 timestamp 和 HMAC-SHA256(secret, `timestamp\nsecret`) 拼回地址。 */
function signedWebhook(url: string): string {
  const s = secret();
  if (!s) return url;
  const at = Date.now();
  const sign = createHmac("sha256", s).update(`${at}\n${s}`).digest("base64");
  const out = new URL(url);
  out.searchParams.set("timestamp", String(at));
  out.searchParams.set("sign", sign);
  return out.toString();
}

/** 钉钉的失败有两种：HTTP 非 2xx，和 HTTP 200 但 errcode 非 0（加签错、关键词不匹配都是后者）。 */
async function post(payload: Record<string, unknown>): Promise<string> {
  const url = webhook();
  if (!url) throw new Error("DINGTALK_WEBHOOK_URL is not configured");
  const res = await fetch(signedWebhook(url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  let errcode: number | undefined;
  try { errcode = (JSON.parse(body) as { errcode?: number }).errcode; } catch { errcode = undefined; }
  if (!res.ok || (errcode !== undefined && errcode !== 0)) throw new Error(`dingtalk HTTP ${res.status}: ${body.slice(0, 300)}`);
  return body.slice(0, 200);
}

/**
 * 精选卡片的形状来自引擎（selected-content.ts 生成的是飞书交互卡片）：这里翻成钉钉的 actionCard，
 * 标题、正文和两个按钮都保留。
 */
export function actionCardOf(card: unknown): { title: string; text: string; btnOrientation: string; btns?: Array<{ title: string; actionURL: string }> } {
  const c = (card ?? {}) as { header?: { title?: { content?: string } }; elements?: Array<Record<string, any>> };
  const title = c.header?.title?.content?.trim() || "新内容";
  const parts: string[] = [];
  const btns: Array<{ title: string; actionURL: string }> = [];
  for (const el of c.elements ?? []) {
    if (el.tag === "note") {
      const note = (el.elements ?? []).map((x: any) => x?.content ?? "").join(" ").trim();
      if (note) parts.push(`> ${note}`);
    } else if (el.tag === "div") {
      const text = el.text?.content?.trim();
      if (text) parts.push(text);
    } else if (el.tag === "action") {
      for (const action of el.actions ?? []) {
        const label = action?.text?.content?.trim();
        if (action?.url && label) btns.push({ title: label, actionURL: String(action.url) });
      }
    }
  }
  return { title, text: parts.join("\n\n"), btnOrientation: "0", ...(btns.length ? { btns } : {}) };
}

const sendCard = (card: unknown) => post({ msgtype: "actionCard", actionCard: actionCardOf(card) });

type DailyReport = NonNullable<Awaited<ReturnType<typeof dailyWithNotes>>>["body"]["report"];
/** 日报里一条新闻的公开形状（report.sections[].items[]）。 */
type ReportItem = { title: string; links: { aihot: string | null; original: string | null } };

/** 一条 markdown：报头 + 头条 + 分栏条目标题（带链接）+ 完整日报入口。 */
function message(report: DailyReport): { title: string; text: string } {
  const title = `${SITE.name} 日报 · ${report.date}`;
  const lines: string[] = [`### ${title}`, ""];
  // 规则成刊的日报一定有头条；手工编辑过、或头条那条被撤掉的就没有，退而用第一条当头条。
  const first = report.sections.flatMap((s: { items?: ReportItem[] }) => s.items ?? []).find((item: ReportItem) => item.title);
  const headline = report.lead?.title || first?.title;
  const paragraph = (report.lead?.leadParagraph ?? "").trim();
  if (headline) {
    lines.push(`**${headline}**`);
    if (paragraph) lines.push(paragraph);
    lines.push("");
  }
  let shown = 0;
  let rest = 0;
  for (const section of report.sections) {
    const items: ReportItem[] = section.items ?? [];
    const linked = items.filter((item) => item.links.aihot || item.links.original);
    rest += linked.length;
    const take = linked.slice(0, Math.max(0, MAX_ITEMS - shown));
    rest -= take.length;
    if (!take.length) continue;
    lines.push(`**${section.label}**`);
    for (const item of take) {
      shown++;
      lines.push(`- [${item.title}](${item.links.aihot ?? item.links.original})`);
    }
    lines.push("");
  }
  if (rest > 0) lines.push(`…另有 ${rest} 条，见完整日报`, "");
  lines.push(`[查看完整日报](${report.links.aihot})`);
  return { title, text: lines.join("\n").trim() };
}

async function readValue<T>(key: string): Promise<T | undefined> {
  const [row] = await sql<{ value: T }[]>`SELECT value FROM settings WHERE key = ${key}`;
  return row?.value;
}

async function writeValue(key: string, value: unknown) {
  await sql`INSERT INTO settings (key, value, updated_by) VALUES (${key}, ${sql.json(value as never)}, 'dingtalk')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
}

async function pushDaily() {
  const date = beijingDate(new Date());
  if ((await readValue<{ date?: string }>(DAILY_SENT))?.date === date) return { skipped: `今天已经发过了（${date}）` };
  const report = await dailyWithNotes(date);
  if (!report) return { skipped: `今天的日报还没出刊（${date}）` };
  const { title, text } = message(report.body.report);
  const answer = await post({ msgtype: "markdown", markdown: { title, text } });
  await writeValue(DAILY_SENT, { date });
  return { sent: date, answer };
}

async function pushContent() {
  const cursor = await readValue<{ at: string; id: string }>(CONTENT_CURSOR);
  const after = cursor ? sql`AND (p.selected_ready_at, p.article_id) > (${cursor.at}::timestamptz, ${cursor.id}::text)` : sql``;
  // 候选只挑规则允许进内容群的：精选、公开、已发布，且是一手/准一手信源（跟 selected-content.ts 一致）。
  const candidates = await sql<{ article_id: string; selected_ready_at: Date }[]>`
    SELECT p.article_id, p.selected_ready_at
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.selected AND p.visibility = 'public' AND p.eligible AND p.visible_after <= now()
      AND p.selected_ready_at IS NOT NULL
      AND s.participation_mode = 'editorial' AND s.tier IN ('T1', 'T1_5')
      ${after}
    ORDER BY p.selected_ready_at, p.article_id
    LIMIT ${MAX_CARDS_PER_RUN}`;
  let sent = 0;
  const skipped: string[] = [];
  for (const candidate of candidates) {
    const content = await selectedContent(candidate.article_id);
    if (content.status === "ready") {
      await sendCard(content.card);
      sent++;
    } else {
      // 已经被撤回、超过 12 小时、或不再符合条件：跳过，但水位线照样往前走，否则会永远卡在这一条。
      skipped.push(`${candidate.article_id}: ${content.reason}`);
    }
    await writeValue(CONTENT_CURSOR, { at: candidate.selected_ready_at.toISOString(), id: candidate.article_id });
  }
  return { candidates: candidates.length, sent, ...(skipped.length ? { skipped } : {}) };
}

/** 出刊时间 + 10 分钟和 + 40 分钟各试一次：成刊是每半小时一轮，十分钟时可能还没出炉。 */
function kickoffCrons(): string[] {
  const [hour, minute] = EDITION_TIMES.daily.split(":").map(Number);
  const base = hour! * 60 + minute!;
  return [10, 40].map((after) => {
    const at = (base + after) % 1440;
    return `${at % 60} ${Math.floor(at / 60)} * * *`;
  });
}
const CRONS = kickoffCrons();

export const dingtalk: ServerModule = {
  name: "dingtalk",
  schedules: [
    ...CRONS.map((cron, i) => ({
      name: i === 0 ? "dingtalk.daily" : "dingtalk.daily-retry",
      cron,
      missed: "once" as const,
      run: pushDaily,
      when: dailyEnabled,
    })),
    { name: "dingtalk.content", cron: "*/5 * * * *", missed: "skip" as const, run: pushContent, when: contentEnabled },
  ],
  alerts: async (): Promise<Finding[]> => ((dailyEnabled() || contentEnabled()) && !webhook()
    ? [{
        key: "dingtalk.unconfigured",
        level: "later",
        title: "钉钉推送开着，但没配机器人地址",
        impact: "日报和精选卡片都发不到钉钉群",
        heals: "不会",
        action: "在 .env 里填 DINGTALK_WEBHOOK_URL（勾了加签再填 DINGTALK_SECRET），然后重启 worker",
        owner: true,
      }]
    : []),
};
