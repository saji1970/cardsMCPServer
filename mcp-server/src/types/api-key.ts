import type { SubscriptionTier } from "./toolset";

export interface ApiKey {
  keyId: string;
  agentName: string;
  contactEmail: string;
  description: string;
  tier: SubscriptionTier;
  active: boolean;
  createdAt: string;
  lastUsedAt: string;
  requestCount: number;
}

export interface RateLimitEntry {
  windowStart: number;
  count: number;
}

export const TIER_RATE_LIMITS: Record<SubscriptionTier, { perMinute: number; perDay: number }> = {
  free: { perMinute: 10, perDay: 500 },
  basic: { perMinute: 30, perDay: 5000 },
  pro: { perMinute: 100, perDay: 50000 },
};
