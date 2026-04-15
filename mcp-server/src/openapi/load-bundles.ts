import fs from "fs";
import path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { logger } from "../utils/logger";
import { buildToolsFromSpec } from "./tool-builder";
import { executeOpenApiOperation, type HttpInvokeConfig } from "./executor";
import type { DynamicToolBundle, ToolCallResult } from "./types";

function resolveSpecPath(specPath: string): string {
  const trimmed = specPath.trim();
  if (path.isAbsolute(trimmed)) return trimmed;
  const fromCwd = path.resolve(process.cwd(), trimmed);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const pkgRelative = path.resolve(__dirname, "../..", trimmed);
  if (fs.existsSync(pkgRelative)) return pkgRelative;
  return fromCwd;
}

function parseExtraHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    logger.warn("OPENAPI_HTTP_HEADERS_JSON is not valid JSON — ignoring");
    return undefined;
  }
}

/**
 * Load one or more OpenAPI 3.x documents, dereference $ref, and build MCP tools + HTTP invoke map.
 */
export async function loadOpenApiToolBundle(
  specPaths: string[],
  http: HttpInvokeConfig
): Promise<DynamicToolBundle> {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<ToolCallResult>>();
  const tools: DynamicToolBundle["tools"] = [];
  const operationSummaries: DynamicToolBundle["operationSummaries"] = [];

  for (const specPath of specPaths) {
    const abs = resolveSpecPath(specPath);
    if (!fs.existsSync(abs)) {
      logger.warn("OpenAPI spec path not found — skipping", { specPath, resolved: abs });
      continue;
    }
    try {
      const bundled = (await SwaggerParser.bundle(abs)) as Record<string, unknown>;
      const built = buildToolsFromSpec(bundled, abs);
      logger.info("OpenAPI spec bundled", {
        path: abs,
        operations: built.length,
      });
      for (const op of built) {
        if (handlers.has(op.toolName)) {
          logger.warn("Duplicate OpenAPI tool name — skipping", { toolName: op.toolName });
          continue;
        }
        tools.push(op.toolDef);
        operationSummaries.push(op.summary);
        const meta = op.meta;
        handlers.set(op.toolName, (args) => executeOpenApiOperation(meta, args, http));
      }
    } catch (err) {
      logger.error("Failed to bundle OpenAPI spec — skipping this file", {
        path: abs,
        error: (err as Error).message,
      });
    }
  }

  return {
    tools,
    operationSummaries,
    hasTool: (name: string) => handlers.has(name),
    async invoke(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
      const fn = handlers.get(name);
      if (!fn) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "Unknown tool" }) }],
          isError: true,
        };
      }
      return fn(args);
    },
  };
}
