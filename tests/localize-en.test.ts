import assert from "node:assert/strict";
import test from "node:test";
import { englishReportContent } from "@aihot/backend/reports/localize-en";
import { toFeedItemSummary, type ItemRow } from "@aihot/backend/publication/items";

const items = new Map([
  ["a1", { id: "a1", title: "Tesla launches a new platform", summary: "The platform cuts cost and weight." }],
  ["a2", { id: "a2", title: "Battery output expands", summary: "A supplier adds capacity." }],
  ["a3", { id: "a3", title: "Robotaxi service opens", summary: null }],
]);

test("English daily reports localize section labels and cited copy without changing IDs", () => {
  const content = {
    leadItemId: "a1",
    lead: { title: "旧标题", leadParagraph: "旧摘要" },
    sections: [{
      label: "新车",
      items: [
        { itemId: "a1", title: "旧标题", summary: "旧摘要" },
        { itemId: "a2", title: "旧电池标题", summary: "旧电池摘要", related: [{ itemId: "a3", title: "旧 Robotaxi" }] },
      ],
    }],
    flashes: [{ itemId: "a3", title: "旧快讯" }],
    metrics: { totalEvents: 3 },
  };
  const english = englishReportContent("daily", "2026-11-05", content, items);
  assert.equal(english.lead.title, "Tesla launches a new platform");
  assert.equal(english.lead.leadParagraph, "The platform cuts cost and weight.");
  assert.equal(english.sections[0].label, "New models");
  assert.equal(english.sections[0].items[1].title, "Battery output expands");
  assert.equal(english.sections[0].items[1].related[0].title, "Robotaxi service opens");
  assert.equal(english.flashes[0].title, "Robotaxi service opens");
  assert.equal(english.metrics.totalEvents, 3);
});

test("English weekly reports keep ordering and generate an English overview", () => {
  const content = {
    title: "旧周报",
    headline: "旧头条",
    leadItemId: "a1",
    storyOrder: ["a1", "a2", "a3"],
    themes: [{ heading: "电动化与三电", summary: "旧导语", storyRefs: [{ itemId: "a2", title: "旧电池标题" }] }],
  };
  const english = englishReportContent("weekly", "2026-W45", content, items);
  assert.equal(english.title, "AutoHot Weekly · 2026-W45");
  assert.equal(english.headline, "Tesla launches a new platform");
  assert.match(english.overview, /^This week 3 stories/);
  assert.equal(english.themes[0].heading, "Electrification & EV tech");
  assert.equal(english.themes[0].summary, null);
  assert.equal(english.themes[0].storyRefs[0].title, "Battery output expands");
});
test("English feed items prefer stored localization over source and Chinese copy", () => {
  const now = new Date("2026-11-05T08:00:00Z");
  const row: ItemRow = {
    id: "en-item", title: "中文标题", original_title: "Original headline", original_summary: "Original summary",
    summary: "中文摘要", reason: "中文理由", category: "new-models", tags: [], score: 80, selected: true,
    channel: "news", url: "https://example.com/item", published_at: now, discovered_at: now, timeline_at: now,
    seat: true, visibility: "public", body_mode: "summary", indexable: true, fact_id: null,
    source_name: "Example", source_mode: "editorial", x_post: null, author: null, language: "en",
    story_public_id: null, story_title: null, zh_text: null, quoted_zh: null,
    en_title: "English headline", en_summary: "English summary", en_reason: "Why it matters", en_body_text: null,
  };
  const item = toFeedItemSummary(row, "en");
  assert.equal(item.title, "English headline");
  assert.equal(item.summary, "English summary");
  assert.equal(item.reason, "Why it matters");
});

test("English X items fall back to the post text instead of mixing in Chinese copy", () => {
  const now = new Date("2026-11-03T08:00:00Z");
  const row: ItemRow = {
    id: "x-item", title: "中文标题", original_title: "Original X headline", original_summary: null,
    summary: "中文摘要", reason: "中文理由", category: "autonomous", tags: [], score: 70, selected: true,
    channel: "x", url: "https://x.com/example/status/1", published_at: now, discovered_at: now, timeline_at: now,
    seat: true, visibility: "public", body_mode: "full", indexable: true, fact_id: null,
    source_name: "Example", source_mode: "editorial", x_post: { text: "Original X post text" }, author: "Example", language: "en",
    story_public_id: null, story_title: null, zh_text: null, quoted_zh: null,
    en_title: null, en_summary: null, en_reason: null, en_body_text: null,
  };
  const item = toFeedItemSummary(row, "en");
  assert.equal(item.summary, "Original X post text");
  assert.equal(item.reason, null, "untranslated Chinese reasons are not shown in English");
});
