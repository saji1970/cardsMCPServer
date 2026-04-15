import { CacheEntry } from "../types";
import { config } from "../config/env";
import { logger } from "./logger";

class InMemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtl: number;

  constructor(ttlSeconds: number) {
    this.defaultTtl = ttlSeconds * 1000;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      logger.debug("Cache miss (expired)", { key });
      return null;
    }
    logger.debug("Cache hit", { key });
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtl);
    this.store.set(key, { data, expiresAt });
    logger.debug("Cache set", { key, expiresAt: new Date(expiresAt).toISOString() });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export const cache = new InMemoryCache(config.cacheTtlSeconds);
