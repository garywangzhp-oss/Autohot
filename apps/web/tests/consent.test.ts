import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_ANALYTICS_CONSENT_KEY, PRIVACY_CONSENT_KEY, PRIVACY_CONSENT_VERSION,
  legacyAnalyticsConsent, parseStoredConsent, serializeStoredConsent,
} from "../app/features/analytics/consent.ts";

test("privacy consent records round-trip both categories", () => {
  const raw = serializeStoredConsent({ analytics: true, ads: false }, new Date("2026-11-05T00:00:00Z"));
  assert.deepEqual(parseStoredConsent(raw), {
    version: PRIVACY_CONSENT_VERSION,
    analytics: true,
    ads: false,
    decidedAt: "2026-11-05T00:00:00.000Z",
  });
  assert.equal(PRIVACY_CONSENT_KEY, "autohot-privacy-consent");
});

test("damaged, incomplete and older consent records are not trusted", () => {
  assert.equal(parseStoredConsent(null), null);
  assert.equal(parseStoredConsent("not json"), null);
  assert.equal(parseStoredConsent(JSON.stringify({ version: 1, analytics: true })), null);
  assert.equal(parseStoredConsent(JSON.stringify({ version: 0, analytics: true, ads: false, decidedAt: "2026-11-05T00:00:00Z" })), null);
  assert.equal(parseStoredConsent(JSON.stringify({ version: 1, analytics: "yes", ads: false, decidedAt: "2026-11-05T00:00:00Z" })), null);
});

test("the previous analytics choice seeds the new settings but does not skip the ad decision", () => {
  assert.equal(LEGACY_ANALYTICS_CONSENT_KEY, "aihot-ga-consent");
  assert.equal(legacyAnalyticsConsent("granted"), true);
  assert.equal(legacyAnalyticsConsent("denied"), false);
  assert.equal(legacyAnalyticsConsent(null), false);
});
