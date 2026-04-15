/**
 * Best-effort conversion of OpenAPI / JSON Schema fragments into MCP-compatible JSON Schema properties.
 */
export function openApiSchemaToJsonSchema(schema: unknown, depth = 0): Record<string, unknown> {
  if (depth > 14 || schema === null || schema === undefined) {
    return { type: "string", description: "Value too deep or empty — pass a JSON-serializable value" };
  }
  if (typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "string" };
  }
  const s = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof s.description === "string") out.description = s.description;
  if (typeof s.title === "string" && !out.description) out.description = s.title;
  if (Array.isArray(s.enum)) out.enum = s.enum;
  if (typeof s.default !== "undefined") out.default = s.default;
  if (typeof s.format === "string") out.format = s.format;

  if (typeof s.$ref === "string") {
    return {
      type: "object",
      description: `${(out.description as string) || "Schema"}. ($ref present — send a JSON object matching the API contract.)`,
    };
  }

  if (Array.isArray(s.type)) {
    const nonNull = (s.type as string[]).filter((t) => t !== "null");
    out.type = nonNull[0] ?? "string";
    return out;
  }

  const t = s.type as string | undefined;
  if (t === "string" || t === "number" || t === "integer" || t === "boolean") {
    out.type = t === "integer" ? "integer" : t;
    return out;
  }
  if (t === "array") {
    out.type = "array";
    if (s.items) out.items = openApiSchemaToJsonSchema(s.items, depth + 1);
    return out;
  }
  if (t === "object" || (typeof s.properties === "object" && s.properties !== null)) {
    out.type = "object";
    const props = (s.properties ?? {}) as Record<string, unknown>;
    out.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, openApiSchemaToJsonSchema(v, depth + 1)])
    );
    if (Array.isArray(s.required)) out.required = s.required;
    return out;
  }
  if (s.oneOf || s.anyOf || s.allOf) {
    return {
      type: "object",
      description: `${(out.description as string) || "Complex schema"}. Use a JSON object compatible with the API.`,
    };
  }
  out.type = "string";
  return out;
}
