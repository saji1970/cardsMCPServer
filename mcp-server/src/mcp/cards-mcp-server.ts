import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { staticToolDefinitions, handleToolCall } from "../tools/registry";
import { getDynamicToolBundle } from "../tools/dynamic-tools-state";
import { resourceDefinitions, handleResourceRead } from "../resources/resources";
import type { UserContext } from "../types/rbac";
import { logger } from "../utils/logger";

/**
 * Creates a fresh MCP Server instance (one per Streamable HTTP session).
 * Tool list is resolved on each tools/list call so OpenAPI reloads apply.
 * If allowedTools is provided, only those tools are exposed and callable.
 */
export function createCardsMcpServer(userContext?: UserContext, allowedTools?: Set<string>): Server {
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

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = [...staticToolDefinitions, ...(getDynamicToolBundle()?.tools ?? [])];
    if (allowedTools) {
      return { tools: allTools.filter((t) => allowedTools.has(t.name)) };
    }
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (allowedTools && !allowedTools.has(name)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: `Tool "${name}" is not available in your subscription tier. Upgrade to access more tools.` }) }],
        isError: true,
      };
    }
    logger.info("MCP tool call", { transport: "streamable-http", tool: name, userId: userContext?.userId });
    return handleToolCall(name, args ?? {}, userContext);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resourceDefinitions,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    logger.info("MCP resource read", { transport: "streamable-http", uri, userId: userContext?.userId });
    return handleResourceRead(uri, userContext);
  });

  return server;
}
