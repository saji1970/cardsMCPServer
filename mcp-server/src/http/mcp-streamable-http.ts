import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createCardsMcpServer } from "../mcp/cards-mcp-server";
import { entitlementService } from "../services/entitlement.service";
import { optionalApiKeyForMcp } from "./api-key-middleware";
import { toolsetRegistry } from "../data/toolset-registry";
import { logger } from "../utils/logger";

const transports: Record<string, StreamableHTTPServerTransport> = {};

function sessionHeader(req: Request): string | undefined {
  const v = req.headers["mcp-session-id"];
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

function optionalMcpBearer(req: Request, res: Response, next: () => void): void {
  if (req.method === "OPTIONS") {
    next();
    return;
  }
  const token = process.env.MCP_API_TOKEN?.trim();
  if (!token) {
    next();
    return;
  }
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized: set Authorization: Bearer <MCP_API_TOKEN>" },
      id: null,
    });
    return;
  }
  next();
}

/**
 * MCP Streamable HTTP (session per client). Android / mobile agents POST initialize here,
 * then send further JSON-RPC with header mcp-session-id.
 */
export function mountStreamableMcpHttp(app: Express): void {
  app.all("/mcp", optionalApiKeyForMcp, optionalMcpBearer, async (req: Request, res: Response) => {
    try {
      const sessionId = sessionHeader(req);
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports[sessionId]) {
        const existing = transports[sessionId];
        if (existing instanceof StreamableHTTPServerTransport) {
          transport = existing;
        } else {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: session uses a different transport type" },
            id: null,
          });
          return;
        }
      } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            logger.info("MCP Streamable HTTP session initialized", { sessionId: sid });
            transports[sid] = transport!;
          },
        });
        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
            logger.info("MCP Streamable HTTP session closed", { sessionId: sid });
          }
        };
        const xUserId = typeof req.headers["x-user-id"] === "string" ? req.headers["x-user-id"] : undefined;
        const userContext = xUserId ? entitlementService.resolveContext(xUserId) : undefined;

        // API key tier + optional X-Toolset-Id narrows the tool list (e.g. "1" or "2").
        let allowedTools: Set<string> | undefined;
        if (req.apiKey) {
          const toolsetHeader = req.headers["x-toolset-id"];
          const toolsetId = typeof toolsetHeader === "string" ? toolsetHeader : Array.isArray(toolsetHeader) ? toolsetHeader[0] : undefined;
          allowedTools = toolsetRegistry.getAllowedToolsForTier(req.apiKey.tier, toolsetId);
        }

        const server = createCardsMcpServer(userContext, allowedTools);
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: POST initialize first, then include mcp-session-id header on follow-up requests",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error("MCP /mcp handler error", { error: (err as Error).message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });
}
