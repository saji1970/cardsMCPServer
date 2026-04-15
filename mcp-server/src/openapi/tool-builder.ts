import path from "path";
import { openApiSchemaToJsonSchema } from "./schema-mappers";
import type { HttpMethod, McpToolDefinition, OperationMeta, OperationSummary } from "./types";

const HTTP_METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete", "head", "options"];

function slug(s: string, max = 48): string {
  return s
    .replace(/\.(yaml|yml|json)$/i, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max) || "spec";
}

function safeOperationId(raw: string, method: string, pathKey: string): string {
  const base = raw.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (base) return base.slice(0, 80);
  const pathSlug = pathKey
    .split("/")
    .filter(Boolean)
    .map((p) => p.replace(/[{}]/g, ""))
    .join("_");
  return `${method}_${pathSlug || "op"}`.replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 80);
}

function pickBaseUrl(api: Record<string, unknown>): string {
  const servers = api.servers as Array<{ url: string }> | undefined;
  let url = servers?.[0]?.url ?? "http://localhost";
  url = url.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const envKey = `OPENAPI_SERVER_${String(key).toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    return process.env[envKey] ?? "";
  });
  if (!url || url.endsWith("//")) url = "http://localhost";
  return url.replace(/\/$/, "");
}

function getJsonBodyInfo(requestBody: unknown): { required: boolean; schema: Record<string, unknown> } | null {
  if (!requestBody || typeof requestBody !== "object") return null;
  const rb = requestBody as Record<string, unknown>;
  const content = rb.content as Record<string, unknown> | undefined;
  if (!content || typeof content !== "object") return null;
  const json = content["application/json"] as Record<string, unknown> | undefined;
  if (!json || typeof json.schema === "undefined") return null;
  return {
    required: !!rb.required,
    schema: json.schema as Record<string, unknown>,
  };
}

export type BuiltOperation = {
  toolName: string;
  toolDef: McpToolDefinition;
  meta: OperationMeta;
  summary: OperationSummary;
};

export function buildToolsFromSpec(
  api: Record<string, unknown>,
  specAbsolutePath: string
): BuiltOperation[] {
  const info = (api.info ?? {}) as Record<string, unknown>;
  const specTitle = typeof info.title === "string" ? info.title : "API";
  const baseUrl = pickBaseUrl(api);
  const fileSlug = slug(path.basename(specAbsolutePath));
  const paths = api.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths || typeof paths !== "object") return [];

  const results: BuiltOperation[] = [];

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== "object") continue;
      const opObj = op as Record<string, unknown>;

      const operationIdRaw =
        typeof opObj.operationId === "string" ? opObj.operationId : `${method}_${pathKey}`;
      const operationId = safeOperationId(operationIdRaw, method, pathKey);
      const toolName = `ext_${fileSlug}_${operationId}`.slice(0, 120);

      const summaryText =
        typeof opObj.summary === "string"
          ? opObj.summary
          : typeof opObj.description === "string"
            ? opObj.description
            : operationId;

      const parameters = (Array.isArray(opObj.parameters) ? opObj.parameters : []) as Array<
        Record<string, unknown>
      >;

      const pathParams: string[] = [];
      const queryParams: Array<{ name: string; required: boolean }> = [];
      const headerParams: Array<{ name: string; required: boolean }> = [];

      const properties: Record<string, unknown> = {};
      const requiredTop: string[] = [];

      for (const param of parameters) {
        if (!param || typeof param !== "object") continue;
        const name = typeof param.name === "string" ? param.name : null;
        const inn = typeof param.in === "string" ? param.in : null;
        if (!name || !inn) continue;
        const required = !!param.required;
        const schema = (param.schema ?? { type: "string" }) as unknown;
        const desc =
          typeof param.description === "string" ? param.description : `${inn} parameter ${name}`;

        if (inn === "path") {
          pathParams.push(name);
          properties[name] = { ...openApiSchemaToJsonSchema(schema), description: desc };
          requiredTop.push(name);
        } else if (inn === "query") {
          queryParams.push({ name, required });
          properties[name] = { ...openApiSchemaToJsonSchema(schema), description: desc };
          if (required) requiredTop.push(name);
        } else if (inn === "header") {
          headerParams.push({ name, required });
          properties[name] = { ...openApiSchemaToJsonSchema(schema), description: desc };
          if (required) requiredTop.push(name);
        }
      }

      const bodyInfo = getJsonBodyInfo(opObj.requestBody);
      let bodyMode: "json" | "none" = "none";
      let bodyRequired = false;
      if (bodyInfo) {
        bodyMode = "json";
        bodyRequired = bodyInfo.required;
        properties.body = {
          ...openApiSchemaToJsonSchema(bodyInfo.schema),
          description: "JSON request body (application/json)",
        };
        if (bodyRequired) requiredTop.push("body");
      }

      const description =
        `${summaryText}\n\n` +
        `HTTP ${method.toUpperCase()} ${pathKey}\n` +
        `OpenAPI: ${specTitle} (${path.basename(specAbsolutePath)})\n` +
        `Base URL: ${baseUrl}`;

      const toolDef: McpToolDefinition = {
        name: toolName,
        description: description.slice(0, 8000),
        inputSchema: {
          type: "object",
          properties,
          ...(requiredTop.length ? { required: [...new Set(requiredTop)] } : {}),
        },
      };

      const meta: OperationMeta = {
        toolName,
        method,
        pathTemplate: pathKey,
        baseUrl,
        pathParams,
        queryParams,
        headerParams,
        bodyMode,
        bodyRequired,
      };

      results.push({
        toolName,
        toolDef,
        meta,
        summary: {
          toolName,
          method: method.toUpperCase(),
          path: pathKey,
          baseUrl,
          summary: summaryText,
          operationId,
          specPath: specAbsolutePath,
          specTitle,
        },
      });
    }
  }

  return results;
}
