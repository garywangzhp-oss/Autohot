// JEV (TypeSafe AI System One) shadow score gate.
//
// The normal two-score analysis runs exactly as before. After it commits, this module asks JEV what it
// would have decided from the first score alone, then stores both the decision and the real second score
// / final selection. The gate is shadow-only: it never changes what the engine publishes.
//
// Configuration:
//   JEV_SHADOW_ENABLED=true
//   TYPESAFE_API_KEY=...
//   JEV_MODEL=jev-1.13.0              optional
//   TYPESAFE_BASE_URL=https://api.typesafe.ai  optional
import { sql } from "@aihot/backend/db";
import { logError } from "@aihot/backend/lib/log-error";
import { defineServerModule, type ScoreGateShadowInput } from "@aihot/backend/modules";
import type { Finding } from "@aihot/backend/notify/feishu";
import { assertAccepted, completeReceipt, paidRequest, ReceiptUnknownError } from "@aihot/backend/providers/receipts";

const enabled = () => process.env.JEV_SHADOW_ENABLED === "true";
const apiKey = () => (process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY ?? "").trim();
const baseUrl = () => (process.env.TYPESAFE_BASE_URL ?? process.env.JEV_BASE_URL ?? "https://api.typesafe.ai").replace(/\/$/, "");
const model = () => (process.env.JEV_MODEL ?? "jev-1.13.0").trim();
const timeoutMs = () => Math.max(1000, Number(process.env.JEV_SHADOW_TIMEOUT_MS ?? 8000) || 8000);

const QUESTIONS = {
  gate: {
    type: "choice",
    instructions: "Choose what the second-score gate should do using only the article state, first_score, threshold, and score_model. The final rule is average(first_score, second_score) >= threshold.",
    criteria: {
      score_again: "The first score or the article leaves enough uncertainty that a second score should be requested.",
      select: "The first score and article make selection likely enough that a second score can be skipped.",
      reject: "The first score and article make selection unlikely enough that a second score can be skipped.",
    },
  },
  final_selected: {
    type: "noul",
    instructions: {
      question: "If the same scoring model drew a second independent score, would the average meet threshold?",
      focus: "Use only the article state, first_score, threshold and score_model. Do not assume the second score is known.",
    },
    criteria: {
      true: "The average of first_score and a plausible independent second score would be at least threshold.",
      false: "The average of first_score and a plausible independent second score would be below threshold.",
    },
  },
} as const;

function answerChoice(answer: unknown): string | null {
  if (typeof answer === "string") return answer;
  if (answer && typeof answer === "object" && typeof (answer as Record<string, unknown>).choice === "string") {
    return String((answer as Record<string, unknown>).choice);
  }
  return null;
}

function answerProbability(answer: unknown): number | null {
  if (typeof answer === "number" && Number.isFinite(answer)) return answer;
  if (answer && typeof answer === "object") {
    const value = (answer as Record<string, unknown>).noul ?? (answer as Record<string, unknown>).probability ?? (answer as Record<string, unknown>).confidence;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

async function writePending(input: ScoreGateShadowInput): Promise<void> {
  await sql`
    INSERT INTO selection_gate_shadow
      (article_id, revision, source_name, source_kind, source_tier, score_model, score_prompt_version, threshold, first_score,
       second_score, final_score, selected_by_score, gate_status)
    VALUES
      (${input.articleId}, ${input.revision}, ${input.source.name}, ${input.source.kind}, ${input.source.tier}, ${input.scoreModel},
       ${input.scorePromptVersion}, ${input.threshold}, ${input.scores[0]!}, ${input.scores[1] ?? null}, ${input.score}, ${input.selectedByScore}, 'pending')
    ON CONFLICT (article_id, revision) DO UPDATE SET
      source_name = EXCLUDED.source_name, source_kind = EXCLUDED.source_kind, source_tier = EXCLUDED.source_tier,
      score_model = EXCLUDED.score_model, score_prompt_version = EXCLUDED.score_prompt_version, threshold = EXCLUDED.threshold,
      first_score = EXCLUDED.first_score, second_score = EXCLUDED.second_score, final_score = EXCLUDED.final_score,
      selected_by_score = EXCLUDED.selected_by_score, gate_status = 'pending', error = NULL, completed_at = NULL
  `;
}

async function writeResult(input: ScoreGateShadowInput, result: {
  status: "received" | "failed" | "unknown";
  decision?: string | null;
  confidence?: number | null;
  answer?: unknown;
  model?: string | null;
  receiptId?: number | null;
  usage?: Record<string, unknown> | null;
  error?: string | null;
}): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO selection_gate_shadow
        (article_id, revision, source_name, source_kind, source_tier, score_model, score_prompt_version, threshold, first_score,
         second_score, final_score, selected_by_score, gate_status, gate_decision, gate_confidence, gate_answer, gate_model,
         gate_receipt_id, gate_usage, error, completed_at)
      VALUES
        (${input.articleId}, ${input.revision}, ${input.source.name}, ${input.source.kind}, ${input.source.tier}, ${input.scoreModel},
         ${input.scorePromptVersion}, ${input.threshold}, ${input.scores[0]!}, ${input.scores[1] ?? null}, ${input.score},
         ${input.selectedByScore}, ${result.status}, ${result.decision ?? null}, ${result.confidence ?? null},
         ${result.answer ? tx.json(result.answer as never) : null}, ${result.model ?? null}, ${result.receiptId ?? null},
         ${result.usage ? tx.json(result.usage as never) : null}, ${result.error ?? null}, now())
      ON CONFLICT (article_id, revision) DO UPDATE SET
        gate_status = EXCLUDED.gate_status, gate_decision = EXCLUDED.gate_decision, gate_confidence = EXCLUDED.gate_confidence,
        gate_answer = EXCLUDED.gate_answer, gate_model = EXCLUDED.gate_model, gate_receipt_id = EXCLUDED.gate_receipt_id,
        gate_usage = EXCLUDED.gate_usage, error = EXCLUDED.error, completed_at = now()
    `;
    if (result.receiptId && result.status === "received") await completeReceipt(tx, result.receiptId);
  });
}

export async function runJevShadow(input: ScoreGateShadowInput): Promise<void> {
  if (!enabled()) return;
  await writePending(input);
  const key = apiKey();
  if (!key) {
    await writeResult(input, { status: "failed", error: "TYPESAFE_API_KEY (or JEV_API_KEY) is not configured" });
    return;
  }

  const payload = {
    model: model(),
    state: {
      title: input.title,
      material: input.material,
      source: input.source,
      first_score: input.scores[0],
      threshold: input.threshold,
      score_model: input.scoreModel,
    },
    questions: QUESTIONS,
  };

  try {
    const receipt = await paidRequest({
      service: "typesafe",
      model: model(),
      purpose: "selection_gate_shadow",
      subject: `article:${input.articleId}@${input.revision}:jev-shadow`,
      identity: payload,
      requestSummary: {
        articleId: input.articleId, revision: input.revision, sourceTier: input.source.tier,
        firstScore: input.scores[0], threshold: input.threshold, model: model(),
      },
      attemptTag: "jev-shadow-v1",
    }, async () => {
      const response = await fetch(`${baseUrl()}/v1/systemone`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs()),
      });
      const text = await response.text();
      assertAccepted("typesafe", response.status, text);
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error(`typesafe returned non-JSON: ${text.slice(0, 300)}`);
      }
      return { response: json, requestId: response.headers.get("x-request-id"), usage: (json.usage as Record<string, unknown> | undefined) ?? null, cost: null };
    });

    const body = receipt.response as { answers?: Record<string, unknown>; model?: string; usage?: Record<string, unknown> };
    const answers = body.answers ?? {};
    const gate = answers.gate;
    const decision = answerChoice(gate);
    const confidence = answerProbability(gate) ?? answerProbability(answers.final_selected);
    await writeResult(input, {
      status: "received", decision, confidence, answer: answers,
      model: typeof body.model === "string" ? body.model : model(), receiptId: receipt.receiptId, usage: body.usage ?? null,
    });
  } catch (error) {
    const receiptId = error instanceof ReceiptUnknownError ? error.receiptId : null;
    const status = error instanceof ReceiptUnknownError ? "unknown" : "failed";
    await writeResult(input, { status, receiptId, error: String(error).slice(0, 1000) });
    console.error(JSON.stringify({ level: "warn", msg: "JEV shadow call failed", article: `${input.articleId}@${input.revision}`, error: logError(error) }));
  }
}

export const jevShadow = defineServerModule({
  name: "jev-shadow",
  selectionGateShadow: async (input) => {
    if (!enabled()) return;
    await runJevShadow(input);
  },
  alerts: async (): Promise<Finding[]> => enabled() && !apiKey()
    ? [{
        key: "jev-shadow.unconfigured",
        level: "later",
        title: "JEV 影子运行开着，但没配 API Key",
        impact: "JEV 不会产生影子记录，现有精选流程不受影响",
        heals: "不会",
        action: "在 .env 里填 TYPESAFE_API_KEY，然后重启 worker",
        owner: true,
      }]
    : [],
});
