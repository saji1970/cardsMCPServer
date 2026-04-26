import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function parseOpenApiSpecPaths(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseOpenApiExtraHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  cardApiBaseUrl: process.env.CARD_API_BASE_URL || "http://localhost:4001/api/cards",
  rewardsApiBaseUrl: process.env.REWARDS_API_BASE_URL || "http://localhost:4002/api/rewards",
  promoApiBaseUrl: process.env.PROMO_API_BASE_URL || "http://localhost:4003/api/promotions",
  authToken: process.env.AUTH_TOKEN || "dev-token-changeme",
  logLevel: process.env.LOG_LEVEL || "info",
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || "300", 10),
  simulationMode: process.env.SIMULATION_MODE !== "false",
  /** Semicolon- or comma-separated paths to OpenAPI 3.x JSON/YAML files; each becomes MCP tools prefixed with `ext_`. */
  openApiSpecPaths: parseOpenApiSpecPaths(process.env.OPENAPI_SPEC_PATHS),
  /** Optional Bearer token sent as Authorization for dynamically generated OpenAPI tools. */
  openApiHttpBearer: process.env.OPENAPI_HTTP_BEARER || "",
  /** Optional JSON object of extra HTTP headers for OpenAPI tools, e.g. {"X-Api-Key":"..."}. */
  openApiExtraHeaders: parseOpenApiExtraHeaders(process.env.OPENAPI_HTTP_HEADERS_JSON),
  /** Enable role-based access control. Defaults to false (no enforcement). */
  rbacEnabled: process.env.RBAC_ENABLED === "true",
} as const;
