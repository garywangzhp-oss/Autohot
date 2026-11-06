// Reject non-content images at ingestion and public reads: extracted bodies can mislabel tracking
// endpoints and video pages as illustrations. Existing saved bodies follow the same rule.
const TRACKING_HOSTS = new Set([
  "ids4.ad.gt", "ids.ad.gt", "secure.adnxs.com", "sync.1rx.io", "ssum-sec.casalemedia.com",
  "sync.smartadserver.com", "token.rubiconproject.com", "image2.pubmatic.com", "sync.go.sonobi.com", "onetag-sys.com",
]);

export function isNonArticleImage(src: string, width?: string, height?: string): boolean {
  if (width !== undefined && height !== undefined && Number(width) <= 1 && Number(height) <= 1) return true;
  try {
    const url = new URL(src);
    if (TRACKING_HOSTS.has(url.hostname)) return true;
    // These are HTML video pages, never image bytes. The same hosts also serve real site icons;
    // thumbnails, video links and video elements remain outside this image-only exclusion.
    return /^(?:www\.|m\.)?youtube\.com$/.test(url.hostname) && /^\/(?:watch\/?|shorts\/[^/]+\/?)$/.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Whether an image can reasonably represent a story cover. Feeds and extracted bodies sometimes put
 * navigation icons, favicons, logos and chevrons in the same media list as article photography; those
 * are valid images but make a nonsensical hero. This is intentionally only used where a picture is
 * chosen as a cover, so small inline body images and source avatars keep their existing behaviour.
 */
export function isArticleCoverCandidate(src: string, width?: number | string | null, height?: number | string | null): boolean {
  if (isNonArticleImage(src, width == null ? undefined : String(width), height == null ? undefined : String(height))) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (/\.svg$/i.test(url.pathname)) return false;
  // Path segments such as /icons/, favicon.ico, apple-touch-icon.png, chevron-down.svg and site logos
  // are page chrome rather than editorial imagery.
  if (/(?:^|[/_.-])(?:icons?|favicons?|logos?|sprites?|chevrons?|arrows?|avatars?|badges?|buttons?|placeholders?|separators?)(?:[/_.-]|$)/i.test(url.pathname)) return false;
  const w = width == null ? null : Number(width);
  const h = height == null ? null : Number(height);
  if (w !== null && Number.isFinite(w) && w < 280) return false;
  if (h !== null && Number.isFinite(h) && h < 160) return false;
  if (w !== null && h !== null && Number.isFinite(w) && Number.isFinite(h) && h > 0) {
    const ratio = w / h;
    if (ratio < 0.4 || ratio > 4) return false;
  }
  return true;
}
