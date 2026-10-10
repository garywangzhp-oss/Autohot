import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { runJevShadow } from "../server.ts";
import { stub, tag } from "../../../tests/setup.ts";

after(async () => {
  await closeDb();
});

test("the JEV shadow gate records its decision and the real two-score outcome", async () => {
  const articleId = `jev-shadow-${tag()}`;
  const provider = await stub((_hit, req) => {
    const body = JSON.parse(req.body) as {
      model: string;
      state: { first_score: number; material: string; threshold: number; source: { tier: string } };
      questions: { gate: { type: string }; final_selected: { type: string } };
    };
    assert.equal(body.model, "jev-test");
    assert.equal(req.url, "/provider/v1/systemone");
    assert.equal(body.state.first_score, 52);
    assert.equal(body.state.threshold, 40);
    assert.equal(body.state.source.tier, "T2");
    assert.match(body.state.material, /测试文章/);
    assert.equal(body.questions.gate.type, "choice");
    assert.equal(body.questions.final_selected.type, "noul");
    return { model: "jev-test", answers: { gate: { choice: "score_again", confidence: 0.82 }, final_selected: 0.61 }, usage: { input_tokens: 123, output_tokens: 0 } };
  });

  process.env.JEV_SHADOW_ENABLED = "true";
  process.env.COMMANDCODE_API_KEY = "test-key";
  process.env.COMMANDCODE_BASE_URL = `${provider.url}/provider/v1`;
  process.env.JEV_MODEL = "jev-test";
  try {
    await runJevShadow({
      articleId,
      revision: 3,
      title: "测试文章",
      material: "测试文章正文",
      source: { name: "测试信源", kind: "rss", tier: "T2", firstParty: false },
      scoreModel: "test-score-model",
      threshold: 40,
      scorePromptVersion: "score-v1",
      scores: [52, 61],
      score: 56,
      selectedByScore: true,
    });

    const [row] = await sql<{
      gate_status: string; gate_decision: string | null; gate_confidence: string | number | null; first_score: number; second_score: number;
      final_score: number; selected_by_score: boolean; gate_model: string | null; gate_receipt_id: number | null;
    }[]>`SELECT gate_status, gate_decision, gate_confidence, first_score, second_score, final_score, selected_by_score, gate_model, gate_receipt_id
         FROM selection_gate_shadow WHERE article_id = ${articleId} AND revision = 3`;
    assert.equal(row!.gate_status, "received");
    assert.equal(row!.gate_decision, "score_again");
    assert.equal(Number(row!.gate_confidence), 0.82);
    assert.equal(row!.first_score, 52);
    assert.equal(row!.second_score, 61);
    assert.equal(row!.final_score, 56);
    assert.equal(row!.selected_by_score, true);
    assert.equal(row!.gate_model, "jev-test");
    assert.ok(row!.gate_receipt_id);
    assert.equal(provider.hits(), 1);
  } finally {
    await provider.close();
  }
});

test("the JEV shadow gate is disabled by default", async () => {
  const articleId = `jev-disabled-${tag()}`;
  process.env.JEV_SHADOW_ENABLED = "false";
  await runJevShadow({
    articleId,
    revision: 1,
    title: "不应调用",
    material: "不应调用",
    source: { name: "测试信源", kind: "rss", tier: "T2", firstParty: false },
    scoreModel: "test-score-model",
    threshold: 40,
    scorePromptVersion: "score-v1",
    scores: [30, 35],
    score: 32,
    selectedByScore: false,
  });
  const rows = await sql`SELECT 1 FROM selection_gate_shadow WHERE article_id = ${articleId}`;
  assert.equal(rows.length, 0);
});
