// 精选卡片推到钉钉：模块每 5 分钟看一次新进精选，一条一张 actionCard（标题/正文/两个按钮）。
// 第一次运行只把水位线定在「此刻」，不倒历史；之后每条推一次，重启或重跑不重发；
// 太旧的条目跳过，但水位线照样往前走，不会卡住后面的。
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { closeDb, sql } from "@aihot/backend/db";
import { SITE } from "@aihot/site";
import { dingtalk } from "../modules/dingtalk/server.ts";

const T = tag();
const SOURCE = `dingtalk-content-source-${T}`;
const TITLE = `精选标题-${T}`;

let stub: Server;
const calls: Array<{ url: string; payload: any }> = [];
const runContent = dingtalk.schedules!.find((s) => s.name === "dingtalk.content")!.run;

/** 造一条精选：at 决定它在时间线上的位置（12 小时内才算 live）。 */
async function selected(id: string, at: Date) {
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
    VALUES (${id},${SOURCE},${id},${`https://example.org/${id}`},${TITLE},${at},${at})`;
  await sql`INSERT INTO publications (article_id,source_id,title,summary,reason,url,timeline_at,published_at,discovered_at,sort_at,selected_ready_at,visible_after,body_mode,eligible,selected,channel)
    VALUES (${id},${SOURCE},${TITLE},${"摘要-" + T},${"理由-" + T},${`https://example.org/${id}`},${at},${at},${at},${at},${at},${at},'summary',true,true,'news')`;
}

before(async () => {
  stub = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      calls.push({ url: req.url ?? "", payload: JSON.parse(raw || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"errcode":0,"errmsg":"ok"}');
    });
  });
  await new Promise<void>((done) => stub.listen(0, "127.0.0.1", done));
  const address = stub.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.env.DINGTALK_CONTENT_PUSH_ENABLED = "true";
  process.env.DINGTALK_WEBHOOK_URL = `http://127.0.0.1:${port}/robot/send?access_token=test`;
  process.env.DINGTALK_SECRET = "SEC-test-secret";
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${SOURCE},'钉钉精选测试源','rss','T1','editorial','2100-01-01')`;
});

after(async () => {
  stub.close();
  await sql`DELETE FROM settings WHERE key = 'dingtalk.contentCursor'`;
  await closeDb();
});

test("首次只定水位线不倒历史；之后的每条推一次；太旧的跳过但水位线前进", async () => {
  // 启用之前就已经精选好的：不该倒进群里
  await selected(`${T}-old`, new Date(Date.now() - 2 * 3600_000));
  const first = (await runContent()) as { candidates: number; sent: number; note?: string };
  assert.equal(first.sent, 0, "首次不倒历史");
  assert.ok(first.note, "说明了为什么");
  assert.equal(calls.length, 0);

  // 此刻之后新进精选的：一条一张卡片
  const id = `${T}-new`;
  await selected(id, new Date());
  const second = (await runContent()) as { sent: number };
  assert.equal(second.sent, 1, "推了一条");
  assert.equal(calls.length, 1);

  const [call] = calls;
  const url = new URL(call.url, "http://stub");
  assert.ok(url.searchParams.get("timestamp"), "带 timestamp");
  assert.ok(url.searchParams.get("sign"), "带加签");
  assert.equal(call.payload.msgtype, "actionCard");
  const { title, text, btns } = call.payload.actionCard;
  assert.equal(title, TITLE, "卡片标题取条目标题");
  assert.ok(text.includes(`摘要-${T}`), "正文有摘要");
  assert.ok(text.includes(`理由-${T}`), "正文有推荐理由");
  assert.ok(text.includes("来源："), "正文有来源");
  assert.equal(btns.length, 2, "两个按钮");
  assert.ok(btns[0].title.includes(SITE.name), "第一个按钮是站内页");
  assert.equal(btns[1].title, "原文");
  assert.equal(btns[1].actionURL, `https://example.org/${id}`);

  const third = (await runContent()) as { sent: number };
  assert.equal(third.sent, 0, "同一条不重发");
  assert.equal(calls.length, 1);

  // 又有一条「补录进历史」的（backfill）：进得了候选，但 selectedContent 会判 not live。
  // 跳过它，水位线照样往前走 —— 否则后面真正的精选会被它永远堵住。
  const stale = `${T}-stale`;
  await selected(stale, new Date());
  await sql`UPDATE publications SET backfill = true WHERE article_id = ${stale}`;
  const fourth = (await runContent()) as { candidates: number; sent: number; skipped?: string[] };
  assert.equal(fourth.candidates, 1, "它进得了候选");
  assert.equal(fourth.sent, 0, "补录的不推");
  assert.equal(fourth.skipped?.length, 1, "记了跳过原因");
  assert.ok(fourth.skipped![0]!.includes("not live"), "原因是 not live");
  const [cursor] = await sql<{ value: { id: string } }[]>`SELECT value FROM settings WHERE key = 'dingtalk.contentCursor'`;
  assert.equal(cursor!.value.id, stale, "水位线走到了它之后，不会堵住后面的");
});
