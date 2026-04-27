import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import axios from "axios";
import { config } from "../config/env";
import {
  getEffectiveAuthToken,
  getEffectiveAuthTokenForBank,
  getEffectiveCardApiBaseUrl,
  getEffectiveCardApiBaseUrlForBank,
  getEffectivePromoApiBaseUrl,
  getEffectivePromoApiBaseUrlForBank,
  getEffectiveRewardsApiBaseUrl,
  getEffectiveRewardsApiBaseUrlForBank,
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
import {
  listCardProducts,
  getCardProductById,
  createCardProduct,
  updateCardProduct,
  deleteCardProduct,
} from "../data/card-catalog";
import {
  CardProductSchema,
  RewardRateEntrySchema,
  SignupBonusSchema,
  EligibilityCriteriaSchema,
  AprRangesSchema,
  FeeScheduleSchema,
  BenefitSummarySchema,
} from "../types";
import { z } from "zod";
import { apiKeyStore } from "../data/api-key-store";
import { toolsetRegistry } from "../data/toolset-registry";
import { requireApiKeyOrAdmin } from "./api-key-middleware";
import { SubscriptionTierSchema } from "../types/toolset";
import { cardService } from "../services/card.service";
import { promoService } from "../services/promo.service";
import { logger } from "../utils/logger";
import { mountStreamableMcpHttp } from "./mcp-streamable-http";
import { buildJobStore } from "../jobs/build-job-store";
import { bankRegistry } from "../data/bank-registry";

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

function buildMcpConfigPayload(req: Request): Record<string, unknown> {
  const host = req.headers.host || "localhost:3001";
  const protocol = req.protocol || "http";
  const baseUrl = `${protocol}://${host}`;
  const toolsets = toolsetRegistry.list();
  const allTools = staticToolDefinitions.map((t) => ({ name: t.name, description: t.description }));
  const dyn = getDynamicToolBundle();
  if (dyn) {
    for (const t of dyn.tools) {
      allTools.push({ name: t.name, description: t.description });
    }
  }
  const cursorMcp = {
    mcpServers: {
      "cards-mcp": {
        url: `${baseUrl}/mcp`,
        headers: {
          "X-API-Key": "<your-api-key>",
          "X-Toolset-Id": "1",
        },
      },
    },
  };
  return {
    serverUrl: `${baseUrl}/mcp`,
    authMethod: "X-API-Key header or Bearer token (cmcp_sk_*)",
    optionalHeaders: {
      "X-Toolset-Id":
        "Optional. Restrict MCP tools to one toolset id: 1, 2, card-discovery, or card-catalog-management. Omit to expose every tool your subscription tier allows.",
    },
    registrationEndpoint: `${baseUrl}/api/keys/register`,
    toolsetsEndpoint: `${baseUrl}/api/toolsets`,
    bankCatalog: {
      list: `${baseUrl}/api/bank/v1/catalog?bankId=<bankId>`,
      listAll: `${baseUrl}/api/bank/v1/catalog (omit bankId to include every issuer)`,
      banks: `${baseUrl}/api/banks (registered issuers)`,
      adminBanks: `${baseUrl}/api/admin/banks (create or update an issuer connection; admin only)`,
      product: `${baseUrl}/api/bank/v1/products/:productId`,
      createProduct: `POST ${baseUrl}/api/bank/v1/products?bankId=<id> (body + optional bankId query)`,
    },
    buildJobs: {
      storageDir: buildJobStore.jobsDir(),
      list: `GET ${baseUrl}/api/jobs`,
      create: `POST ${baseUrl}/api/jobs`,
      get: `GET ${baseUrl}/api/jobs/:id`,
      tick: `POST ${baseUrl}/api/jobs/:id/tick — advances one step; state is saved to disk and resumes after restart`,
    },
    toolsets: toolsets.map((ts) => ({
      toolsetId: ts.toolsetId,
      name: ts.name,
      description: ts.description,
      tools: ts.tools,
      requiredTier: ts.requiredTier,
    })),
    toolCount: allTools.length,
    tools: allTools,
    copyPaste: {
      description: "Copy the JSON below into Cursor or Claude Desktop MCP settings (compare to RapidAPI copy-paste).",
      cursorMcp,
      claudeMcp: { mcpServers: cursorMcp.mcpServers },
    },
    examples: {
      claudeDesktop: {
        mcpServers: {
          "cards-mcp": {
            url: `${baseUrl}/mcp`,
            headers: { "X-API-Key": "<your-api-key>" },
          },
        },
      },
      cursor: {
        mcpServers: {
          "cards-mcp": {
            url: `${baseUrl}/mcp`,
            headers: { "X-API-Key": "<your-api-key>" },
          },
        },
      },
      customAgent: {
        note: "POST to /mcp with JSON-RPC initialize, include X-API-Key header",
        registerFirst: `curl -X POST ${baseUrl}/api/keys/register -H 'Content-Type: application/json' -d '{"agentName":"my-agent","contactEmail":"dev@example.com"}'`,
        connectMcp: `curl -X POST ${baseUrl}/mcp -H 'Content-Type: application/json' -H 'X-API-Key: <key>' -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"my-agent","version":"1.0.0"}},"id":1}'`,
      },
    },
  };
}

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
        "X-API-Key",
        "X-Toolset-Id",
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

  // ── Public registration ──────────────────────────────────────────────────
  app.post("/api/auth/register", (req, res) => {
    const { userId, displayName, email, password, role } = req.body as {
      userId?: string; displayName?: string; email?: string; password?: string; role?: string;
    };
    if (!userId || !displayName || !email || !password || !role) {
      res.status(400).json({ success: false, error: "userId, displayName, email, password, and role are required" });
      return;
    }
    if (role !== "consumer" && role !== "publisher") {
      res.status(400).json({ success: false, error: "role must be 'consumer' or 'publisher'" });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ success: false, error: "Password must be at least 4 characters" });
      return;
    }
    if (userStore.get(userId)) {
      res.status(409).json({ success: false, error: "User ID is already taken" });
      return;
    }
    try {
      const user = userStore.create({ userId, displayName, email, roles: [role] });
      userStore.setPassword(userId, password);
      res.json({
        success: true,
        user: { userId: user.userId, displayName: user.displayName, email: user.email, roles: user.roles },
      });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // ── Admin user creation ─────────────────────────────────────────────────
  app.post("/api/admin/users", (req, res) => {
    const { userId, displayName, email, password, roles } = req.body as {
      userId?: string; displayName?: string; email?: string; password?: string; roles?: string[];
    };
    if (!userId || !displayName || !email || !password || !roles || !Array.isArray(roles) || roles.length === 0) {
      res.status(400).json({ success: false, error: "userId, displayName, email, password, and roles[] are required" });
      return;
    }
    const validRoles = ["consumer", "publisher", "consumer_publisher", "admin", "operations", "finance", "support"];
    for (const r of roles) {
      if (!validRoles.includes(r)) {
        res.status(400).json({ success: false, error: `Invalid role: ${r}. Valid: ${validRoles.join(", ")}` });
        return;
      }
    }
    if (password.length < 4) {
      res.status(400).json({ success: false, error: "Password must be at least 4 characters" });
      return;
    }
    if (userStore.get(userId)) {
      res.status(409).json({ success: false, error: "User ID is already taken" });
      return;
    }
    try {
      const user = userStore.create({ userId, displayName, email, roles: roles as import("../types/rbac").Role[] });
      userStore.setPassword(userId, password);
      res.json({
        success: true,
        user: {
          userId: user.userId, displayName: user.displayName, email: user.email,
          roles: user.roles, active: user.active, createdAt: user.createdAt, lastActiveAt: user.lastActiveAt,
        },
      });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  // ── Admin password reset ─────────────────────────────────────────────────
  app.post("/api/admin/users/:userId/reset-password", (req, res) => {
    const targetId = req.params.userId;
    const user = userStore.get(targetId);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    // Generate a readable default password: role prefix + 4 random hex chars
    const prefix = user.roles[0] ?? "user";
    const rand = Math.random().toString(16).slice(2, 6);
    const newPassword = `${prefix}-${rand}`;
    userStore.setPassword(targetId, newPassword);
    res.json({ success: true, userId: targetId, temporaryPassword: newPassword });
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

  app.get("/api/catalog/products", (req, res) => {
    const filter: { issuer?: string; bankId?: string } = {};
    if (typeof req.query.issuer === "string" && req.query.issuer.trim()) filter.issuer = req.query.issuer;
    if (typeof req.query.bankId === "string" && req.query.bankId.trim()) filter.bankId = req.query.bankId;
    const products = listCardProducts(Object.keys(filter).length ? filter : undefined);
    res.json({ success: true, count: products.length, products });
  });

  app.get("/api/catalog/products/:productId", (req, res) => {
    const product = getCardProductById(req.params.productId as string);
    if (!product) { res.status(404).json({ success: false, error: "Product not found" }); return; }
    res.json({ success: true, product });
  });

  app.post("/api/catalog/products", requireApiKeyOrAdmin, (req, res) => {
    try {
      const product = CardProductSchema.parse(req.body);
      const created = createCardProduct(product);
      res.status(201).json({ success: true, product: created });
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ success: false, error: "Validation error", details: e.issues });
        return;
      }
      res.status(409).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/catalog/products/:productId", requireApiKeyOrAdmin, (req, res) => {
    try {
      const product = updateCardProduct(req.params.productId as string, req.body as Record<string, unknown>);
      res.json({ success: true, product });
    } catch (e) {
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.delete("/api/catalog/products/:productId", requireApiKeyOrAdmin, (req, res) => {
    const deleted = deleteCardProduct(req.params.productId as string);
    if (!deleted) { res.status(404).json({ success: false, error: "Product not found" }); return; }
    res.json({ success: true, deleted: true, productId: req.params.productId as string });
  });

  app.put("/api/catalog/products/:productId/reward-rates", requireApiKeyOrAdmin, (req, res) => {
    try {
      const rewardRates = z.array(RewardRateEntrySchema).parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { rewardRates });
      res.json({ success: true, product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/catalog/products/:productId/signup-bonus", requireApiKeyOrAdmin, (req, res) => {
    try {
      const signupBonus = SignupBonusSchema.parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { signupBonus });
      res.json({ success: true, product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/catalog/products/:productId/eligibility", requireApiKeyOrAdmin, (req, res) => {
    try {
      const eligibility = EligibilityCriteriaSchema.parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { eligibility });
      res.json({ success: true, product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/catalog/products/:productId/apr-ranges", requireApiKeyOrAdmin, (req, res) => {
    try {
      const aprRanges = AprRangesSchema.parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { aprRanges });
      res.json({ success: true, product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/catalog/products/:productId/fees", requireApiKeyOrAdmin, (req, res) => {
    try {
      const fees = FeeScheduleSchema.parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { fees });
      res.json({ success: true, product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/catalog/products/:productId/benefits", requireApiKeyOrAdmin, (req, res) => {
    try {
      const benefits = z.array(BenefitSummarySchema).parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { benefits });
      res.json({ success: true, product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  // ── Registered issuers (multiple bank API connections) ─────────────────

  app.get("/api/banks", (_req, res) => {
    res.json({ success: true, count: bankRegistry.listPublic().length, banks: bankRegistry.listPublic() });
  });

  app.get("/api/admin/banks", requireAdmin, (_req, res) => {
    res.json({
      success: true,
      banks: bankRegistry.list().map((b) => ({ ...b, authToken: b.authToken ? "[set]" : undefined })),
    });
  });

  app.post("/api/admin/banks", requireAdmin, (req, res) => {
    try {
      const b = bankRegistry.create(
        req.body as {
          bankId: string;
          displayName: string;
          cardApiBaseUrl?: string;
          rewardsApiBaseUrl?: string;
          promoApiBaseUrl?: string;
          authToken?: string;
        },
      );
      clearHttpClientCache();
      res.status(201).json({ success: true, bank: { ...b, authToken: b.authToken ? "[set]" : undefined } });
    } catch (e) {
      res.status(400).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/admin/banks/:bankId", requireAdmin, (req, res) => {
    try {
      const id = String(req.params.bankId);
      const b = bankRegistry.update(id, {
        displayName: typeof (req.body as { displayName?: string }).displayName === "string" ? (req.body as { displayName: string }).displayName : undefined,
        cardApiBaseUrl: typeof (req.body as { cardApiBaseUrl?: string }).cardApiBaseUrl === "string" ? (req.body as { cardApiBaseUrl: string }).cardApiBaseUrl : undefined,
        rewardsApiBaseUrl:
          typeof (req.body as { rewardsApiBaseUrl?: string }).rewardsApiBaseUrl === "string"
            ? (req.body as { rewardsApiBaseUrl: string }).rewardsApiBaseUrl
            : undefined,
        promoApiBaseUrl:
          typeof (req.body as { promoApiBaseUrl?: string }).promoApiBaseUrl === "string" ? (req.body as { promoApiBaseUrl: string }).promoApiBaseUrl : undefined,
        authToken: typeof (req.body as { authToken?: string }).authToken === "string" ? (req.body as { authToken: string }).authToken : undefined,
        active: typeof (req.body as { active?: boolean }).active === "boolean" ? (req.body as { active: boolean }).active : undefined,
      });
      clearHttpClientCache();
      res.json({ success: true, bank: { ...b, authToken: b.authToken ? "[set]" : undefined } });
    } catch (e) {
      res.status(400).json({ success: false, error: (e as Error).message });
    }
  });

  app.delete("/api/admin/banks/:bankId", requireAdmin, (req, res) => {
    const id = String(req.params.bankId);
    if (!bankRegistry.delete(id)) {
      res.status(404).json({ success: false, error: "Bank not found" });
      return;
    }
    clearHttpClientCache();
    res.json({ success: true, deleted: true, bankId: id });
  });

  // ── Bank catalog API (issuer / partner integration) ───────────────────────
  // Same product model as /api/catalog: reward rate tables, signup bonus, eligibility, APR, fees, benefits.

  app.get("/api/bank/v1/catalog", (req, res) => {
    const filter: { issuer?: string; bankId?: string } = {};
    if (typeof req.query.issuer === "string" && req.query.issuer.trim()) filter.issuer = req.query.issuer;
    if (typeof req.query.bankId === "string" && req.query.bankId.trim()) filter.bankId = req.query.bankId;
    const products = listCardProducts(Object.keys(filter).length ? filter : undefined);
    res.json({ success: true, api: "bank.v1", count: products.length, products });
  });

  app.get("/api/bank/v1/products/:productId", (req, res) => {
    const product = getCardProductById(req.params.productId as string);
    if (!product) { res.status(404).json({ success: false, error: "Product not found" }); return; }
    res.json({ success: true, api: "bank.v1", product });
  });

  app.post("/api/bank/v1/products", requireApiKeyOrAdmin, (req, res) => {
    try {
      const q = typeof req.query.bankId === "string" ? req.query.bankId.trim() : undefined;
      const body = { ...(req.body as object), ...(q ? { bankId: q } : {}) };
      const product = CardProductSchema.parse(body);
      const created = createCardProduct(product);
      res.status(201).json({ success: true, api: "bank.v1", product: created });
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ success: false, error: "Validation error", details: e.issues });
        return;
      }
      res.status(409).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/bank/v1/products/:productId", requireApiKeyOrAdmin, (req, res) => {
    try {
      const product = updateCardProduct(req.params.productId as string, req.body as Record<string, unknown>);
      res.json({ success: true, api: "bank.v1", product });
    } catch (e) {
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.delete("/api/bank/v1/products/:productId", requireApiKeyOrAdmin, (req, res) => {
    const deleted = deleteCardProduct(req.params.productId as string);
    if (!deleted) { res.status(404).json({ success: false, error: "Product not found" }); return; }
    res.json({ success: true, api: "bank.v1", deleted: true, productId: req.params.productId as string });
  });

  app.put("/api/bank/v1/products/:productId/reward-rates", requireApiKeyOrAdmin, (req, res) => {
    try {
      const rewardRates = z.array(RewardRateEntrySchema).parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { rewardRates });
      res.json({ success: true, api: "bank.v1", product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/bank/v1/products/:productId/signup-bonus", requireApiKeyOrAdmin, (req, res) => {
    try {
      const signupBonus = SignupBonusSchema.parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { signupBonus });
      res.json({ success: true, api: "bank.v1", product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/bank/v1/products/:productId/eligibility", requireApiKeyOrAdmin, (req, res) => {
    try {
      const eligibility = EligibilityCriteriaSchema.parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { eligibility });
      res.json({ success: true, api: "bank.v1", product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/bank/v1/products/:productId/apr-ranges", requireApiKeyOrAdmin, (req, res) => {
    try {
      const aprRanges = AprRangesSchema.parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { aprRanges });
      res.json({ success: true, api: "bank.v1", product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/bank/v1/products/:productId/fees", requireApiKeyOrAdmin, (req, res) => {
    try {
      const fees = FeeScheduleSchema.parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { fees });
      res.json({ success: true, api: "bank.v1", product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  app.put("/api/bank/v1/products/:productId/benefits", requireApiKeyOrAdmin, (req, res) => {
    try {
      const benefits = z.array(BenefitSummarySchema).parse(req.body);
      const product = updateCardProduct(req.params.productId as string, { benefits });
      res.json({ success: true, api: "bank.v1", product });
    } catch (e) {
      if (e instanceof z.ZodError) { res.status(400).json({ success: false, error: "Validation error", details: e.issues }); return; }
      res.status(404).json({ success: false, error: (e as Error).message });
    }
  });

  // ── API Key subscription endpoints ──────────────────────────────────────

  app.post("/api/keys/register", (req, res) => {
    const { agentName, contactEmail, description } = req.body as {
      agentName?: string; contactEmail?: string; description?: string;
    };
    if (!agentName || !contactEmail) {
      res.status(400).json({ success: false, error: "agentName and contactEmail are required" });
      return;
    }
    const key = apiKeyStore.create({ agentName, contactEmail, description });
    res.status(201).json({
      success: true,
      apiKey: key.keyId,
      tier: key.tier,
      message: "Store this API key securely. It cannot be retrieved again.",
    });
  });

  app.get("/api/admin/keys", requireAdmin, (_req, res) => {
    const keys = apiKeyStore.list();
    res.json({ success: true, count: keys.length, keys });
  });

  app.post("/api/admin/keys/:keyId/revoke", requireAdmin, (req, res) => {
    const key = apiKeyStore.revoke(req.params.keyId as string);
    if (!key) { res.status(404).json({ success: false, error: "API key not found" }); return; }
    res.json({ success: true, key });
  });

  app.put("/api/admin/keys/:keyId/tier", requireAdmin, (req, res) => {
    const { tier } = req.body as { tier?: string };
    if (!tier) { res.status(400).json({ success: false, error: "tier is required" }); return; }
    try {
      const parsedTier = SubscriptionTierSchema.parse(tier);
      const key = apiKeyStore.updateTier(req.params.keyId as string, parsedTier);
      if (!key) { res.status(404).json({ success: false, error: "API key not found" }); return; }
      res.json({ success: true, key });
    } catch {
      res.status(400).json({ success: false, error: "Invalid tier. Use: free, basic, or pro" });
    }
  });

  app.delete("/api/admin/keys/:keyId", requireAdmin, (req, res) => {
    const deleted = apiKeyStore.delete(req.params.keyId as string);
    if (!deleted) { res.status(404).json({ success: false, error: "API key not found" }); return; }
    res.json({ success: true, deleted: true });
  });

  // ── /mcp-config export endpoint ─────────────────────────────────────────

  app.get("/mcp-config", (req, res) => {
    res.json(buildMcpConfigPayload(req));
  });

  app.get("/api/mcp-config", (req, res) => {
    res.json(buildMcpConfigPayload(req));
  });

  app.get("/api/toolsets", (req, res) => {
    const tierQ = req.query.tier;
    if (typeof tierQ === "string" && tierQ.trim()) {
      try {
        const tier = SubscriptionTierSchema.parse(tierQ);
        res.json({ success: true, toolsets: toolsetRegistry.listForTier(tier) });
        return;
      } catch {
        res.status(400).json({ success: false, error: "Invalid tier. Use: free, basic, or pro" });
        return;
      }
    }
    res.json({ success: true, toolsets: toolsetRegistry.list() });
  });

  // ── Durable build / checkpoint jobs (rate limits: tick one step, persist, resume after restart) ──

  app.get("/api/jobs", requireApiKeyOrAdmin, (_req, res) => {
    res.json({ success: true, jobs: buildJobStore.list() });
  });

  app.post("/api/jobs", requireApiKeyOrAdmin, (req, res) => {
    try {
      const { name, kind, totalSteps, checkpoint } = req.body as {
        name?: string; kind?: string; totalSteps?: number; checkpoint?: Record<string, unknown>;
      };
      if (!name?.trim() || !kind?.trim()) {
        res.status(400).json({ success: false, error: "name and kind are required" });
        return;
      }
      const job = buildJobStore.create({ name, kind, totalSteps: totalSteps ?? 1, checkpoint });
      res.status(201).json({ success: true, job });
    } catch (e) {
      res.status(500).json({ success: false, error: (e as Error).message });
    }
  });

  app.get("/api/jobs/:id", requireApiKeyOrAdmin, (req, res) => {
    const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const job = buildJobStore.get(id);
    if (!job) { res.status(404).json({ success: false, error: "Job not found" }); return; }
    res.json({ success: true, job });
  });

  app.post("/api/jobs/:id/tick", requireApiKeyOrAdmin, (req, res) => {
    try {
      const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      const merge = (req.body as { mergeCheckpoint?: Record<string, unknown> })?.mergeCheckpoint;
      const job = buildJobStore.tick(id, { mergeCheckpoint: merge });
      res.json({ success: true, job });
    } catch (e) {
      res.status(400).json({ success: false, error: (e as Error).message });
    }
  });

  app.post("/api/jobs/:id/reset", requireApiKeyOrAdmin, (req, res) => {
    try {
      const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      const { totalSteps, clearCheckpoint } = req.body as { totalSteps?: number; clearCheckpoint?: boolean };
      const job = buildJobStore.reset(id, { totalSteps, clearCheckpoint });
      res.json({ success: true, job });
    } catch (e) {
      res.status(400).json({ success: false, error: (e as Error).message });
    }
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
      registeredBanks: bankRegistry.listPublic(),
      registeredBanksFullCount: bankRegistry.list().length,
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
    const bankId = typeof (req.body as { bankId?: string }).bankId === "string" ? (req.body as { bankId: string }).bankId.trim() : undefined;
    const url =
      which === "rewards"
        ? getEffectiveRewardsApiBaseUrlForBank(bankId)
        : which === "promo"
          ? getEffectivePromoApiBaseUrlForBank(bankId)
          : getEffectiveCardApiBaseUrlForBank(bankId);
    const token = getEffectiveAuthTokenForBank(bankId);
    try {
      const r = await axios.get(url.replace(/\/$/, "") + "/", {
        timeout: 4000,
        validateStatus: () => true,
        headers: { Authorization: `Bearer ${token}` },
      });
      res.json({
        success: true,
        which,
        bankId: bankId ?? null,
        url,
        status: r.status,
        reachable: r.status < 500,
      });
    } catch (e) {
      res.json({
        success: false,
        which,
        bankId: bankId ?? null,
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
