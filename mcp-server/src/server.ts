import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config/env";
import { bootstrapOpenApiTools } from "./openapi/bootstrap";
import { createCardsMcpServer } from "./mcp/cards-mcp-server";
import { entitlementService } from "./services/entitlement.service";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  logger.info("Initializing Cards MCP Server", {
    port: config.port,
    simulationMode: config.simulationMode,
    rbacEnabled: config.rbacEnabled,
    openApiSpecPathCount: config.openApiSpecPaths.length,
  });

  try {
    await bootstrapOpenApiTools();
  } catch (err) {
    logger.error("OpenAPI bootstrap failed", { error: (err as Error).message });
  }

  const mcpUserId = process.env.MCP_USER_ID;
  const userContext = mcpUserId ? entitlementService.resolveContext(mcpUserId) : undefined;

  const server = createCardsMcpServer(userContext);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Cards MCP Server is running on stdio transport", { userId: mcpUserId });
}

main().catch((err) => {
  logger.error("Fatal error starting server", { error: (err as Error).message });
  process.exit(1);
});
