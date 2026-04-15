# Using the Cards MCP from an Android (agentic) app

The HTTP gateway exposes **MCP Streamable HTTP** at:

`https://<your-railway-host>/mcp`

This is the same protocol family used by modern MCP clients (JSON-RPC over HTTP, session via `mcp-session-id` header). Your Android app should use **HTTPS** and optionally **`Authorization: Bearer <MCP_API_TOKEN>`** when the server has `MCP_API_TOKEN` set.

## Flow (high level)

1. **POST** `/mcp` with body: JSON-RPC **`initialize`** request (no `mcp-session-id` header yet).
2. Read response headers for **`mcp-session-id`** (and JSON body with `result`).
3. For **`tools/list`**, **`tools/call`**, etc.: **POST** `/mcp` with the same JSON-RPC shape, and header **`mcp-session-id: <id>`**.
4. **GET** `/mcp` may be used for SSE streams per MCP Streamable HTTP (follow SDK / spec for your client library).
5. **DELETE** `/mcp` with `mcp-session-id` ends the session (when supported by your client stack).

## Kotlin / OkHttp sketch (initialize + tools/list)

Use your deployed base URL and token (if any). This is illustrative—not a full MCP client.

```kotlin
val base = "https://YOUR-SERVICE.up.railway.app"
val mcpToken = "your-mcp-api-token" // if MCP_API_TOKEN is set on server

fun postMcp(body: String, sessionId: String? = null): Response {
  val b = body.toRequestBody("application/json".toMediaType())
  val req = Request.Builder()
    .url("$base/mcp")
    .post(b)
    .apply {
      if (mcpToken.isNotEmpty()) header("Authorization", "Bearer $mcpToken")
      if (sessionId != null) header("mcp-session-id", sessionId)
    }
    .build()
  return okHttp.newCall(req).execute()
}

// 1) initialize
val initJson = """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"AndroidAgent","version":"1.0"}}}"""
val r1 = postMcp(initJson, null)
val sid = r1.header("mcp-session-id") ?: error("no session")

// 2) tools/list
val listJson = """{"jsonrpc":"2.0","id":2,"method":"tools/list"}"""
val r2 = postMcp(listJson, sid)
```

Then **`tools/call`** for `evaluate_purchase_payment_options` with a `params` object containing `name` and `arguments` per MCP.

## Recommended tool for “best card for this product”

Call **`evaluate_purchase_payment_options`** with arguments such as:

```json
{
  "userId": "demo-user",
  "amount": 199.99,
  "merchant": "Best Buy",
  "category": "electronics",
  "currency": "USD",
  "purchaseNotes": "laptop preorder"
}
```

## Easier path (REST, not full MCP)

If you do not want to implement JSON-RPC on the device yet, call the existing REST sandbox:

- **POST** `/api/sandbox/invoke` with body `{ "name": "evaluate_purchase_payment_options", "arguments": { ... } }`  
  (requires **`ADMIN_API_TOKEN`** when configured—use for internal tools only, or add a dedicated mobile-scoped token later.)

## Official MCP client libraries

If Anthropic or the MCP project publishes a **Kotlin/Java MCP client** with Streamable HTTP, prefer that over hand-rolling JSON-RPC. Point it at `https://<host>/mcp` with the same headers as above.
