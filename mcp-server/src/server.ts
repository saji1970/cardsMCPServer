import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config/env";
import { bootstrapOpenApiTools } from "./openapi/bootstrap";
import { createCardsMcpServer } from "./mcp/cards-mcp-server";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  logger.info("Initializing Cards MCP Server", {
    port: config.port,
    simulationMode: config.simulationMode,
    openApiSpecPathCount: config.openApiSpecPaths.length,
  });

  try {
    await bootstrapOpenApiTools();
  } catch (err) {
    logger.error("OpenAPI bootstrap failed", { error: (err as Error).message });
  }

  const server = createCardsMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Cards MCP Server is running on stdio transport");
}

main().catch((err) => {
  logger.error("Fatal error starting server", { error: (err as Error).message });
  process.exit(1);
});
