import { config } from "../config/env";
import { getUploadedOpenApiPaths } from "../config/runtime-settings";
import { logger } from "../utils/logger";
import { setDynamicToolBundle } from "../tools/dynamic-tools-state";
import { loadOpenApiToolBundle } from "./load-bundles";

/** Env-configured paths plus admin-uploaded OpenAPI files (absolute paths). */
export function collectAllOpenApiSpecPaths(): string[] {
  return [...config.openApiSpecPaths, ...getUploadedOpenApiPaths()];
}

export async function bootstrapOpenApiTools(): Promise<{ toolCount: number }> {
  const paths = collectAllOpenApiSpecPaths();
  if (paths.length === 0) {
    setDynamicToolBundle(null);
    logger.info("OpenAPI: no spec paths configured");
    return { toolCount: 0 };
  }
  const bundle = await loadOpenApiToolBundle(paths, {
    bearerToken: config.openApiHttpBearer?.trim() || undefined,
    extraHeaders: config.openApiExtraHeaders,
  });
  setDynamicToolBundle(bundle);
  logger.info("OpenAPI MCP tools bootstrapped", { toolCount: bundle.tools.length });
  return { toolCount: bundle.tools.length };
}
