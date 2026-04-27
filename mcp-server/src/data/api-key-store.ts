import { randomUUID } from "node:crypto";
import type { ApiKey, RateLimitEntry } from "../types/api-key";
import { TIER_RATE_LIMITS } from "../types/api-key";
import type { SubscriptionTier } from "../types/toolset";

const store = new Map<string, ApiKey>();
const minuteWindows = new Map<string, RateLimitEntry>();
const dayWindows = new Map<string, RateLimitEntry>();

function generateKey(): string {
  return `cmcp_sk_${randomUUID().replace(/-/g, "")}`;
}

export const apiKeyStore = {
  create(input: { agentName: string; contactEmail: string; description?: string; tier?: SubscriptionTier }): ApiKey {
    const keyId = generateKey();
    const now = new Date().toISOString();
    const key: ApiKey = {
      keyId,
      agentName: input.agentName,
      contactEmail: input.contactEmail,
      description: input.description ?? "",
      tier: input.tier ?? "free",
      active: true,
      createdAt: now,
      lastUsedAt: now,
      requestCount: 0,
    };
    store.set(keyId, key);
    return key;
  },

  get(keyId: string): ApiKey | undefined {
    return store.get(keyId);
  },

  list(): ApiKey[] {
    return [...store.values()];
  },

  revoke(keyId: string): ApiKey | undefined {
    const key = store.get(keyId);
    if (!key) return undefined;
    key.active = false;
    return key;
  },

  updateTier(keyId: string, tier: SubscriptionTier): ApiKey | undefined {
    const key = store.get(keyId);
    if (!key) return undefined;
    key.tier = tier;
    return key;
  },

  touchUsage(keyId: string): void {
    const key = store.get(keyId);
    if (key) {
      key.lastUsedAt = new Date().toISOString();
      key.requestCount++;
    }
  },

  checkRateLimit(keyId: string): { allowed: boolean; retryAfterMs?: number } {
    const key = store.get(keyId);
    if (!key || !key.active) return { allowed: false };

    const limits = TIER_RATE_LIMITS[key.tier];
    const now = Date.now();

    // Per-minute window
    const minuteKey = `min:${keyId}`;
    let minEntry = minuteWindows.get(minuteKey);
    if (!minEntry || now - minEntry.windowStart >= 60_000) {
      minEntry = { windowStart: now, count: 0 };
      minuteWindows.set(minuteKey, minEntry);
    }
    if (minEntry.count >= limits.perMinute) {
      const retryAfterMs = 60_000 - (now - minEntry.windowStart);
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
    }

    // Per-day window
    const dayKey = `day:${keyId}`;
    let dayEntry = dayWindows.get(dayKey);
    if (!dayEntry || now - dayEntry.windowStart >= 86_400_000) {
      dayEntry = { windowStart: now, count: 0 };
      dayWindows.set(dayKey, dayEntry);
    }
    if (dayEntry.count >= limits.perDay) {
      const retryAfterMs = 86_400_000 - (now - dayEntry.windowStart);
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
    }

    // Increment counters
    minEntry.count++;
    dayEntry.count++;
    return { allowed: true };
  },

  delete(keyId: string): boolean {
    minuteWindows.delete(`min:${keyId}`);
    dayWindows.delete(`day:${keyId}`);
    return store.delete(keyId);
  },
};
