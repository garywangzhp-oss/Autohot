export const PRIVACY_CONSENT_VERSION = 1;
export const PRIVACY_CONSENT_KEY = "autohot-privacy-consent";
export const LEGACY_ANALYTICS_CONSENT_KEY = "aihot-ga-consent";

export interface ConsentPreferences {
  analytics: boolean;
  ads: boolean;
}

export interface StoredConsent extends ConsentPreferences {
  version: number;
  decidedAt: string;
}

/** Reads only a complete, current consent record; damaged or older records are asked about again. */
export function parseStoredConsent(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.version !== PRIVACY_CONSENT_VERSION || typeof record.analytics !== "boolean" || typeof record.ads !== "boolean" || typeof record.decidedAt !== "string" || Number.isNaN(Date.parse(record.decidedAt))) return null;
    return { version: PRIVACY_CONSENT_VERSION, analytics: record.analytics, ads: record.ads, decidedAt: record.decidedAt };
  } catch {
    return null;
  }
}

export function serializeStoredConsent(preferences: ConsentPreferences, now = new Date()): string {
  return JSON.stringify({ version: PRIVACY_CONSENT_VERSION, analytics: preferences.analytics, ads: preferences.ads, decidedAt: now.toISOString() } satisfies StoredConsent);
}

/** The previous banner only covered Google Analytics; keep that choice as the initial toggle value. */
export function legacyAnalyticsConsent(raw: string | null): boolean {
  return raw === "granted";
}
