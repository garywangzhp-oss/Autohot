// 主供应商因余额问题拒绝服务时，所有模型步骤自动切到备用供应商（Command Code）；
// 探活说它恢复了，再自动切回。手工改过的步骤在切换和切回后都要原样保留。
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { closeDb, sql } from "@aihot/backend/db";
import { failover } from "../modules/failover/server.ts";

const T = tag();
const QUOTA_ERROR = "llm HTTP 402: insufficient balance 余额不足";
/** OpenCode 的套餐额度用尽长这样：429 + GoUsageLimitError（不是 402/403，字面也没有"余额"）。 */
const USAGE_LIMIT_ERROR = 'llm HTTP 429: {"type":"error","error":{"type":"GoUsageLimitError","message":"Go usage limit exceeded"}}';
/** 探活的假主供应商返回什么。 */
let probeStatus = 402;
let stub: Server;
let probeUrl = "";

const schedule = failover.schedules![0]!;
const run = schedule.run;
const modelsOf = async () => new Map((await sql<{ key: string; value: { model: string } }[]>`SELECT key, value FROM settings WHERE key LIKE 'models.%'`).map((r) => [r.key.slice("models.".length), r.value.model]));
const backup = async () => (await sql`SELECT 1 FROM settings WHERE key = 'failover.saved'`).length > 0;

/** One refused attempt, the way the engine records them. */
async function refusal(n: number, error = QUOTA_ERROR) {
  const [rc] = await sql<{ id: number }[]>`INSERT INTO receipts (logical_key, service, model, purpose, status)
    VALUES (${`failover-${T}-${n}`}, 'opencode', 'deepseek-v4.1-flash', 'prefilter_article', 'failed') RETURNING id`;
  await sql`INSERT INTO receipt_attempts (receipt_id, service, attempt, status, error, origin, started_at)
    VALUES (${rc!.id}, 'opencode', 1, 'failed', ${error}, 'live', now() - interval '5 minutes')`;
}

before(async () => {
  stub = createServer((_req, res) => {
    res.writeHead(probeStatus, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "pong" } }] }));
  });
  await new Promise<void>((done) => stub.listen(0, "127.0.0.1", done));
  const addr = stub.address();
  probeUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/v1`;
  process.env.LLM_BASE_URL = probeUrl;
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "deepseek-v4.1-flash";
  process.env.FAILOVER_ENABLED = "true";
});
after(async () => {
  stub.close();
  await sql`DELETE FROM settings WHERE key LIKE 'models.%' OR key = 'failover.saved'`;
  await closeDb();
});

test("一次被拒不动，攒够三次才切；切到备用后告警，探活恢复后切回", async () => {
  // 操作员手工把评分换成别的模型——切换和切回都不能把它弄丢
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('models.score', ${sql.json({ model: "zen-glm-5.3-flash" })}, 'test')`;

  await refusal(1);
  await refusal(2);
  assert.equal((await run() as { switched?: boolean }).switched, false, "只被拒两次不该切");
  assert.equal(await backup(), false);

  await refusal(3);
  assert.deepEqual(await run(), { state: "backup", switched: true, detail: `opencode 3 次：${QUOTA_ERROR}` });

  const moved = await modelsOf();
  assert.equal(moved.get("score"), "commandcode-deepseek-v4.1-flash", "评分也切到备用");
  assert.equal(moved.get("prefilter"), "commandcode-deepseek-v4.1-flash-nothink", "预筛切到备用的关推理预设");
  assert.equal(moved.get("digest"), "commandcode-deepseek-v4.1-flash");
  assert.equal(await backup(), true, "切换前的原值存了下来");
  assert.deepEqual((await failover.alerts!(Date.now())).map((f) => f.key), ["failover.on_backup"]);

  // 刚切过来时探活成功也不动，避免来回跳
  probeStatus = 200;
  assert.equal((await run() as { restored?: boolean }).restored, undefined, "冷却期内不切回");

  // 过了冷却，主供应商活着 → 切回
  await sql`UPDATE settings SET value = jsonb_set(value, '{at}', to_jsonb(${new Date(Date.now() - 30 * 60_000).toISOString()}::text)) WHERE key = 'failover.saved'`;
  assert.deepEqual(await run(), { state: "primary", restored: true });

  const back = await modelsOf();
  assert.equal(back.get("score"), "zen-glm-5.3-flash", "手工选的模型原样回来了");
  for (const cap of ["prefilter", "structure", "summarize", "translate", "understand", "group"]) {
    assert.equal(back.has(cap), false, `${cap} 回到代码默认（不留下覆盖）`);
  }
  assert.equal(await backup(), false, "备用标记清掉了");
  assert.equal((await failover.alerts!(Date.now())).length, 0, "切回后告警消失");
});

test("OpenCode 的套餐额度用尽（HTTP 429 + Go usage limit exceeded）也算被拒，会触发切换", async () => {
  // 先把上一个测试留下的拒绝记录清掉，这样这次切换只可能是被 usage limit 触发的
  await sql`DELETE FROM receipt_attempts WHERE receipt_id IN (SELECT id FROM receipts WHERE logical_key LIKE ${"failover-" + T + "%"})`;
  await sql`DELETE FROM receipts WHERE logical_key LIKE ${"failover-" + T + "%"}`;

  for (let i = 0; i < 3; i++) await refusal(100 + i, USAGE_LIMIT_ERROR);
  const moved = (await run()) as { state: string; switched?: boolean; detail?: string };
  assert.equal(moved.state, "backup", "按文案认出了套餐额度用尽");
  assert.equal(moved.switched, true);
  assert.deepEqual(moved.detail, `opencode 3 次：${USAGE_LIMIT_ERROR}`);

  // 收尾：切回主供应商
  await sql`UPDATE settings SET value = jsonb_set(value, '{at}', to_jsonb(${new Date(Date.now() - 30 * 60_000).toISOString()}::text)) WHERE key = 'failover.saved'`;
  probeStatus = 200;
  assert.deepEqual(await run(), { state: "primary", restored: true });
});
