import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config/env";
import { bootstrapOpenApiTools } from "./openapi/bootstrap";
import { logger } from "./utils/logger";
import { staticToolDefinitions, handleToolCall } from "./tools/registry";
import { getDynamicToolBundle } from "./tools/dynamic-tools-state";
import { resourceDefinitions, handleResourceRead } from "./resources/resources";

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
  const dyn = getDynamicToolBundle();
  const openApiTools = dyn?.tools ?? [];
  const allToolDefinitions = [...staticToolDefinitions, ...openApiTools];

  const server = new Server(
    {
      name: "cards-rewards-promotions",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // ── List tools ────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allToolDefinitions,
  }));

  // ── Call tool ─────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info("Tool call received", { tool: name });
    return handleToolCall(name, args ?? {});
  });

  // ── List resources ────────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resourceDefinitions,
  }));

  // ── Read resource ─────────────────────────────────────────────────────────
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    logger.info("Resource read", { uri });
    return handleResourceRead(uri);
  });

  // ── Start transport ─────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Cards MCP Server is running on stdio transport");
}

main().catch((err) => {
  logger.error("Fatal error starting server", { error: (err as Error).message });
  process.exit(1);
});
