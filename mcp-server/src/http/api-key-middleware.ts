import type { Request, Response, NextFunction } from "express";
import { apiKeyStore } from "../data/api-key-store";
import type { ApiKey } from "../types/api-key";

// Extend Express Request to carry resolved API key
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

function extractApiKey(req: Request): string | undefined {
  // Check X-API-Key header first
  const header = req.headers["x-api-key"];
  if (typeof header === "string" && header.startsWith("cmcp_sk_")) return header;
  // Check Authorization Bearer
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer cmcp_sk_")) return auth.slice(7);
  return undefined;
}

/**
 * Requires a valid API key OR the admin token. Attaches req.apiKey if API key is used.
 * Returns 401/403/429 on failure.
 */
export function requireApiKeyOrAdmin(req: Request, res: Response, next: NextFunction): void {
  // Allow admin token pass-through
  const adminToken = process.env.ADMIN_API_TOKEN?.trim();
  if (adminToken && req.headers.authorization === `Bearer ${adminToken}`) {
    next();
    return;
  }

  const keyId = extractApiKey(req);
  if (!keyId) {
    res.status(401).json({ error: "API key required. Set X-API-Key header or Bearer cmcp_sk_* token." });
    return;
  }

  const key = apiKeyStore.get(keyId);
  if (!key) {
    res.status(401).json({ error: "Invalid API key." });
    return;
  }
  if (!key.active) {
    res.status(403).json({ error: "API key has been revoked." });
    return;
  }

  const rateCheck = apiKeyStore.checkRateLimit(keyId);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: "Rate limit exceeded.",
      retryAfterMs: rateCheck.retryAfterMs,
    });
    return;
  }

  apiKeyStore.touchUsage(keyId);
  req.apiKey = key;
  next();
}

/**
 * Like requireApiKeyOrAdmin but passes through when no API key is present.
 * Used for MCP endpoints where API key is optional (falls through to existing auth).
 */
export function optionalApiKeyForMcp(req: Request, res: Response, next: NextFunction): void {
  const keyId = extractApiKey(req);
  if (!keyId) {
    next();
    return;
  }

  const key = apiKeyStore.get(keyId);
  if (!key) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid API key." },
      id: null,
    });
    return;
  }
  if (!key.active) {
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "API key has been revoked." },
      id: null,
    });
    return;
  }

  const rateCheck = apiKeyStore.checkRateLimit(keyId);
  if (!rateCheck.allowed) {
    res.status(429).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Rate limit exceeded." },
      id: null,
    });
    return;
  }

  apiKeyStore.touchUsage(keyId);
  req.apiKey = key;
  next();
}
