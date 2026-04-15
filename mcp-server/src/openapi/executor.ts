import axios, { AxiosError } from "axios";
import { logger } from "../utils/logger";
import type { OperationMeta, ToolCallResult } from "./types";

export type HttpInvokeConfig = {
  bearerToken?: string;
  extraHeaders?: Record<string, string>;
};

function substitutePath(template: string, args: Record<string, unknown>): string {
  let out = template;
  const re = /\{([^/{}]+)\}/g;
  let m: RegExpExecArray | null;
  const used = new Set<string>();
  while ((m = re.exec(template)) !== null) {
    const key = m[1];
    const v = args[key];
    if (v === undefined || v === null) {
      throw new Error(`Missing required path parameter: ${key}`);
    }
    used.add(key);
    out = out.split(`{${key}}`).join(encodeURIComponent(String(v)));
  }
  return out;
}

export async function executeOpenApiOperation(
  meta: OperationMeta,
  args: Record<string, unknown>,
  http: HttpInvokeConfig
): Promise<ToolCallResult> {
  const pathResolved = substitutePath(meta.pathTemplate, args);
  const urlPath = pathResolved.startsWith("/") ? pathResolved : `/${pathResolved}`;

  const params: Record<string, string | number | boolean> = {};
  for (const q of meta.queryParams) {
    const v = args[q.name];
    if (v !== undefined && v !== null) {
      if (typeof v === "object") {
        params[q.name] = JSON.stringify(v);
      } else {
        params[q.name] = v as string | number | boolean;
      }
    } else if (q.required) {
      throw new Error(`Missing required query parameter: ${q.name}`);
    }
  }

  const headers: Record<string, string> = { ...(http.extraHeaders ?? {}) };
  for (const h of meta.headerParams) {
    const v = args[h.name];
    if (v !== undefined && v !== null) {
      headers[h.name] = String(v);
    } else if (h.required) {
      throw new Error(`Missing required header parameter: ${h.name}`);
    }
  }
  if (http.bearerToken) {
    headers.Authorization = headers.Authorization ?? `Bearer ${http.bearerToken}`;
  }

  let data: unknown = undefined;
  if (meta.bodyMode === "json") {
    if (!("body" in args) && meta.bodyRequired) {
      throw new Error('Missing required property "body" for this operation');
    }
    if ("body" in args) {
      data = args.body;
    }
  }

  try {
    logger.info("OpenAPI tool HTTP request", {
      tool: meta.toolName,
      method: meta.method,
      path: urlPath,
    });
    const res = await axios.request({
      baseURL: meta.baseUrl,
      url: urlPath,
      method: meta.method,
      params: Object.keys(params).length ? params : undefined,
      data,
      headers: Object.keys(headers).length ? headers : undefined,
      timeout: 30000,
      validateStatus: () => true,
    });

    const payload = {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      data: res.data,
    };

    const text = JSON.stringify(payload, null, 2);
    if (res.status >= 400) {
      return { content: [{ type: "text", text }], isError: true };
    }
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const ax = err as AxiosError;
    const msg = ax.message ?? String(err);
    logger.error("OpenAPI tool request failed", { tool: meta.toolName, error: msg });
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: msg }, null, 2) }],
      isError: true,
    };
  }
}
