// Requeue named articles that are still waiting for their selected-news identity check.
// Usage: node --env-file=.env scripts/requeue-stuck-grouping.ts <article-id> [...]
import { closeDb } from "@aihot/backend/db";
import { requestRegroup } from "@aihot/backend/events/corrections";
import { waitingSelectedNews } from "@aihot/backend/operations/grouping";

const ids = [...new Set(process.argv.slice(2).map((id) => id.trim()).filter((id) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)))];
if (ids.length === 0) {
  console.error("usage: node --env-file=.env scripts/requeue-stuck-grouping.ts <article-id> [...]");
  process.exitCode = 2;
} else {
  try {
    const waiting = new Map((await waitingSelectedNews()).map((item) => [item.articleId, item]));
    let queued = 0;
    let skipped = 0;
    const requestId = `manual-stuck-${Date.now()}`;
    for (const id of ids) {
      const item = waiting.get(id);
      if (!item) {
        console.log(`${id}: 已不在等待列表（可能已完成或不再公开）`);
        continue;
      }
      console.log(`${id}: recovery=${item.recovery}${item.receiptId ? ` receipt=#${item.receiptId}` : ""}${item.error ? ` error=${item.error.slice(0, 180)}` : ""}`);
      if (item.recovery === "receipt") {
        console.log(`${id}: 跳过，付费请求结果仍未确认；请先在后台核对或释放回执`);
        skipped += 1;
        continue;
      }
      const job = await requestRegroup(id, `${requestId}-${id}`);
      console.log(`${id}: ${job ? `已重新排队 (${job})` : "没有排上"}`);
      if (job) queued += 1;
    }
    console.log(`完成：重新排队 ${queued}，跳过 ${skipped}，总计 ${ids.length}`);
  } finally {
    await closeDb();
  }
}
