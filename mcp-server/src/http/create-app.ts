import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import axios from "axios";
import { config } from "../config/env";
import {
  getEffectiveAuthToken,
  getEffectiveCardApiBaseUrl,
  getEffectivePromoApiBaseUrl,
  getEffectiveRewardsApiBaseUrl,
  getEffectiveSimulationMode,
} from "../config/effective-config";
import {
  setBankApiOverrides,
  getBankApiOverrides,
  clearBankApiOverrides,
  addUploadedOpenApiPath,
  clearUploadedOpenApiPaths,
  getUploadedOpenApiPaths,
} from "../config/runtime-settings";
import { clearHttpClientCache } from "../adapters/http-clients";
import { bootstrapOpenApiTools, collectAllOpenApiSpecPaths } from "../openapi/bootstrap";
import { staticToolDefinitions, handleToolCall } from "../tools/registry";
import { getDynamicToolBundle } from "../tools/dynamic-tools-state";
import { listCardProducts } from "../data/card-catalog";
import { cardService } from "../services/card.service";
import { promoService } from "../services/promo.service";
import { logger } from "../utils/logger";
import { mountStreamableMcpHttp } from "./mcp-streamable-http";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "openapi");

function ensureUploadDir(): void {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.ADMIN_API_TOKEN?.trim();
  if (!token) {
    next();
    return;
  }
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${token}`) {
    res.status(401).json({ error: "Unauthorized", hint: "Set Authorization: Bearer <ADMIN_API_TOKEN>" });
    return;
  }
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
});

export function createHttpApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "mcp-session-id",
        "Mcp-Session-Id",
        "MCP-Protocol-Version",
        "Accept",
      ],
      exposedHeaders: ["mcp-session-id", "Mcp-Session-Id"],
    })
  );
  app.use(express.json({ limit: "8mb" }));

  mountStreamableMcpHttp(app);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "cards-mcp-gateway", time: new Date().toISOString() });
  });

  app.get("/api/catalog/products", (_req, res) => {
    const products = listCardProducts();
    res.json({ success: true, count: products.length, products });
  });

  app.get("/api/cards/wallet", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : "demo-user";
      const cards = await cardService.getEligibleCards(userId);
      res.json({ success: true, userId, count: cards.length, cards });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  app.get("/api/promotions/active", async (_req, res) => {
    try {
      const promos = await promoService.getActivePromotions();
      res.json({ success: true, count: promos.length, promotions: promos });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  app.get("/api/tools", (_req, res) => {
    const builtIn = staticToolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      source: "builtin" as const,
    }));
    const dyn = getDynamicToolBundle();
    const openapi =
      dyn?.tools.map((t) => ({
        name: t.name,
        description: t.description,
        source: "openapi" as const,
      })) ?? [];
    res.json({ success: true, tools: [...builtIn, ...openapi] });
  });

  app.get("/api/admin/config", (_req, res) => {
    res.json({
      success: true,
      envDefaults: {
        cardApiBaseUrl: config.cardApiBaseUrl,
        rewardsApiBaseUrl: config.rewardsApiBaseUrl,
        promoApiBaseUrl: config.promoApiBaseUrl,
        simulationMode: config.simulationMode,
        openApiSpecPaths: [...config.openApiSpecPaths],
      },
      runtimeOverrides: getBankApiOverrides(),
      effectiveSimulationMode: getEffectiveSimulationMode(),
      openApiPathsLoaded: collectAllOpenApiSpecPaths(),
      adminTokenConfigured: !!process.env.ADMIN_API_TOKEN?.trim(),
    });
  });

  app.post("/api/admin/config", requireAdmin, (req, res) => {
    const body = req.body as Record<string, unknown>;
    setBankApiOverrides({
      cardApiBaseUrl: typeof body.cardApiBaseUrl === "string" ? body.cardApiBaseUrl : undefined,
      rewardsApiBaseUrl: typeof body.rewardsApiBaseUrl === "string" ? body.rewardsApiBaseUrl : undefined,
      promoApiBaseUrl: typeof body.promoApiBaseUrl === "string" ? body.promoApiBaseUrl : undefined,
      authToken: typeof body.authToken === "string" ? body.authToken : undefined,
      simulationMode:
        typeof body.simulationMode === "boolean"
          ? body.simulationMode
          : body.simulationMode === "true"
            ? true
            : body.simulationMode === "false"
              ? false
              : undefined,
    });
    clearHttpClientCache();
    res.json({ success: true, runtimeOverrides: getBankApiOverrides() });
  });

  app.post("/api/admin/config/reset", requireAdmin, (_req, res) => {
    clearBankApiOverrides();
    clearHttpClientCache();
    res.json({ success: true });
  });

  app.post("/api/admin/bank/ping", requireAdmin, async (req, res) => {
    const which = (req.body as { which?: string })?.which ?? "card";
    const url =
      which === "rewards"
        ? getEffectiveRewardsApiBaseUrl()
        : which === "promo"
          ? getEffectivePromoApiBaseUrl()
          : getEffectiveCardApiBaseUrl();
    const token = getEffectiveAuthToken();
    try {
      const r = await axios.get(url.replace(/\/$/, "") + "/", {
        timeout: 4000,
        validateStatus: () => true,
        headers: { Authorization: `Bearer ${token}` },
      });
      res.json({
        success: true,
        which,
        url,
        status: r.status,
        reachable: r.status < 500,
      });
    } catch (e) {
      res.json({
        success: false,
        which,
        url,
        reachable: false,
        error: (e as Error).message,
      });
    }
  });

  app.post(
    "/api/admin/openapi/upload",
    requireAdmin,
    upload.single("file"),
    async (req, res) => {
      try {
        const f = req.file;
        if (!f?.path) {
          res.status(400).json({ success: false, error: "Missing file field (multipart name: file)" });
          return;
        }
        addUploadedOpenApiPath(path.resolve(f.path));
        const { toolCount } = await bootstrapOpenApiTools();
        res.json({
          success: true,
          savedPath: f.path,
          toolCount,
          paths: collectAllOpenApiSpecPaths(),
        });
      } catch (e) {
        res.status(500).json({ success: false, error: (e as Error).message });
      }
    }
  );

  app.post("/api/admin/openapi/raw", requireAdmin, async (req, res) => {
    try {
      const { filename, content } = req.body as { filename?: string; content?: string };
      if (!content || typeof content !== "string") {
        res.status(400).json({ success: false, error: 'JSON body must include string "content" (OpenAPI JSON/YAML)' });
        return;
      }
      ensureUploadDir();
      const base =
        typeof filename === "string" && filename.trim()
          ? filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)
          : `openapi_${Date.now()}.json`;
      const outPath = path.join(UPLOAD_DIR, base.endsWith(".json") || base.endsWith(".yaml") || base.endsWith(".yml") ? base : `${base}.json`);
      fs.writeFileSync(outPath, content, "utf8");
      addUploadedOpenApiPath(path.resolve(outPath));
      const { toolCount } = await bootstrapOpenApiTools();
      res.json({ success: true, savedPath: outPath, toolCount, paths: collectAllOpenApiSpecPaths() });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  app.post("/api/admin/openapi/reload", requireAdmin, async (_req, res) => {
    try {
      const { toolCount } = await bootstrapOpenApiTools();
      res.json({ success: true, toolCount, paths: collectAllOpenApiSpecPaths() });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  app.post("/api/admin/openapi/clear-uploads", requireAdmin, async (_req, res) => {
    for (const p of getUploadedOpenApiPaths()) {
      try {
        if (p.startsWith(path.resolve(UPLOAD_DIR)) && fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
    clearUploadedOpenApiPaths();
    clearHttpClientCache();
    const { toolCount } = await bootstrapOpenApiTools();
    res.json({ success: true, toolCount, paths: collectAllOpenApiSpecPaths() });
  });

  app.post("/api/sandbox/invoke", requireAdmin, async (req, res) => {
    try {
      const { name, arguments: args } = req.body as { name?: string; arguments?: Record<string, unknown> };
      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: 'Body requires "name" (tool name)' });
        return;
      }
      const result = await handleToolCall(name, args ?? {});
      res.json({
        success: !result.isError,
        isError: result.isError,
        content: result.content,
      });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  /** Optional: allow sandbox without admin token in dev */
  if (process.env.SANDBOX_PUBLIC === "true") {
    app.post("/api/sandbox/invoke-public", async (req, res) => {
      try {
        const { name, arguments: args } = req.body as { name?: string; arguments?: Record<string, unknown> };
        if (!name || typeof name !== "string") {
          res.status(400).json({ success: false, error: 'Body requires "name"' });
          return;
        }
        const result = await handleToolCall(name, args ?? {});
        res.json({ success: !result.isError, isError: result.isError, content: result.content });
      } catch (e) {
        res.status(500).json({ success: false, error: (e as Error).message });
      }
    });
  }

  const staticDir = path.join(__dirname, "..", "public");
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("html").send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cards MCP Gateway</title></head><body>
        <p>API is up. UI static files not found (run <code>npm run build</code>).</p>
        <ul><li><a href="/health">/health</a></li><li><a href="/api/tools">/api/tools</a></li><li><code>/mcp</code> — MCP Streamable HTTP (see ANDROID_MCP.md)</li></ul>
        </body></html>`
      );
    });
  }

  return app;
}
