// Public email subscriptions: the database is the source of truth, and the address is normalized before
// it is stored. The endpoint only accepts a small JSON body; the in-memory limiter keeps one client from
// filling the table without writing a client address to disk.
import type { FastifyInstance } from "fastify";
import { sql } from "@aihot/backend/db";
import { defineServerModule } from "@aihot/backend/modules";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recent = new Map<string, number[]>();

export class SubscribeRejected extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function rateLimit(ip: string): void {
  const key = ip || "unknown";
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 5) throw new SubscribeRejected(429, "rate_limited", "提交太频繁，请稍后再试。");
  list.push(now);
  recent.set(key, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (v.every((t) => now - t > 60_000)) recent.delete(k);
}

export async function subscribeEmail(input: { email: unknown; source: unknown; ip: string }): Promise<{ ok: true; already: boolean }> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email || email.length > 200 || !EMAIL.test(email)) {
    throw new SubscribeRejected(400, "invalid_email", "请输入有效的邮箱地址。");
  }
  const source = input.source === "home" || input.source === "daily" ? input.source : "site";
  rateLimit(input.ip);
  const [row] = await sql<{ inserted: boolean }[]>`
    INSERT INTO email_subscriptions (email, source)
    VALUES (${email}, ${source})
    ON CONFLICT (email) DO UPDATE SET source = EXCLUDED.source, unsubscribed_at = NULL
    RETURNING (xmax = 0) AS inserted
  `;
  return { ok: true, already: !row!.inserted };
}

/** The subscription route is public and intentionally has no API key: it is a newsletter opt-in, not a data export. */
export const emailSubscribe = defineServerModule({
  name: "email-subscribe",
  http(app: FastifyInstance) {
    app.post("/api/site/subscribe", { bodyLimit: 4096 }, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const ip = String(req.headers["x-real-ip"] ?? req.ip ?? "");
      try {
        const email = body.email;
        const source = body.source;
        return reply.header("Cache-Control", "no-store").code(201).send(await subscribeEmail({ email, source, ip }));
      } catch (error) {
        if (error instanceof SubscribeRejected) {
          return reply.header("Cache-Control", "no-store").code(error.status).send({ ok: false, code: error.code, message: error.message });
        }
        req.log.error({ err: error }, "email subscription failed");
        return reply.header("Cache-Control", "no-store").code(503).send({ ok: false, code: "temporarily_unavailable", message: "暂时无法提交，请稍后再试。" });
      }
    });
  },
});
