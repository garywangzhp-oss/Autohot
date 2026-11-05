import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { buildApp } from "../../../apps/api/src/app.ts";
import { SITE } from "@aihot/site";
import { emailSubscribe, sendWeeklyNewsletter, unsubscribeToken } from "../server.ts";
import { Reply, stub, tag } from "../../../tests/setup.ts";

let failNext = 0;
const sentBodies: Array<Record<string, any>> = [];
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as Record<string, any>;
  sentBodies.push(body);
  if (failNext > 0) {
    failNext--;
    return new Reply(500, { message: "temporary resend outage" });
  }
  return { id: `re_${sentBodies.length}` };
});

process.env.NEWSLETTER_SEND_ENABLED = "true";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.RESEND_BASE_URL = provider.url;
process.env.NEWSLETTER_FROM = "AutoHot <briefing@example.test>";
process.env.NEWSLETTER_TOKEN_SECRET = "test-newsletter-token-secret-0123456789";

installModules([emailSubscribe]);
const app = await buildApp();

after(async () => {
  await app.close();
  await provider.close();
  await closeDb();
});

function tokenFromText(text: string, marker: string): string {
  const match = text.match(new RegExp(`${marker}\\?token=([^\\s<]+)`));
  assert.ok(match?.[1], `token missing from ${text}`);
  return decodeURIComponent(match[1]);
}

async function activeSubscriber(email: string, lang: "zh" | "en"): Promise<void> {
  await sql`
    INSERT INTO email_subscriptions (email, source) VALUES (${email}, 'home')
    ON CONFLICT (email) DO UPDATE SET source = EXCLUDED.source, unsubscribed_at = NULL`;
  await sql`
    INSERT INTO email_subscription_preferences (email, lang, status, confirmed_at)
    VALUES (${email}, ${lang}, 'active', now())
    ON CONFLICT (email) DO UPDATE SET lang = EXCLUDED.lang, status = 'active', confirmed_at = now(), updated_at = now()`;
}

async function insertWeekly(key: string, content: Record<string, unknown>): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('weekly', ${key}, now() - interval '7 days', now(), ${sql.json(content as never)}, now(), 'imported')
    RETURNING id`;
  return row!.id;
}

async function deactivateAll(): Promise<void> {
  await sql`UPDATE email_subscription_preferences SET status = 'unsubscribed', updated_at = now()`;
  await sql`UPDATE email_subscriptions SET unsubscribed_at = now()`;
}

test("subscription stores language, sends confirmation and requires the email link", async () => {
  const email = `reader-${tag()}@example.test`;
  const before = sentBodies.length;
  const first = await app.inject({
    method: "POST",
    url: "/api/site/subscribe",
    headers: { "x-real-ip": `ip-${tag()}` },
    payload: { email: `  ${email.toUpperCase()}  `, source: "home", lang: "en" },
  });
  assert.equal(first.statusCode, 201, first.body);
  assert.deepEqual(first.json(), { ok: true, status: "pending", already: false });
  assert.equal(sentBodies.length, before + 1);
  assert.match(String(sentBodies.at(-1)?.subject), /Confirm/);

  const [saved] = await sql<{ source: string; unsubscribed_at: Date | null; lang: string; status: string; confirm_token_hash: string; confirm_expires_at: Date }[]>`
    SELECT s.source, s.unsubscribed_at, p.lang, p.status, p.confirm_token_hash, p.confirm_expires_at
    FROM email_subscriptions s JOIN email_subscription_preferences p ON p.email = s.email
    WHERE s.email = ${email}`;
  assert.equal(saved!.source, "home");
  assert.equal(saved!.unsubscribed_at, null);
  assert.equal(saved!.lang, "en");
  assert.equal(saved!.status, "pending");
  assert.match(saved!.confirm_token_hash, /^[0-9a-f]{64}$/);
  assert.ok(saved!.confirm_expires_at.getTime() > Date.now() + 23 * 60 * 60 * 1000);

  const confirmToken = tokenFromText(String(sentBodies.at(-1)?.text), "/api/site/subscribe/confirm");
  const confirmed = await app.inject({ method: "GET", url: `/api/site/subscribe/confirm?token=${encodeURIComponent(confirmToken)}` });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  assert.match(confirmed.body, /Subscription confirmed/);
  const [active] = await sql<{ status: string; confirmed_at: Date | null; confirm_token_hash: string | null }[]>`
    SELECT status, confirmed_at, confirm_token_hash FROM email_subscription_preferences WHERE email = ${email}`;
  assert.equal(active!.status, "active");
  assert.ok(active!.confirmed_at);
  assert.equal(active!.confirm_token_hash, null);

  const messages = sentBodies.length;
  const duplicate = await app.inject({
    method: "POST",
    url: "/api/site/subscribe",
    headers: { "x-real-ip": `ip-${tag()}` },
    payload: { email, source: "daily", lang: "zh" },
  });
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.deepEqual(duplicate.json(), { ok: true, status: "active", already: true });
  assert.equal(sentBodies.length, messages, "an active address does not receive another confirmation email");

  const changed = await app.inject({ method: "GET", url: `/api/site/newsletter/language?token=${encodeURIComponent(unsubscribeToken(email))}&lang=en` });
  assert.equal(changed.statusCode, 200, changed.body);
  const [language] = await sql<{ lang: string }[]>`SELECT lang FROM email_subscription_preferences WHERE email = ${email}`;
  assert.equal(language!.lang, "en");

  const oneClick = await app.inject({
    method: "POST",
    url: `/api/site/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken(email))}`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: "List-Unsubscribe=One-Click",
  });
  assert.equal(oneClick.statusCode, 200, oneClick.body);
  const [unsubscribed] = await sql<{ status: string; unsubscribed_at: Date | null }[]>`
    SELECT p.status, s.unsubscribed_at FROM email_subscription_preferences p JOIN email_subscriptions s ON s.email = p.email WHERE p.email = ${email}`;
  assert.equal(unsubscribed!.status, "unsubscribed");
  assert.ok(unsubscribed!.unsubscribed_at);
});

test("expired confirmation links cannot activate a subscription", async () => {
  const before = sentBodies.length;
  const email = `expired-${tag()}@example.test`;
  const response = await app.inject({
    method: "POST",
    url: "/api/site/subscribe",
    headers: { "x-real-ip": `ip-${tag()}` },
    payload: { email, source: "daily", lang: "zh" },
  });
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(sentBodies.length, before + 1);
  const token = tokenFromText(String(sentBodies.at(-1)?.text), "/api/site/subscribe/confirm");
  await sql`UPDATE email_subscription_preferences SET confirm_expires_at = now() - interval '1 second' WHERE email = ${email}`;
  const expired = await app.inject({ method: "GET", url: `/api/site/subscribe/confirm?token=${encodeURIComponent(token)}` });
  assert.equal(expired.statusCode, 410, expired.body);
  const [preference] = await sql<{ status: string }[]>`SELECT status FROM email_subscription_preferences WHERE email = ${email}`;
  assert.equal(preference!.status, "pending");
});

test("malformed addresses and a disabled mail service do not create fake subscriptions", async () => {
  const invalid = await app.inject({
    method: "POST",
    url: "/api/site/subscribe",
    headers: { "x-real-ip": `ip-${tag()}` },
    payload: { email: "not-an-email", source: "home", lang: "zh" },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().code, "invalid_email");

  process.env.NEWSLETTER_SEND_ENABLED = "false";
  try {
    const disabled = await app.inject({
      method: "POST",
      url: "/api/site/subscribe",
      headers: { "x-real-ip": `ip-${tag()}` },
      payload: { email: `disabled-${tag()}@example.test`, source: "home", lang: "zh" },
    });
    assert.equal(disabled.statusCode, 503);
    assert.equal(disabled.json().code, "newsletter_unavailable");
  } finally {
    process.env.NEWSLETTER_SEND_ENABLED = "true";
  }
});

test("the weekly run waits for English localization and never sends twice", async () => {
  await deactivateAll();
  const zhEmail = `zh-${tag()}@example.test`;
  const enEmail = `en-${tag()}@example.test`;
  await activeSubscriber(zhEmail, "zh");
  await activeSubscriber(enEmail, "en");
  const key = `2199-W${String(Math.floor(Math.random() * 50) + 1).padStart(2, "0")}`;
  const zhContent = {
    title: `${SITE.name} 周报 · ${key}`,
    headline: "本周汽车行业重点",
    overview: "本周全球汽车行业的重点进展。",
    themes: [{ heading: "电动化", summary: "电池与平台更新。", storyRefs: [{ itemId: null, title: "中国车企发布新平台", summary: "中文摘要", sourceName: "汽车媒体", sourceUrl: "https://example.test/zh" }] }],
    metrics: { totalStories: 1 },
  };
  const reportId = await insertWeekly(key, zhContent);
  const before = sentBodies.length;

  const first = await sendWeeklyNewsletter();
  assert.equal(first.sent, 1, JSON.stringify(first));
  assert.equal(sentBodies.length, before + 1);
  assert.match(String(sentBodies.at(-1)?.subject), /周报/);
  assert.match(String(sentBodies.at(-1)?.html), /中国车企发布新平台/);
  const [englishWaiting] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM newsletter_deliveries WHERE report_id = ${reportId} AND lang = 'en'`;
  assert.equal(englishWaiting!.count, 0);

  const enContent = {
    title: `AutoHot Weekly · ${key}`,
    headline: "The week in autos",
    overview: "The most important automotive developments this week.",
    themes: [{ heading: "Electrification", summary: "Battery and platform updates.", storyRefs: [{ itemId: null, title: "Chinese automaker launches a new platform", summary: "English summary", sourceName: "Auto media", sourceUrl: "https://example.test/en" }] }],
    metrics: { totalStories: 1 },
  };
  await sql`
    INSERT INTO report_localizations (report_id, lang, revision, content, origin)
    VALUES (${reportId}, 'en', 1, ${sql.json(enContent as never)}, 'model')`;

  const second = await sendWeeklyNewsletter();
  assert.equal(second.sent, 1, JSON.stringify(second));
  assert.equal(sentBodies.length, before + 2);
  assert.match(String(sentBodies.at(-1)?.subject), /AutoHot Weekly/);
  assert.match(String(sentBodies.at(-1)?.html), /Chinese automaker launches a new platform/);
  assert.match(String(sentBodies.at(-1)?.html), /Unsubscribe/);

  const third = await sendWeeklyNewsletter();
  assert.equal(third.sent, 0, JSON.stringify(third));
  assert.equal(sentBodies.length, before + 2);
  const sent = await sql<{ lang: string; status: string }[]>`
    SELECT lang, status FROM newsletter_deliveries WHERE report_id = ${reportId} ORDER BY lang`;
  assert.deepEqual(sent.map((row) => ({ ...row })), [{ lang: "en", status: "sent" }, { lang: "zh", status: "sent" }]);
});

test("a rejected Resend send is recorded and retried without a duplicate delivery row", async () => {
  await deactivateAll();
  const email = `retry-${tag()}@example.test`;
  await activeSubscriber(email, "zh");
  const key = "2199-W99";
  const reportId = await insertWeekly(key, {
    title: `${SITE.name} 周报 · ${key}`,
    overview: "重试测试。",
    themes: [{ heading: "测试", storyRefs: [{ itemId: null, title: "重试条目", summary: "摘要", sourceName: "测试来源", sourceUrl: "https://example.test/retry" }] }],
  });

  failNext = 1;
  const before = sentBodies.length;
  const first = await sendWeeklyNewsletter();
  assert.equal(first.failed, 1, JSON.stringify(first));
  assert.equal(sentBodies.length, before + 1);
  const [failed] = await sql<{ status: string; attempts: number; error: string }[]>`
    SELECT status, attempts, error FROM newsletter_deliveries WHERE report_id = ${reportId}`;
  assert.equal(failed!.status, "failed");
  assert.equal(failed!.attempts, 1);
  assert.match(failed!.error, /HTTP 500/);
  await sql`UPDATE newsletter_deliveries SET next_attempt_at = now() - interval '1 second' WHERE report_id = ${reportId}`;

  const second = await sendWeeklyNewsletter();
  assert.equal(second.sent, 1, JSON.stringify(second));
  assert.equal(sentBodies.length, before + 2);
  const [retried] = await sql<{ status: string; attempts: number; provider_message_id: string }[]>`
    SELECT status, attempts, provider_message_id FROM newsletter_deliveries WHERE report_id = ${reportId}`;
  assert.equal(retried!.status, "sent");
  assert.equal(retried!.attempts, 2);
  assert.match(retried!.provider_message_id, /^re_/);
});
