// 主供应商（OpenCode Zen）额度用尽时，自动把模型步骤切到备用供应商（Command Code），恢复了再切回来。
//
// 判定"用尽"用的是框架自带的同一套信号：receipt_attempts 里出现欠费/余额/402 这类拒绝，
// 且在 30 分钟内累计到 REFUSALS_TO_SWITCH 次。切回来看的是一次极小的探活请求。
//
// 切换走 admin/models.ts 的 switchModel()，所以和后台手动切换完全同一条路径：
// 有校验、有审计（后台"模型与评测"的历史里看得到）、缓存立刻失效。
// 切之前会把每一步原有的覆盖设置整份存进 settings 的 failover.saved，
// 恢复时原样写回——不会覆盖你在后台手动选的模型。
//
// 安全阀：FAILOVER_ENABLED=true 才跑（schedule 的 when），默认关。
import { sql } from "@aihot/backend/db";
import { switchModel } from "@aihot/backend/admin/models";
import { invalidateModelCache } from "@aihot/backend/editorial/models";
import { MODELS } from "@aihot/backend/providers/llm";
import type { Finding } from "@aihot/backend/notify/feishu";
import type { ServerModule } from "@aihot/backend/modules";

/** 每一步在主/备两边用哪个模型；primary 为 null 表示"不覆盖，用环境变量里的 default"。 */
const STEPS: Record<string, { primary: string | null; backup: string }> = {
  prefilter: { primary: "zen-deepseek-v4.1-flash-nothink", backup: "commandcode-deepseek-v4.1-flash-nothink" },
  structure: { primary: "zen-deepseek-v4.1-flash-nothink", backup: "commandcode-deepseek-v4.1-flash-nothink" },
  summarize: { primary: "zen-deepseek-v4.1-flash-nothink", backup: "commandcode-deepseek-v4.1-flash-nothink" },
  translate: { primary: "zen-deepseek-v4.1-flash-nothink", backup: "commandcode-deepseek-v4.1-flash-nothink" },
  score: { primary: null, backup: "commandcode-deepseek-v4.1-flash" },
  understand: { primary: null, backup: "commandcode-deepseek-v4.1-flash" },
  group: { primary: null, backup: "commandcode-deepseek-v4.1-flash" },
  groupReview: { primary: null, backup: "commandcode-deepseek-v4.1-flash" },
  digest: { primary: null, backup: "commandcode-deepseek-v4.1-flash" },
  report: { primary: null, backup: "commandcode-deepseek-v4.1-flash" },
};

const SAVED_KEY = "failover.saved";
/** 30 分钟内被拒多少次就切走。 */
const REFUSALS_TO_SWITCH = 3;
/** 切到备用后至少待多久才去探活主供应商，避免额度刚恢复就来回跳。 */
const MIN_BACKUP_MINUTES = 20;
/** 和框架的额度告警用同一套字样。 */
const REFUSAL = "(HTTP 40[123]|insufficient|balance|arrear|good standing|欠费|余额)";
const ACTOR = "auto-failover";

interface SavedState {
  at: string;
  /** 切换前每一步的设置；null 表示当时没有覆盖（用的是环境变量里的 default）。 */
  rows: Record<string, { model: string } | null>;
}

async function savedState(): Promise<SavedState | null> {
  const [r] = await sql<{ value: SavedState }[]>`SELECT value FROM settings WHERE key = ${SAVED_KEY}`;
  return r?.value ?? null;
}

/** 现在实际在用的 LLM 服务名（用来只统计主供应商的拒绝，不误伤 SocialData 之类）。 */
async function liveServices(): Promise<string[]> {
  const out = new Set<string>();
  for (const cap of Object.keys(STEPS)) {
    const [r] = await sql<{ key: string; value: { model?: string } }[]>`SELECT key, value FROM settings WHERE key = ${`models.${cap}`}`;
    const chosen = r?.value?.model ?? (STEPS[cap]!.primary ?? "default");
    const spec = MODELS[chosen];
    if (spec) out.add(spec.service);
  }
  return [...out];
}

async function recentRefusals(services: string[]): Promise<{ service: string; n: number; last: string }[]> {
  if (!services.length) return [];
  return sql<{ service: string; n: number; last: string }[]>`
    SELECT service, count(*)::int AS n, (array_agg(left(error, 200) ORDER BY started_at DESC))[1] AS last
    FROM receipt_attempts
    WHERE status = 'failed' AND started_at > now() - interval '30 minutes' AND service = ANY(${services}::text[])
      AND error ~* ${REFUSAL}
    GROUP BY 1 HAVING count(*) >= ${REFUSALS_TO_SWITCH}`;
}

/** 一次极小的探活：2xx 就算主供应商活着（余额恢复）。 */
async function primaryHealthy(): Promise<boolean> {
  const base = process.env.LLM_BASE_URL, key = process.env.LLM_API_KEY, model = process.env.LLM_MODEL;
  if (!base || !key || !model) return false;
  let extra: Record<string, unknown> = {};
  try { extra = JSON.parse(process.env.LLM_EXTRA_JSON ?? "{}") as Record<string, unknown>; } catch { extra = {}; }
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...(process.env.LLM_EXTRA_HEADERS ? JSON.parse(process.env.LLM_EXTRA_HEADERS) as Record<string, string> : {}) },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 64, ...extra }),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function switchToBackup(reason: string) {
  // 先把每一步现在的设置整份存下来，恢复时原样写回
  const rows: SavedState["rows"] = {};
  for (const cap of Object.keys(STEPS)) {
    const [r] = await sql<{ value: { model?: string } | null }[]>`SELECT value FROM settings WHERE key = ${`models.${cap}`}`;
    rows[cap] = r?.value?.model ? { model: r.value.model } : null;
  }
  const state: SavedState = { at: new Date().toISOString(), rows };
  await sql`INSERT INTO settings (key, value, updated_by) VALUES (${SAVED_KEY}, ${sql.json(state as never)}, ${ACTOR})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  for (const [cap, step] of Object.entries(STEPS)) await switchModel(cap, step.backup, reason, ACTOR);
}

async function restorePrimary(reason: string, state: SavedState) {
  for (const cap of Object.keys(STEPS)) {
    const before = state.rows[cap] ?? null;
    // switchModel 传 null 会删掉覆盖，等于回到环境变量里的 default
    await switchModel(cap, before ? before.model : null, reason, ACTOR);
  }
  await sql`DELETE FROM settings WHERE key = ${SAVED_KEY}`;
  invalidateModelCache();
}

async function run() {
  const state = await savedState();
  if (state) {
    const ageMinutes = (Date.now() - new Date(state.at).getTime()) / 60_000;
    if (ageMinutes < MIN_BACKUP_MINUTES) return { state: "backup", skipped: "刚切过来，先不动" };
    if (!(await primaryHealthy())) return { state: "backup", skipped: "主供应商还没恢复" };
    await restorePrimary("主供应商已恢复，切回", state);
    return { state: "primary", restored: true };
  }
  const refused = await recentRefusals(await liveServices());
  if (!refused.length) return { state: "primary", switched: false };
  const detail = refused.map((r) => `${r.service} ${r.n} 次：${r.last}`).join("；");
  await switchToBackup(`主供应商额度用尽，自动切到备用：${detail}`);
  return { state: "backup", switched: true, detail };
}

export const failover: ServerModule = {
  name: "failover",
  schedules: [
    {
      name: "failover.check",
      cron: "*/10 * * * *",
      missed: "skip",
      run,
      when: () => process.env.FAILOVER_ENABLED === "true",
    },
  ],
  alerts: async (): Promise<Finding[]> => {
    const state = await savedState();
    if (!state) return [];
    const at = new Date(state.at);
    return [{
      key: "failover.on_backup",
      level: "today",
      title: "模型正在用备用供应商（Command Code）",
      impact: "网站照常运行，只是模型调用走备用的账号计费",
      heals: "会，主供应商恢复后十分钟内自动切回",
      action: "可以先不管；想立刻切回就重启 worker，或者去后台“模型与评测”手动改",
      detail: `${at.toISOString()} 起切到备用，原因是主供应商的额度用尽或账号被拒`,
      since: at,
    }];
  },
};
