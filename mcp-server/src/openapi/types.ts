/** MCP tool listing entry (subset of @modelcontextprotocol/sdk Tool) */
export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";

export type OperationMeta = {
  toolName: string;
  method: HttpMethod;
  pathTemplate: string;
  baseUrl: string;
  pathParams: string[];
  queryParams: Array<{ name: string; required: boolean }>;
  headerParams: Array<{ name: string; required: boolean }>;
  bodyMode: "json" | "none";
  bodyRequired: boolean;
};

export type OperationSummary = {
  toolName: string;
  method: string;
  path: string;
  baseUrl: string;
  summary: string;
  operationId: string;
  specPath: string;
  specTitle: string;
};

export type ToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type DynamicToolBundle = {
  tools: McpToolDefinition[];
  operationSummaries: OperationSummary[];
  hasTool: (name: string) => boolean;
  invoke: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
};
