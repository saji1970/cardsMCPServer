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
import { entitlementService } from "../services/entitlement.service";
import { userStore } from "../data/user-store";
import { marketplaceService, AgentCategory } from "../services/marketplace.service";
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
        "X-User-Id",
      ],
      exposedHeaders: ["mcp-session-id", "Mcp-Session-Id"],
    })
  );
  app.use(express.json({ limit: "8mb" }));

  mountStreamableMcpHttp(app);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "cards-mcp-gateway", time: new Date().toISOString() });
  });

  // ── Auth endpoints ──────────────────────────────────────────────────────

  app.post("/api/auth/login", (req, res) => {
    const { userId, password } = req.body as { userId?: string; password?: string };
    if (!userId || !password) {
      res.status(400).json({ success: false, error: "userId and password are required" });
      return;
    }
    const user = userStore.get(userId);
    if (!user || !user.active) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }
    if (!userStore.verifyPassword(userId, password)) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }
    userStore.touchLastActive(userId);
    res.json({
      success: true,
      user: {
        userId: user.userId,
        displayName: user.displayName,
        email: user.email,
        roles: user.roles,
      },
    });
  });

  app.get("/api/auth/me", (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    if (!userId) {
      res.status(400).json({ success: false, error: "userId query parameter required" });
      return;
    }
    const user = userStore.get(userId);
    if (!user || !user.active) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({
      success: true,
      user: {
        userId: user.userId,
        displayName: user.displayName,
        email: user.email,
        roles: user.roles,
      },
    });
  });

  app.get("/api/admin/users", (_req, res) => {
    const users = userStore.list();
    res.json({
      success: true,
      count: users.length,
      users: users.map((u) => ({
        userId: u.userId,
        displayName: u.displayName,
        email: u.email,
        roles: u.roles,
        active: u.active,
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
      })),
    });
  });

  app.get("/api/admin/audit", (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const actionPrefix = typeof req.query.actionPrefix === "string" ? req.query.actionPrefix : undefined;
    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
    const entries = entitlementService.queryAuditLog({ userId, actionPrefix, limit });
    res.json({ success: true, count: entries.length, entries });
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
      const { name, arguments: args, userId } = req.body as { name?: string; arguments?: Record<string, unknown>; userId?: string };
      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: 'Body requires "name" (tool name)' });
        return;
      }
      const xUserId = typeof req.headers["x-user-id"] === "string" ? req.headers["x-user-id"] : userId;
      const userContext = xUserId ? entitlementService.resolveContext(xUserId) : undefined;
      const result = await handleToolCall(name, args ?? {}, userContext);
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
        const { name, arguments: args, userId } = req.body as { name?: string; arguments?: Record<string, unknown>; userId?: string };
        if (!name || typeof name !== "string") {
          res.status(400).json({ success: false, error: 'Body requires "name"' });
          return;
        }
        const xUserId = typeof req.headers["x-user-id"] === "string" ? req.headers["x-user-id"] : userId;
        const userContext = xUserId ? entitlementService.resolveContext(xUserId) : undefined;
        const result = await handleToolCall(name, args ?? {}, userContext);
        res.json({ success: !result.isError, isError: result.isError, content: result.content });
      } catch (e) {
        res.status(500).json({ success: false, error: (e as Error).message });
      }
    });
  }

  // ── Marketplace API ──────────────────────────────────────────────────────

  app.get("/api/marketplace/agents", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const category = typeof req.query.category === "string" ? (req.query.category as AgentCategory) : undefined;
    const sort = typeof req.query.sort === "string" ? (req.query.sort as "rating" | "installs" | "newest" | "price") : undefined;
    const agents = marketplaceService.listAgents({ query: q, category, sort });
    res.json({ success: true, count: agents.length, agents });
  });

  app.get("/api/marketplace/agents/featured", (_req, res) => {
    const agents = marketplaceService.getFeatured();
    res.json({ success: true, agents });
  });

  app.get("/api/marketplace/agents/:id", (req, res) => {
    const agent = marketplaceService.getAgent(req.params.id);
    if (!agent) { res.status(404).json({ success: false, error: "Agent not found" }); return; }
    res.json({ success: true, agent });
  });

  app.get("/api/marketplace/agents/:id/reviews", (req, res) => {
    const reviews = marketplaceService.getReviews(req.params.id);
    res.json({ success: true, count: reviews.length, reviews });
  });

  app.post("/api/marketplace/agents/:id/reviews", (req, res) => {
    const { userId, userName, rating, comment } = req.body as { userId?: string; userName?: string; rating?: number; comment?: string };
    if (!userId || !userName || !rating || !comment) {
      res.status(400).json({ success: false, error: "userId, userName, rating, and comment are required" });
      return;
    }
    const review = marketplaceService.addReview({ agentId: req.params.id, userId, userName, rating, comment });
    if (!review) { res.status(404).json({ success: false, error: "Agent not found" }); return; }
    res.json({ success: true, review });
  });

  app.post("/api/marketplace/agents/:id/install", (req, res) => {
    const userId = (req.body as { userId?: string }).userId ?? (typeof req.headers["x-user-id"] === "string" ? req.headers["x-user-id"] : "demo-user");
    const installation = marketplaceService.installAgent(req.params.id, userId);
    if (!installation) { res.status(404).json({ success: false, error: "Agent not found or not published" }); return; }
    res.json({ success: true, installation });
  });

  app.post("/api/marketplace/agents/:id/uninstall", (req, res) => {
    const userId = (req.body as { userId?: string }).userId ?? (typeof req.headers["x-user-id"] === "string" ? req.headers["x-user-id"] : "demo-user");
    const ok = marketplaceService.uninstallAgent(req.params.id, userId);
    if (!ok) { res.status(404).json({ success: false, error: "Agent not installed or not found" }); return; }
    res.json({ success: true });
  });

  app.get("/api/marketplace/user/:userId/installed", (req, res) => {
    const installations = marketplaceService.getUserInstallations(req.params.userId);
    res.json({ success: true, count: installations.length, installations });
  });

  app.post("/api/marketplace/publish", (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const required = ["agentId", "name", "shortDescription", "fullDescription", "icon", "category", "publisherId", "publisherName", "version", "capabilities"];
      for (const field of required) {
        if (!body[field]) { res.status(400).json({ success: false, error: `Missing required field: ${field}` }); return; }
      }
      const pricingType = (body.pricingType as string) || "free";
      let pricing: import("../services/marketplace.service").PricingModel;
      if (pricingType === "one_time") pricing = { type: "one_time", price: Number(body.price) || 0 };
      else if (pricingType === "subscription") pricing = { type: "subscription", price: Number(body.price) || 0, interval: (body.priceInterval as "month" | "year") || "month" };
      else pricing = { type: "free" };

      const agent = marketplaceService.publishAgent({
        agentId: body.agentId as string,
        name: body.name as string,
        shortDescription: body.shortDescription as string,
        fullDescription: body.fullDescription as string,
        icon: body.icon as string,
        category: body.category as AgentCategory,
        tags: (body.tags as string[]) || [],
        publisherId: body.publisherId as string,
        publisherName: body.publisherName as string,
        version: body.version as string,
        pricing,
        capabilities: body.capabilities as string[],
      });
      res.json({ success: true, agent });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/marketplace/agents/:id", (req, res) => {
    const agent = marketplaceService.updateAgent(req.params.id, req.body as Record<string, unknown>);
    if (!agent) { res.status(404).json({ success: false, error: "Agent not found" }); return; }
    res.json({ success: true, agent });
  });

  app.get("/api/marketplace/publisher/:id/agents", (req, res) => {
    const agents = marketplaceService.getPublisherAgents(req.params.id);
    res.json({ success: true, count: agents.length, agents });
  });

  app.get("/api/marketplace/publisher/:id/revenue", (req, res) => {
    const revenue = marketplaceService.getPublisherRevenue(req.params.id);
    res.json({ success: true, ...revenue });
  });

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
