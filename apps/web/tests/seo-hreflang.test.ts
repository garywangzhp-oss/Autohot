import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pageMeta } from "../app/lib/seo.ts";

const originalSiteUrl = process.env.SITE_URL;
process.env.SITE_URL = "https://www.autohot.top";
after(() => {
  if (originalSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = originalSiteUrl;
});

const alternates = (path: string) => pageMeta({ path })
  .filter((tag): tag is Record<string, string> => typeof tag === "object" && tag !== null && "hrefLang" in tag)
  .map((tag) => [tag.hrefLang, tag.href]);

test("Chinese and English pages advertise reciprocal language alternates", () => {
  assert.deepEqual(alternates("/story/example?category=new-models"), [
    ["zh-CN", "https://www.autohot.top/story/example?category=new-models"],
    ["en", "https://www.autohot.top/story/example?category=new-models&lang=en"],
    ["x-default", "https://www.autohot.top/story/example?category=new-models"],
  ]);
  assert.deepEqual(alternates("/story/example?category=new-models&lang=en"), [
    ["zh-CN", "https://www.autohot.top/story/example?category=new-models"],
    ["en", "https://www.autohot.top/story/example?category=new-models&lang=en"],
    ["x-default", "https://www.autohot.top/story/example?category=new-models"],
  ]);
});

test("noindex pages and untranslated pages omit language alternates", () => {
  assert.deepEqual(alternates("/search?q=cars"), [
    ["zh-CN", "https://www.autohot.top/search?q=cars"],
    ["en", "https://www.autohot.top/search?q=cars&lang=en"],
    ["x-default", "https://www.autohot.top/search?q=cars"],
  ]);
  assert.deepEqual(alternates("/story/example").length, 3);
  const hidden = pageMeta({ path: "/feedback", noindex: true });
  assert.equal(hidden.some((tag) => typeof tag === "object" && tag !== null && "hrefLang" in tag), false);
  const untranslated = pageMeta({ path: "/items/example?lang=en", hreflang: false });
  assert.equal(untranslated.some((tag) => typeof tag === "object" && tag !== null && "hrefLang" in tag), false);
});
