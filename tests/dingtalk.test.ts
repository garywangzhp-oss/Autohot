// 钉钉日报推送：把当天日报拼成一条 markdown 发给群机器人。这里验证四件事——加签地址、
// 消息内容（报头/头条/分栏/完整日报入口）、同一天不重复发，以及钉钉用 HTTP 200 + errcode
// 报出来的业务错误（加签不对、关键词不匹配）必须当失败处理。
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { closeDb, sql } from "@aihot/backend/db";
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/site";
import { dingtalk } from "../modules/dingtalk/server.ts";

const T = tag();
const DATE = beijingDate(new Date());
const ITEM = `dingtalk-item-${T}`;
const SOURCE = `dingtalk-source-${T}`;

let stub: Server;
let calls: Array<{ url: string; payload: any }> = [];
let replyBody = '{"errcode":0,"errmsg":"ok"}';

const run = dingtalk.schedules![0]!.run;

before(async () => {
  stub = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      calls.push({ url: req.url ?? "", payload: JSON.parse(raw || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(replyBody);
    });
  });
  await new Promise<void>((done) => stub.listen(0, "127.0.0.1", done));
  const address = stub.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.env.DINGTALK_PUSH_ENABLED = "true";
  process.env.DINGTALK_WEBHOOK_URL = `http://127.0.0.1:${port}/robot/send?access_token=test`;
  process.env.DINGTALK_SECRET = "SEC-test-secret";

  const at = new Date();
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${SOURCE},'钉钉测试源','rss','T2','editorial','2100-01-01')`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
    VALUES (${ITEM},${SOURCE},${ITEM},'https://example.org/dingtalk','钉钉测试条目',${at},${at})`;
  await sql`INSERT INTO publications (article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,body_mode,eligible,selected,visible_after,channel)
    VALUES (${ITEM},${SOURCE},'钉钉测试条目','摘要','https://example.org/dingtalk',${at},${at},${at},'summary',true,true,${at},'news')`;
  const content = {
    leadItemId: ITEM,
    lead: { title: `条目标题-${T}`, leadParagraph: `导语-${T}` },
    sections: [
      { label: "新车", items: [{ itemId: ITEM, title: `条目标题-${T}`, summary: `条目摘要-${T}`, sourceUrl: "https://example.org/dingtalk", sourceName: "钉钉测试源" }] },
      { label: "电动化", items: [] },
    ],
    flashes: [],
  };
  await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,origin)
    VALUES ('daily',${DATE},now() - interval '1 day',now(),${sql.json(content as never)},now(),'manual')
    ON CONFLICT (kind,key) DO UPDATE SET content = EXCLUDED.content`;
});

after(async () => {
  stub.close();
  await sql`DELETE FROM settings WHERE key = 'dingtalk.lastSent'`;
  await closeDb();
});

test("当天日报发一条 markdown；同一天不再重发；钉钉的业务错误算失败", async () => {
  const first = (await run()) as { sent?: string };
  assert.equal(first.sent, DATE);
  assert.equal(calls.length, 1, "只发了一条");

  const [call] = calls;
  const url = new URL(call.url, "http://stub");
  assert.ok(url.searchParams.get("timestamp"), "地址里带 timestamp");
  assert.ok(url.searchParams.get("sign"), "地址里带 sign（用了加签）");
  assert.equal(call.payload.msgtype, "markdown");

  const { title, text } = call.payload.markdown;
  assert.ok(title.includes(SITE.name), "标题带站名");
  assert.ok(title.includes(DATE), "标题带日期");
  assert.ok(text.includes(`条目标题-${T}`), "有条目");
  assert.ok(text.includes(`导语-${T}`), "有导语");
  assert.ok(text.includes(`/daily/${DATE}`), "有完整日报入口");
  assert.ok(!text.includes("电动化"), "空分栏不出现");

  const second = (await run()) as { skipped?: string };
  assert.ok(second.skipped, "同一天第二次是跳过");
  assert.equal(calls.length, 1, "没有重发");

  // 钉钉的业务错误（HTTP 200 + errcode 非 0）必须当失败，而且不能记成"已发"
  await sql`DELETE FROM settings WHERE key = 'dingtalk.lastSent'`;
  replyBody = '{"errcode":310000,"errmsg":"sign not match"}';
  await assert.rejects(() => run(), /310000|sign not match/);
  const left = await sql`SELECT 1 FROM settings WHERE key = 'dingtalk.lastSent'`;
  assert.equal(left.length, 0, "失败时没有记成已发");
});
