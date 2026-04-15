# Deploy on Railway

For any **public** URL, set **`ADMIN_API_TOKEN`** so only clients with `Authorization: Bearer …` can change bank endpoints, upload OpenAPI specs, or run the tool sandbox (which can trigger mock payments).

1. Create a **new Railway project** and connect this repo (or push `mcp-server` as its own repo).
2. Set **Root Directory** to `mcp-server` if the repo root is `cardsMCPServer`.
3. Railway runs **`npm install`** and **`npm run build`** (TypeScript + Vite UI into `dist/public`).
4. Start command: **`npm run start:http`** (already set in `railway.json`). The app listens on **`PORT`** (Railway injects it).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Injected by Railway; `config.port` reads it. |
| `SIMULATION_MODE` | `true` for mock cards/promos (recommended for first deploy). |
| `ADMIN_API_TOKEN` | Optional. If set, admin UI and sandbox require `Authorization: Bearer …`. |
| `OPENAPI_SPEC_PATHS` | Optional semicolon paths to OpenAPI files bundled at startup. |
| `OPENAPI_HTTP_BEARER` | Optional bearer for generated `ext_*` HTTP tools. |
| `CARD_API_BASE_URL`, `REWARDS_API_BASE_URL`, `PROMO_API_BASE_URL`, `AUTH_TOKEN` | Bank adapter defaults (see `.env.example`). |

## URLs

- **UI + API:** `https://<your-service>.up.railway.app/`
- **Health:** `GET /health`

## Local stdio MCP (Cursor)

Use **`npm run start`** (or `node dist/server.js`) for the **stdio** MCP process — not the HTTP gateway.

## Local HTTP + hot UI

1. Terminal A: `npm run dev:http` (API on port from `PORT` / default `3001`).
2. Terminal B: `npm run dev:ui` (Vite proxies `/api` and `/health` to `localhost:3001`).
3. Open the URL Vite prints (usually `http://localhost:5173`).
