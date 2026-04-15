import path from "path";
import { buildToolsFromSpec } from "../src/openapi/tool-builder";
import { loadOpenApiToolBundle } from "../src/openapi/load-bundles";

describe("OpenAPI tool builder", () => {
  it("creates MCP tools from an in-memory OpenAPI document", () => {
    const api = {
      openapi: "3.0.0",
      info: { title: "Unit API", version: "1" },
      servers: [{ url: "https://example.test/api" }],
      paths: {
        "/v1/widgets": {
          get: {
            operationId: "listWidgets",
            summary: "List widgets",
            parameters: [
              {
                name: "cursor",
                in: "query",
                required: false,
                schema: { type: "string" },
              },
            ],
            responses: { 200: { description: "ok" } },
          },
        },
        "/v1/widgets/{id}": {
          get: {
            operationId: "getWidget",
            summary: "Get one widget",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: { 200: { description: "ok" } },
          },
        },
      },
    };

    const built = buildToolsFromSpec(api as Record<string, unknown>, "/tmp/unit.json");
    expect(built).toHaveLength(2);
    expect(built.map((b) => b.toolName)).toEqual(
      expect.arrayContaining([expect.stringContaining("listWidgets"), expect.stringContaining("getWidget")])
    );
    const listTool = built.find((b) => b.summary.operationId === "listWidgets");
    expect(listTool?.toolDef.inputSchema.properties).toHaveProperty("cursor");
    const getTool = built.find((b) => b.summary.operationId === "getWidget");
    expect(getTool?.toolDef.inputSchema.required).toContain("id");
  });

  it("loads the sample OpenAPI file and registers GET operations", async () => {
    const specPath = path.join(__dirname, "../openapi-samples/tiny-store.json");
    const bundle = await loadOpenApiToolBundle([specPath], {});
    expect(bundle.tools.length).toBeGreaterThanOrEqual(2);
    expect(bundle.operationSummaries.some((s) => s.path === "/posts")).toBe(true);
    expect(bundle.hasTool(bundle.tools[0].name)).toBe(true);
  });
});
