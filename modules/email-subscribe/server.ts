// Public newsletter subscriptions: double opt-in, bilingual confirmation, weekly delivery, retry-safe
// delivery records and one-click unsubscribe. Resend is called through the shared receipt/budget path.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { defineServerModule, type ServerModule } from "@aihot/backend/modules";
import { assertAccepted, completeReceipt, paidRequest } from "@aihot/backend/providers/receipts";
import { itemUrl, periodUrl } from "@aihot/backend/publication/links";
import { loadReport } from "@aihot/backend/publication/reports";
import type { ReportDetail } from "@aihot/contracts/site";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_RUN = 100;
const recent = new Map<string, number[]>();

type NewsletterLanguage = "zh" | "en";
type PreferenceStatus = "pending" | "active" | "unsubscribed";

interface NewsletterSettings {
  apiKey: string;
  baseUrl: string;
  from: string;
  replyTo: string | null;
  tokenSecret: string;
}

interface ResendMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  purpose: string;
  dedupeKey: string;
  headers?: Record<string, string>;
}

interface SentEmail {
  receiptId: number;
  messageId: string | null;
}

export class SubscribeRejected extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function newsletterEnabled(): boolean {
  return process.env.NEWSLETTER_SEND_ENABLED === "true";
}

function settings(): NewsletterSettings | null {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.NEWSLETTER_FROM ?? "").trim();
  const tokenSecret = (process.env.NEWSLETTER_TOKEN_SECRET ?? "").trim();
  if (!newsletterEnabled() || !apiKey || !from.includes("@") || tokenSecret.length < 16) return null;
  return {
    apiKey,
    baseUrl: (process.env.RESEND_BASE_URL || "https://api.resend.com").replace(/\/+$/, ""),
    from,
    replyTo: (process.env.NEWSLETTER_REPLY_TO ?? "").trim() || null,
    tokenSecret,
  };
}

function configurationProblem(): string | null {
  if (!newsletterEnabled()) return "NEWSLETTER_SEND_ENABLED 不是 true";
  if (!(process.env.RESEND_API_KEY ?? "").trim()) return "RESEND_API_KEY 为空";
  if (!(process.env.NEWSLETTER_FROM ?? "").includes("@")) return "NEWSLETTER_FROM 不是有效发件地址";
  if ((process.env.NEWSLETTER_TOKEN_SECRET ?? "").trim().length < 16) return "NEWSLETTER_TOKEN_SECRET 少于 16 个字符";
  return null;
}

function requiredSettings(): NewsletterSettings {
  const value = settings();
  if (!value) throw new SubscribeRejected(503, "newsletter_unavailable", "邮件订阅暂时无法使用，请稍后再试。");
  return value;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeLanguage(value: unknown): NewsletterLanguage {
  if (value === undefined || value === null || value === "" || value === "zh") return "zh";
  if (value === "en") return "en";
  throw new SubscribeRejected(400, "invalid_language", "订阅语言只能是 zh 或 en。");
}

function rateLimit(ip: string): void {
  const key = ip || "unknown";
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((time) => now - time < 60_000);
  if (list.length >= 5) throw new SubscribeRejected(429, "rate_limited", "提交太频繁，请稍后再试。");
  list.push(now);
  recent.set(key, list);
  if (recent.size > 5000) for (const [entry, times] of recent) if (times.every((time) => now - time > 60_000)) recent.delete(entry);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function languageUrl(url: string, lang: NewsletterLanguage): string {
  if (lang === "zh") return url;
  const out = new URL(url);
  out.searchParams.set("lang", "en");
  return out.toString();
}

function confirmUrl(token: string): string {
  const out = new URL("/api/site/subscribe/confirm", config.siteUrl);
  out.searchParams.set("token", token);
  return out.toString();
}

/** A stable, signed unsubscribe token. It survives restarts without storing another secret in the database. */
export function unsubscribeToken(email: string): string {
  const secret = requiredSettings().tokenSecret;
  const payload = Buffer.from(email, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function emailFromUnsubscribeToken(token: string): string | null {
  const secret = settings()?.tokenSecret;
  if (!secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const email = Buffer.from(payload, "base64url").toString("utf8").trim().toLowerCase();
    return EMAIL.test(email) ? email : null;
  } catch {
    return null;
  }
}

function unsubscribeUrl(email: string): string {
  const out = new URL("/api/site/newsletter/unsubscribe", config.siteUrl);
  out.searchParams.set("token", unsubscribeToken(email));
  return out.toString();
}

function languagePreferenceUrl(email: string, lang: NewsletterLanguage): string {
  const out = new URL("/api/site/newsletter/language", config.siteUrl);
  out.searchParams.set("token", unsubscribeToken(email));
  out.searchParams.set("lang", lang);
  return out.toString();
}

function confirmationMessage(email: string, lang: NewsletterLanguage, token: string): Omit<ResendMessage, "purpose"> {
  const en = lang === "en";
  const link = confirmUrl(token);
  const safeLink = escapeHtml(link);
  const subject = en ? "Confirm your AutoHot weekly briefing" : "确认订阅 AutoHot 每周汽车简报";
  const text = en
    ? `Confirm your subscription to the AutoHot weekly automotive briefing:\n\n${link}\n\nThis link expires in 24 hours. If you did not request this email, you can ignore it.`
    : `请点击下面的链接确认订阅 AutoHot 每周汽车简报：\n\n${link}\n\n链接 24 小时内有效。如果不是你本人提交，请忽略这封邮件。`;
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f5f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17191c"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:18px;padding:32px;border:1px solid #e5e7eb"><h1 style="font-size:24px;line-height:1.3;margin:0 0 16px">${en ? "Confirm your weekly briefing" : "确认订阅每周汽车简报"}</h1><p style="font-size:15px;line-height:1.7;color:#4b5563;margin:0 0 24px">${en ? "One click confirms your email. Every Monday you will receive the most important automotive stories in English." : "点击一次即可确认邮箱。之后每周一，你会收到本周值得关注的全球汽车行业动态。"}</p><a href="${safeLink}" style="display:inline-block;background:#17191c;color:#fff;text-decoration:none;border-radius:999px;padding:13px 22px;font-size:15px;font-weight:600">${en ? "Confirm subscription" : "确认订阅"}</a><p style="font-size:12px;line-height:1.7;color:#8b929c;margin:24px 0 0">${en ? "This link expires in 24 hours. If you did not request this email, ignore it." : "链接 24 小时内有效。如果不是你本人提交，请忽略这封邮件。"}</p></div></div></body></html>`;
  return { to: email, subject, html, text, dedupeKey: `newsletter_confirmation:${email}:${hashToken(token)}` };
}

function itemLink(item: ReportDetail["highlights"][number], lang: NewsletterLanguage): string {
  return item.itemId ? languageUrl(itemUrl(item.itemId), lang) : item.sourceUrl;
}

function newsletterItems(report: ReportDetail): ReportDetail["highlights"] {
  const all = [...report.highlights, ...report.sections.flatMap((section) => section.items), ...report.flashes];
  const seen = new Set<string>();
  return all.filter((item) => {
    if (!item.available) return false;
    const key = `${item.itemId ?? ""}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function newsletterMessage(email: string, lang: NewsletterLanguage, report: ReportDetail, reportId: number): Omit<ResendMessage, "purpose"> {
  const en = lang === "en";
  const page = languageUrl(periodUrl("weekly", report.key), lang);
  const unsubscribe = unsubscribeUrl(email);
  const switchLanguage = languagePreferenceUrl(email, en ? "zh" : "en");
  const items = newsletterItems(report);
  const intro = en
    ? "The automotive stories that shaped this week, selected from official newsrooms, specialist media and industry sources."
    : "从车企官方新闻室、行业媒体和专业信源中挑出的本周重点。";
  const textLines = [
    report.title,
    "",
    report.overview ?? report.lead?.leadParagraph ?? intro,
    "",
    ...items.flatMap((item) => [`• ${item.title}`, item.summary ?? "", item.sourceName, itemLink(item, lang), ""]),
    `${en ? "Read the full weekly edition" : "阅读完整周报"}: ${page}`,
    "",
    `${en ? "Unsubscribe" : "退订"}: ${unsubscribe}`,
    `${en ? "切换为中文" : "Switch to English"}: ${switchLanguage}`,
  ];
  const text = textLines.filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
  const itemHtml = items.map((item) => `<div style="padding:18px 0;border-top:1px solid #eceef1"><a href="${escapeHtml(itemLink(item, lang))}" style="color:#17191c;text-decoration:none;font-size:17px;font-weight:650;line-height:1.45">${escapeHtml(item.title)}</a>${item.summary ? `<p style="font-size:14px;line-height:1.65;color:#5c6470;margin:8px 0 0">${escapeHtml(item.summary)}</p>` : ""}<p style="font-size:12px;color:#8b929c;margin:8px 0 0">${escapeHtml(item.sourceName)}</p></div>`).join("");
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f5f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17191c"><div style="max-width:620px;margin:0 auto;padding:36px 18px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden"><div style="padding:34px 32px 28px;background:#17191c;color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b9c0c9;margin-bottom:10px">${en ? "AutoHot Weekly" : "AutoHot 汽车周报"}</div><h1 style="font-size:28px;line-height:1.25;margin:0">${escapeHtml(report.title)}</h1></div><div style="padding:28px 32px 34px"><p style="font-size:15px;line-height:1.75;color:#4b5563;margin:0 0 8px">${escapeHtml(report.overview ?? report.lead?.leadParagraph ?? intro)}</p>${itemHtml}<div style="margin:28px 0 0"><a href="${escapeHtml(page)}" style="display:inline-block;background:#17191c;color:#fff;text-decoration:none;border-radius:999px;padding:13px 22px;font-size:15px;font-weight:600">${en ? "Read the full weekly edition" : "阅读完整周报"}</a></div></div></div><p style="font-size:12px;line-height:1.7;color:#8b929c;text-align:center;margin:22px 12px">${en ? "You receive this because you confirmed your email on AutoHot." : "你收到这封邮件，是因为你在 AutoHot 确认订阅。"} · <a href="${escapeHtml(unsubscribe)}" style="color:#6b7280">${en ? "Unsubscribe" : "退订"}</a> · <a href="${escapeHtml(switchLanguage)}" style="color:#6b7280">${en ? "切换为中文" : "Switch to English"}</a></p></div></body></html>`;
  return {
    to: email,
    subject: report.title,
    html,
    text,
    dedupeKey: `newsletter_weekly:${reportId}:${email}:${lang}`,
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

async function sendEmail(message: ResendMessage): Promise<SentEmail> {
  const current = requiredSettings();
  // Paid-request budgets are operator-managed data, not schema. Seed this service idempotently on first
  // use so a deployment without the row cannot accidentally become unlimited.
  await sql`
    INSERT INTO budgets (service, per_minute, per_hour, per_day, note)
    VALUES ('resend', 10, 100, 500, '订阅确认与每周邮件（Resend 按邮件计费）')
    ON CONFLICT (service) DO NOTHING`;
  // A logical email stays the same even if its rendered copy is corrected between retries. Reusing the
  // provider answer then completes the delivery record without sending a second copy.
  const identity = { dedupeKey: message.dedupeKey, to: message.to };
  const idempotencyKey = hashToken(JSON.stringify(identity));
  const result = await paidRequest({
    service: "resend",
    purpose: message.purpose,
    subject: message.to,
    identity,
    requestSummary: { to: message.to, subject: message.subject, purpose: message.purpose },
  }, async () => {
    const response = await fetch(`${current.baseUrl}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${current.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from: current.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(current.replyTo ? { reply_to: current.replyTo } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    assertAccepted("resend", response.status, body);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* A provider 2xx without JSON still used a paid send. */ }
    const id = typeof parsed.id === "string" ? parsed.id : null;
    return { response: parsed, requestId: id, usage: null, cost: null };
  });
  const response = (result.response ?? {}) as { id?: unknown };
  return { receiptId: result.receiptId, messageId: typeof response.id === "string" ? response.id : null };
}

export async function subscribeEmail(input: { email: unknown; source: unknown; lang: unknown; ip: string }): Promise<{ ok: true; status: "pending" | "active"; already: boolean }> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email || email.length > 200 || !EMAIL.test(email)) throw new SubscribeRejected(400, "invalid_email", "请输入有效的邮箱地址。");
  const source = input.source === "home" || input.source === "daily" ? input.source : "site";
  const lang = normalizeLanguage(input.lang);
  requiredSettings();
  rateLimit(input.ip);

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const outcome = await sql.begin(async (tx) => {
    await tx`
      INSERT INTO email_subscriptions (email, source)
      VALUES (${email}, ${source})
      ON CONFLICT (email) DO UPDATE SET source = EXCLUDED.source, unsubscribed_at = NULL`;
    const [existing] = await tx<{ status: PreferenceStatus }[]>`
      SELECT status FROM email_subscription_preferences WHERE email = ${email} FOR UPDATE`;
    if (existing?.status === "active") {
      await tx`UPDATE email_subscription_preferences SET lang = ${lang}, updated_at = now() WHERE email = ${email}`;
      return { status: "active" as const };
    }
    await tx`
      INSERT INTO email_subscription_preferences (email, lang, status, confirm_token_hash, confirm_expires_at)
      VALUES (${email}, ${lang}, 'pending', ${hashToken(token)}, ${expires})
      ON CONFLICT (email) DO UPDATE SET lang = EXCLUDED.lang, status = 'pending', confirm_token_hash = EXCLUDED.confirm_token_hash,
        confirm_expires_at = EXCLUDED.confirm_expires_at, confirmed_at = NULL, updated_at = now()`;
    return { status: "pending" as const };
  });

  if (outcome.status === "active") return { ok: true, status: "active", already: true };
  const sent = await sendEmail({ ...confirmationMessage(email, lang, token), purpose: "newsletter_confirmation" });
  await completeReceipt(sql, sent.receiptId);
  return { ok: true, status: "pending", already: false };
}

async function confirmSubscription(token: string): Promise<{ ok: true; lang: NewsletterLanguage } | { ok: false; expired: boolean; lang: NewsletterLanguage }> {
  if (!token || token.length > 200) return { ok: false, expired: false, lang: "zh" };
  const hash = hashToken(token);
  const confirmed = await sql.begin(async (tx) => {
    const [row] = await tx<{ email: string; lang: NewsletterLanguage }[]>`
      UPDATE email_subscription_preferences SET status = 'active', confirmed_at = now(), confirm_token_hash = NULL,
        confirm_expires_at = NULL, updated_at = now()
      WHERE confirm_token_hash = ${hash} AND status = 'pending' AND confirm_expires_at > now()
      RETURNING email, lang`;
    if (!row) return null;
    await tx`UPDATE email_subscriptions SET unsubscribed_at = NULL WHERE email = ${row.email}`;
    return row;
  });
  if (confirmed) return { ok: true, lang: confirmed.lang };
  const [seen] = await sql<{ lang: NewsletterLanguage; expired: boolean }[]>`
    SELECT lang, confirm_expires_at <= now() AS expired FROM email_subscription_preferences WHERE confirm_token_hash = ${hash}`;
  return { ok: false, expired: !!seen?.expired, lang: seen?.lang ?? "zh" };
}

async function unsubscribe(email: string): Promise<NewsletterLanguage> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ lang: NewsletterLanguage }[]>`
      UPDATE email_subscription_preferences SET status = 'unsubscribed', confirm_token_hash = NULL, confirm_expires_at = NULL,
        updated_at = now() WHERE email = ${email} RETURNING lang`;
    await tx`UPDATE email_subscriptions SET unsubscribed_at = now() WHERE email = ${email}`;
    return row?.lang ?? "zh";
  });
}

async function changeLanguage(email: string, lang: NewsletterLanguage): Promise<NewsletterLanguage | null> {
  const [row] = await sql<{ lang: NewsletterLanguage }[]>`
    UPDATE email_subscription_preferences SET lang = ${lang}, updated_at = now() WHERE email = ${email} RETURNING lang`;
  return row?.lang ?? null;
}

function pageHtml(lang: NewsletterLanguage, title: string, body: string): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f5f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17191c"><main style="max-width:520px;margin:0 auto;padding:64px 20px"><section style="background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:32px"><h1 style="font-size:25px;line-height:1.3;margin:0 0 14px">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.75;color:#5c6470;margin:0 0 24px">${body}</p><a href="${escapeHtml(languageUrl(config.siteUrl, lang))}" style="color:#17191c;font-size:14px;font-weight:600">${lang === "en" ? "Back to AutoHot" : "返回 AutoHot"}</a></section></main></body></html>`;
}

function sendPage(reply: FastifyReply, status: number, lang: NewsletterLanguage, title: string, body: string) {
  return reply.code(status).type("text/html; charset=utf-8")
    .header("Cache-Control", "no-store")
    .header("Referrer-Policy", "no-referrer")
    .header("X-Robots-Tag", "noindex, nofollow")
    .send(pageHtml(lang, title, body));
}

async function latestWeeklyReport(): Promise<{ id: number; key: string; revision: number; enRevision: number | null } | null> {
  const [row] = await sql<{ id: number; key: string; revision: number; en_revision: number | null }[]>`
    SELECT r.id, r.key, r.revision, l.revision AS en_revision
    FROM reports r LEFT JOIN report_localizations l ON l.report_id = r.id AND l.lang = 'en'
    WHERE r.kind = 'weekly' AND r.generated_at <= now()
    ORDER BY r.generated_at DESC, r.key DESC LIMIT 1`;
  return row ? { id: row.id, key: row.key, revision: row.revision, enRevision: row.en_revision } : null;
}

async function claimDelivery(email: string, reportId: number, lang: NewsletterLanguage): Promise<number | null> {
  await sql`
    INSERT INTO newsletter_deliveries (subscription_email, report_id, lang)
    VALUES (${email}, ${reportId}, ${lang}) ON CONFLICT DO NOTHING`;
  const [row] = await sql<{ attempts: number }[]>`
    UPDATE newsletter_deliveries SET status = 'pending', attempts = attempts + 1,
      next_attempt_at = now() + interval '10 minutes', error = NULL, updated_at = now()
    WHERE subscription_email = ${email} AND report_id = ${reportId} AND lang = ${lang}
      AND status <> 'sent' AND attempts < ${MAX_ATTEMPTS} AND next_attempt_at <= now()
    RETURNING attempts`;
  return row?.attempts ?? null;
}

function retryDelayMinutes(attempts: number): number {
  return Math.min(360, 15 * 2 ** Math.max(0, attempts - 1));
}

async function failDelivery(email: string, reportId: number, lang: NewsletterLanguage, attempts: number, error: unknown): Promise<void> {
  const message = String(error).slice(0, 2000);
  await sql`
    UPDATE newsletter_deliveries SET status = 'failed', error = ${message},
      next_attempt_at = now() + ${`${retryDelayMinutes(attempts)} minutes`}::interval, updated_at = now()
    WHERE subscription_email = ${email} AND report_id = ${reportId} AND lang = ${lang}`;
}

export async function sendWeeklyNewsletter(): Promise<Record<string, unknown>> {
  if (!settings()) return { skipped: configurationProblem() };
  const latest = await latestWeeklyReport();
  if (!latest) return { skipped: "还没有已出刊的周报" };

  const reports: Partial<Record<NewsletterLanguage, ReportDetail>> = {};
  reports.zh = (await loadReport("weekly", latest.key, "zh")) ?? undefined;
  if (latest.enRevision !== null && latest.enRevision >= latest.revision) reports.en = (await loadReport("weekly", latest.key, "en")) ?? undefined;

  const subscribers = await sql<{ email: string; lang: NewsletterLanguage }[]>`
    SELECT s.email, p.lang
    FROM email_subscriptions s JOIN email_subscription_preferences p ON p.email = s.email
    WHERE p.status = 'active' AND s.unsubscribed_at IS NULL
    ORDER BY s.created_at, s.email
    LIMIT ${MAX_SENDS_PER_RUN}`;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const subscriber of subscribers) {
    const report = reports[subscriber.lang];
    if (!report) { skipped++; continue; }
    const attempts = await claimDelivery(subscriber.email, latest.id, subscriber.lang);
    if (attempts === null) { skipped++; continue; }
    try {
      const result = await sendEmail({ ...newsletterMessage(subscriber.email, subscriber.lang, report, latest.id), purpose: "newsletter_weekly" });
      await sql.begin(async (tx) => {
        await tx`
          UPDATE newsletter_deliveries SET status = 'sent', receipt_id = ${result.receiptId}, provider_message_id = ${result.messageId},
            sent_at = now(), error = NULL, updated_at = now()
          WHERE subscription_email = ${subscriber.email} AND report_id = ${latest.id} AND lang = ${subscriber.lang}`;
        await completeReceipt(tx, result.receiptId);
      });
      sent++;
    } catch (error) {
      await failDelivery(subscriber.email, latest.id, subscriber.lang, attempts, error);
      failed++;
      // A rejected key, exhausted budget or transport uncertainty should stop this run instead of creating
      // a receipt for every remaining subscriber. The next scheduled run retries at the recorded time.
      break;
    }
  }
  return { report: latest.key, subscribers: subscribers.length, sent, failed, skipped };
}

async function unsubscribeRequest(req: FastifyRequest, reply: FastifyReply) {
  const token = String((req.query as { token?: unknown }).token ?? "");
  const email = emailFromUnsubscribeToken(token);
  if (!email) return sendPage(reply, 400, "zh", "链接无效", "这个退订链接无效或已经损坏，请通过网站联系我们处理。 <a href=\"mailto:garywangwork@foxmail.com\">garywangwork@foxmail.com</a>");
  const lang = await unsubscribe(email);
  return sendPage(reply, 200, lang,
    lang === "en" ? "You are unsubscribed" : "已退订",
    lang === "en" ? "You will no longer receive the weekly AutoHot briefing. You can subscribe again from the website at any time." : "你不会再收到 AutoHot 每周简报。之后可以随时回到网站重新订阅。");
}

/** The public subscription and newsletter routes. */
export const emailSubscribe: ServerModule = defineServerModule({
  name: "email-subscribe",
  http(app: FastifyInstance) {
    app.post("/api/site/subscribe", { bodyLimit: 4096 }, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const ip = String(req.headers["x-real-ip"] ?? req.ip ?? "");
      try {
        const result = await subscribeEmail({ email: body.email, source: body.source, lang: body.lang, ip });
        return reply.header("Cache-Control", "no-store").code(result.already ? 200 : 201).send(result);
      } catch (error) {
        if (error instanceof SubscribeRejected) {
          return reply.header("Cache-Control", "no-store").code(error.status).send({ ok: false, code: error.code, message: error.message });
        }
        req.log.error({ err: error }, "email subscription failed");
        return reply.header("Cache-Control", "no-store").code(503).send({ ok: false, code: "temporarily_unavailable", message: "暂时无法提交，请稍后再试。" });
      }
    });
    app.get("/api/site/subscribe/confirm", async (req, reply) => {
      const token = String((req.query as { token?: unknown }).token ?? "");
      const result = await confirmSubscription(token);
      if (!result.ok) return sendPage(reply, result.expired ? 410 : 400, result.lang,
        result.lang === "en" ? "Confirmation link expired" : (result.expired ? "确认链接已过期" : "确认链接无效"),
        result.lang === "en" ? "Return to the website and subscribe again to receive a new confirmation email." : "请回到网站重新提交邮箱，我们会发送一封新的确认邮件。");
      return sendPage(reply, 200, result.lang,
        result.lang === "en" ? "Subscription confirmed" : "订阅已确认",
        result.lang === "en" ? "You will receive the AutoHot weekly automotive briefing. You can unsubscribe from any email." : "你之后会收到 AutoHot 每周汽车简报。每封邮件底部都有退订入口。");
    });
    app.get("/api/site/newsletter/unsubscribe", unsubscribeRequest);
    app.register(async (oneClick) => {
      oneClick.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 4096 }, (_req, body, done) => done(null, body));
      oneClick.post("/api/site/newsletter/unsubscribe", unsubscribeRequest);
    });
    app.get("/api/site/newsletter/language", async (req, reply) => {
      const query = req.query as { token?: unknown; lang?: unknown };
      const email = emailFromUnsubscribeToken(String(query.token ?? ""));
      if (!email) return sendPage(reply, 400, "zh", "链接无效", "这个语言设置链接无效，请通过网站联系我们处理。");
      let lang: NewsletterLanguage;
      try { lang = query.lang === "en" ? "en" : query.lang === "zh" ? "zh" : normalizeLanguage(query.lang); }
      catch { return sendPage(reply, 400, "zh", "语言无效", "订阅语言只能是中文或英文。"); }
      const changed = await changeLanguage(email, lang);
      if (!changed) return sendPage(reply, 404, lang, lang === "en" ? "Subscription not found" : "没有找到订阅", lang === "en" ? "This subscription is no longer available." : "这个订阅已经不存在。");
      return sendPage(reply, 200, changed, changed === "en" ? "Language updated" : "语言已更新", changed === "en" ? "Future AutoHot briefings will be sent in English." : "之后的 AutoHot 简报会以中文发送。");
    });
  },
  schedules: [{
    name: "newsletter.weekly",
    cron: "*/15 10-12 * * 1",
    missed: "once",
    run: sendWeeklyNewsletter,
    when: newsletterEnabled,
  }],
  alerts: async () => {
    const problem = configurationProblem();
    if (!newsletterEnabled() || !problem) return [];
    return [{
      key: "newsletter.unconfigured",
      level: "today" as const,
      title: "邮件订阅开着，但 Resend 配置不完整",
      impact: "读者提交订阅后收不到确认邮件，每周简报也不会发送",
      heals: "会，补齐配置并重启 api 和 worker 后恢复",
      action: `检查 .env 中的 ${problem}，确认 Resend 发件域名、SPF、DKIM 和 DMARC 已生效`,
      owner: true,
    }];
  },
});
