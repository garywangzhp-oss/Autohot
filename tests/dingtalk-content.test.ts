// 精选卡片推到钉钉：模块每 5 分钟看一次新进精选的条目，一条一张 actionCard（标题/正文/两个按钮），
// 推到哪记在水位线上（重启或重跑不会重发），已经不符合条件的跳过但水位线照样往前走。
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { closeDb, sql } from "@aihot/backend/db";
import { SITE } from "@aihot/site";
import { dingtalk } from "../modules/dingtalk/server.ts";

const T = tag();
const ITEM = `dingtalk-content-${T}`;
const SOURCE = `dingtalk-content-source-${T}`;
const TITLE = `精选标题-${T}`;

let stub: Server;
const calls: Array<{ url: string; payload: any }> = [];
const runContent = dingtalk.schedules!.find((s) => s.name === "dingtalk.content")!.run;

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

  const at = new Date(Date.now() - 60_000);
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${SOURCE},'钉钉精选测试源','rss','T1','editorial','2100-01-01')`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
    VALUES (${ITEM},${SOURCE},${ITEM},'https://example.org/dingtalk-content',${TITLE},${at},${at})`;
  await sql`INSERT INTO publications (article_id,source_id,title,summary,reason,url,timeline_at,published_at,discovered_at,sort_at,selected_ready_at,visible_after,body_mode,eligible,selected,channel)
    VALUES (${ITEM},${SOURCE},${TITLE},${"摘要-" + T},${"理由-" + T},'https://example.org/dingtalk-content',${at},${at},${at},${at},${at},${at},'summary',true,true,'news')`;
});

after(async () => {
  stub.close();
  await sql`DELETE FROM settings WHERE key = 'dingtalk.contentCursor'`;
  await closeDb();
});

test("新进精选推一条 actionCard，水位线挡住重发，不符合条件的跳过但水位线前进", async () => {
  const first = (await runContent()) as { sent: number };
  assert.equal(first.sent, 1, "推了一条");
  assert.equal(calls.length, 1);

  const [call] = calls;
  const url = new URL(call.url, "http://stub");
  assert.ok(url.searchParams.get("timestamp"), "带 timestamp");
  assert.ok(url.searchParams.get("sign"), "带加签（勾了加签）");
  assert.equal(call.payload.msgtype, "actionCard");
  const { title, text, btns } = call.payload.actionCard;
  assert.equal(title, TITLE, "卡片标题取条目标题");
  assert.ok(text.includes(`摘要-${T}`), "正文有摘要");
  assert.ok(text.includes(`理由-${T}`), "正文有推荐理由");
  assert.ok(text.includes("来源："), "正文有来源");
  assert.equal(btns.length, 2, "两个按钮");
  assert.ok(btns[0].title.includes(SITE.name), "第一个按钮是站内页");
  assert.equal(btns[1].title, "原文");
  assert.equal(btns[1].actionURL, "https://example.org/dingtalk-content");

  // 水位线挡住了：同一条不会再发
  const second = (await runContent()) as { sent: number };
  assert.equal(second.sent, 0, "不重发");
  assert.equal(calls.length, 1);

  // 又选上一条「太旧」的（超过 12 小时）：它进得了候选，但发不出去 —— 跳过，水位线要往前走，
  // 否则会永远卡在它上面，后面的精选都出不来。
  const now = new Date();
  const old = new Date(Date.now() - 20 * 3600_000);
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
    VALUES (${ITEM + "-2"},${SOURCE},${ITEM + "-2"},'https://example.org/dingtalk-content-2',${TITLE + "-2"},${now},${old})`;
  await sql`INSERT INTO publications (article_id,source_id,title,summary,url,timeline_at,published_at,discovered_at,sort_at,selected_ready_at,visible_after,body_mode,eligible,selected,channel)
    VALUES (${ITEM + "-2"},${SOURCE},${TITLE + "-2"},'摘要','https://example.org/dingtalk-content-2',${old},${old},${now},${old},${now},${now},'summary',true,true,'news')`;
  const third = (await runContent()) as { sent: number; skipped?: string[] };
  assert.equal(third.sent, 0, "太旧的不推");
  assert.equal(third.skipped?.length, 1, "记了跳过原因");
  assert.equal(calls.length, 1);
  const [cursor] = await sql<{ value: { id: string } }[]>`SELECT value FROM settings WHERE key = 'dingtalk.contentCursor'`;
  assert.equal(cursor!.value.id, `${ITEM}-2`, "水位线走到了那条之前");
});
