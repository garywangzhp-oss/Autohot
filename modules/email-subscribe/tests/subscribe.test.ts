import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { installModules } from "@aihot/backend/modules";
import { closeDb, sql } from "@aihot/backend/db";
import { buildApp } from "../../../apps/api/src/app.ts";
import { emailSubscribe } from "../server.ts";
import { tag } from "../../../tests/setup.ts";

installModules([emailSubscribe]);
const app = await buildApp();
after(async () => {
  await app.close();
  await closeDb();
});

test("email subscription stores a normalized address and is idempotent", async () => {
  const email = `reader-${tag()}@example.test`;
  const first = await app.inject({ method: "POST", url: "/api/site/subscribe", payload: { email: `  ${email.toUpperCase()}  `, source: "home" } });
  assert.equal(first.statusCode, 201, first.body);
  assert.deepEqual(first.json(), { ok: true, already: false });

  const second = await app.inject({ method: "POST", url: "/api/site/subscribe", payload: { email, source: "daily" } });
  assert.equal(second.statusCode, 201, second.body);
  assert.deepEqual(second.json(), { ok: true, already: true });

  const [saved] = await sql<{ email: string; source: string; unsubscribed_at: Date | null }[]>`
    SELECT email, source, unsubscribed_at FROM email_subscriptions WHERE email = ${email}
  `;
  assert.deepEqual({ ...saved }, { email, source: "daily", unsubscribed_at: null });
});

test("email subscription rejects malformed addresses", async () => {
  const response = await app.inject({ method: "POST", url: "/api/site/subscribe", payload: { email: "not-an-email", source: "home" } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "invalid_email");
});
