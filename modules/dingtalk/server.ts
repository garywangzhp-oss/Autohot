// 钉钉群机器人：每天出刊后把当天日报发到群里（一条 markdown 消息）。
//
// 安全阀 DINGTALK_PUSH_ENABLED=true 才跑，默认关。两个环境变量：
//   DINGTALK_WEBHOOK_URL  https://oapi.dingtalk.com/robot/send?access_token=...
//   DINGTALK_SECRET       安全设置选「加签」时给的那串 SEC 开头的密钥（可选，但建议配上）
//
// 防重：发过的日期记在 settings 的 dingtalk.lastSent，重启或补跑都不会重复发。
import { createHmac } from "node:crypto";
import { sql } from "@aihot/backend/db";
import { dailyWithNotes } from "@aihot/backend/publication/reports";
import { beijingDate } from "@aihot/contracts/time";
import { EDITION_TIMES, SITE } from "@aihot/site";
import type { Finding } from "@aihot/backend/notify/feishu";
import type { ServerModule } from "@aihot/backend/modules";

/** 一条消息里最多列几条新闻，其余只进完整日报。 */
const MAX_ITEMS = 12;
/** 发过的日期；补跑不会重发。 */
const LAST_SENT = "dingtalk.lastSent";

const enabled = () => process.env.DINGTALK_PUSH_ENABLED === "true";
const webhook = () => (process.env.DINGTALK_WEBHOOK_URL ?? "").trim();
const secret = () => (process.env.DINGTALK_SECRET ?? "").trim();

/** 加签：把 timestamp 和 HMAC-SHA256(secret, `timestamp\nsecret`) 拼回地址。 */
function signedUrl(url: string): string {
  const s = secret();
  if (!s) return url;
  const timestamp = Date.now();
  const sign = createHmac("sha256", s).update(`${timestamp}\n${s}`).digest("base64");
  const out = new URL(url);
  out.searchParams.set("timestamp", String(timestamp));
  out.searchParams.set("sign", sign);
  return out.toString();
}

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

/** 钉钉的失败有两种：HTTP 非 2xx，和 HTTP 200 但 errcode 非 0（加签错、关键词不匹配都是这种）。 */
async function post(text: string, title: string): Promise<string> {
  const url = webhook();
  if (!url) throw new Error("DINGTALK_WEBHOOK_URL is not configured");
  const res = await fetch(signedUrl(url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msgtype: "markdown", markdown: { title, text } }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  let errcode: number | undefined;
  try { errcode = (JSON.parse(body) as { errcode?: number }).errcode; } catch { errcode = undefined; }
  if (!res.ok || (errcode !== undefined && errcode !== 0)) throw new Error(`dingtalk HTTP ${res.status}: ${body.slice(0, 300)}`);
  return body.slice(0, 200);
}

async function pushDaily() {
  const date = beijingDate(new Date());
  const [sent] = await sql<{ value: { date?: string } }[]>`SELECT value FROM settings WHERE key = ${LAST_SENT}`;
  if (sent?.value?.date === date) return { skipped: `今天已经发过了（${date}）` };
  const report = await dailyWithNotes(date);
  if (!report) return { skipped: `今天的日报还没出刊（${date}）` };
  const { title, text } = message(report.body.report);
  const answer = await post(text, title);
  await sql`INSERT INTO settings (key, value, updated_by) VALUES (${LAST_SENT}, ${sql.json({ date } as never)}, 'dingtalk')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  return { sent: date, answer };
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
  schedules: CRONS.map((cron, i) => ({
    name: i === 0 ? "dingtalk.daily" : "dingtalk.daily-retry",
    cron,
    missed: "once" as const,
    run: pushDaily,
    when: enabled,
  })),
  alerts: async (): Promise<Finding[]> => (enabled() && !webhook()
    ? [{
        key: "dingtalk.unconfigured",
        level: "later",
        title: "钉钉日报推送开着，但没配机器人地址",
        impact: "日报不会发到钉钉群",
        heals: "不会",
        action: "在 .env 里填 DINGTALK_WEBHOOK_URL（配了加签再填 DINGTALK_SECRET），然后重启 worker",
        owner: true,
      }]
    : []),
};
