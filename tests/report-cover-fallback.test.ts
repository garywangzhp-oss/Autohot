import "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { loadReport } from "@aihot/backend/publication/reports";

after(closeDb);

const upstream = (value: string | undefined) => value ? new URL(value, "http://localhost").searchParams.get("u") : null;

test("a daily cover skips chrome and keeps same-story fallbacks", async () => {
  const source = `report-cover-${randomUUID()}`;
  const key = "2098-12-31";
  const at = new Date(Date.now() - 60_000);
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${source},'Report cover','rss','T1','editorial','2100-01-01')`;
  const [story] = await sql<{ id: number; public_id: string }[]>`
    INSERT INTO stories (public_id,title) VALUES (${randomUUID()},'日报封面') RETURNING id,public_id`;
  const [fact] = await sql<{ id: number }[]>`
    INSERT INTO facts (public_id,story_id,title) VALUES (${randomUUID()},${story!.id},'日报封面') RETURNING id`;
  const media = new Map([
    ["report-cover-lead", [
      { kind: "image", url: "https://example.org/assets/icons/chevron-down.svg", width: 64, height: 64 },
      { kind: "image", url: "https://example.org/lead-primary.jpg", width: 1200, height: 675 },
      { kind: "image", url: "https://example.org/lead-second.jpg", width: 800, height: 450 },
    ]],
    ["report-cover-other", [{ kind: "image", url: "https://example.org/other-report.jpg", width: 1000, height: 563 }]],
  ]);
  for (const [id, images] of media) {
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,media)
      VALUES (${id},${source},${id},${`https://example.org/${id}`},${id},${at},${at},${sql.json(images as never)})`;
    await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
    await sql`INSERT INTO publications (article_id,source_id,title,url,timeline_at,discovered_at,sort_at,body_mode,eligible,selected,channel,story_id,fact_id,score,visible_after)
      VALUES (${id},${source},${id},${`https://example.org/${id}`},${at},${at},${at},'full',true,true,'news',${story!.id},${fact!.id},80,${at})`;
  }
  const citation = { itemId: "report-cover-lead", title: "日报封面", summary: "摘要", sourceName: "Report cover", sourceUrl: "https://example.org/source" };
  const content = {
    leadItemId: "report-cover-lead",
    lead: { title: "日报封面", leadParagraph: "导语" },
    highlights: ["report-cover-lead"],
    sections: [{ label: "industry", items: [citation] }],
  };
  await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,origin)
    VALUES ('daily',${key},now() - interval '1 day',now(),${sql.json(content as never)},now(),'imported')`;
  const report = await loadReport("daily", key);
  assert.equal(upstream(report?.cover?.url), "https://example.org/lead-primary.jpg");
  assert.deepEqual(report?.cover?.fallbacks?.map((item) => upstream(item.url)), [
    "https://example.org/lead-second.jpg",
    "https://example.org/other-report.jpg",
  ]);
});
