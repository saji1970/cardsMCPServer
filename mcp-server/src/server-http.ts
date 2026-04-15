/**
 * HTTP entrypoint: REST admin + catalog UI + OpenAPI reload + MCP tool sandbox.
 * Use on Railway (set PORT). Stdio MCP remains in server.ts for local Cursor use.
 */
import { config } from "./config/env";
import { bootstrapOpenApiTools } from "./openapi/bootstrap";
import { createHttpApp } from "./http/create-app";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  try {
    await bootstrapOpenApiTools();
  } catch (err) {
    logger.error("OpenAPI bootstrap failed (continuing HTTP)", { error: (err as Error).message });
  }

  const app = createHttpApp();
  const port = config.port;
  app.listen(port, "0.0.0.0", () => {
    logger.info("Cards MCP HTTP gateway listening", { port, url: `http://0.0.0.0:${port}` });
  });
}

main().catch((err) => {
  logger.error("Fatal HTTP server error", { error: (err as Error).message });
  process.exit(1);
});
