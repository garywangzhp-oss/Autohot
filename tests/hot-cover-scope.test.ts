// Failure cases at the publication → hot-cover boundary: a warmed ranking must drop a withdrawn
// secondary report's image, keep a summary-only report's (the card credits the source and links to
// it), and fall back once nothing public is left. Real database/read path, same ranking throughout.
import './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import type { HotEntry } from '@aihot/backend/events/hot';
import { loadHot } from '@aihot/backend/publication/stories';

after(closeDb);

test('hot covers follow current visibility and can come from summary-only reports', async () => {
  const source = 'cover-scope';
  const at = new Date(Date.now() - 60_000);
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${source},${source},'rss','T1','editorial','2100-01-01')`;
  const [story] = await sql<{id:number;public_id:string}[]>`INSERT INTO stories (public_id,title)
    VALUES (${randomUUID()},'封面范围') RETURNING id,public_id`;
  const [fact] = await sql<{id:number}[]>`INSERT INTO facts (public_id,story_id,title)
    VALUES (${randomUUID()},${story!.id},'封面范围') RETURNING id`;
  for (const [id, images] of [
    ['cover-representative', []],
    ['cover-primary', [
      { kind: 'image', url: 'https://example.org/icons/chevron-down.svg', width: 64, height: 64 },
      { kind: 'image', url: 'https://example.org/primary.png', width: 800, height: 450 },
      { kind: 'image', url: 'https://example.org/primary-second.png', width: 1200, height: 675 },
    ]],
    ['cover-fallback', [{ kind: 'image', url: 'https://example.org/fallback.png', width: 800, height: 450 }]],
  ] as const) {
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,media)
      VALUES (${id},${source},${id},${'https://example.org/'+id},${id},${at},${at},
        ${sql.json(images as never)})`;
    await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
    await sql`INSERT INTO publications (article_id,source_id,title,url,timeline_at,discovered_at,sort_at,body_mode,eligible,channel,story_id,fact_id,score)
      VALUES (${id},${source},${id},${'https://example.org/'+id},${at},${at},${at},${images.length ? 'full' : 'summary'},true,'news',${story!.id},${fact!.id},${id === 'cover-primary' ? 90 : 80})`;
  }
  const entry: HotEntry = { rank:1,storyId:story!.id,storyPublicId:story!.public_id,title:'封面范围',heat:10,trend:'flat',trendPct:0,badges:[],
    participantCount:2,sourceCount:1,signalCount:0,reportCount:3,sourceNames:[source],latestAt:at.toISOString(),firstReportAt:at.toISOString(),
    representativeItemId:'cover-representative',representativeUrl:'https://example.org/cover-representative',representativeSource:source,participants:[] };
  await sql`INSERT INTO hot_rankings (computed_at,rule_version,entries,published)
    VALUES (now(),'test',${sql.json([entry] as never)},true)`;
  const cover = async () => {
    const hot = await loadHot();
    assert.equal(hot.entries.length,1,'the public representative keeps the story on the same ranking');
    const url = hot.entries[0]!.cover?.url;
    return url ? new URL(url,'http://localhost').searchParams.get('u') : null;
  };
  assert.equal(await cover(),'https://example.org/primary.png');
  const first = await loadHot();
  const fallbacks = first.entries[0]!.cover?.fallbacks?.map((item) => item.url ? new URL(item.url,'http://localhost').searchParams.get('u') : null) ?? [];
  assert.deepEqual(fallbacks.slice(0,2),['https://example.org/primary-second.png','https://example.org/fallback.png']);
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = 'cover-primary'`;
  assert.equal(await cover(),'https://example.org/fallback.png','a withdrawn secondary report cannot remain the cover');
  // 摘要模式的文章照样借图：卡片上的缩略图注明来源并链回原文，跟转载全文是两回事。
  await sql`UPDATE publications SET body_mode = 'summary' WHERE article_id = 'cover-fallback'`;
  assert.equal(await cover(),'https://example.org/fallback.png','a summary-only report still lends its picture');
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = 'cover-fallback'`;
  assert.equal(await cover(),null,'withdrawing it leaves no picture at all');
});
