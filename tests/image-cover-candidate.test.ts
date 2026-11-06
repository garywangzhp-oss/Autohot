import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { isArticleCoverCandidate } from "@aihot/backend/lib/image-url";

test("cover selection rejects page chrome and tiny assets", () => {
  assert.equal(isArticleCoverCandidate("https://www.caranddriver.com/_assets/design-tokens/fre/static/icons/chevron-down.451e4f7.svg?primary=%25231B5F8A"), false);
  assert.equal(isArticleCoverCandidate("https://example.com/apple-touch-icon.png", 180, 180), false);
  assert.equal(isArticleCoverCandidate("https://example.com/site-logo.png", 1200, 400), false);
  assert.equal(isArticleCoverCandidate("https://example.com/photo.png", 64, 64), false);
  assert.equal(isArticleCoverCandidate("https://example.com/article-photo.jpg", 800, 450), true);
  assert.equal(isArticleCoverCandidate("https://example.com/portrait.webp", 600, 900), true);
});
