import { z } from "zod";
import { cardService } from "../services/card.service";
import { rewardsService } from "../services/rewards.service";
import { promoService } from "../services/promo.service";
import { decisionEngine } from "../services/decision.engine";
import { featuresRelevantToPurchase, purchaseService } from "../services/purchase.service";
import { marketplaceService } from "../services/marketplace.service";
import { entitlementService, EntitlementError } from "../services/entitlement.service";
import { userStore } from "../data/user-store";
import { config } from "../config/env";
import type { UserContext } from "../types/rbac";
import { RoleSchema } from "../types/rbac";
import { logger } from "../utils/logger";
import { getDynamicToolBundle } from "./dynamic-tools-state";

// ── JSON Schema definitions for MCP tool listing ────────────────────────────

export const staticToolDefinitions = [
  {
    name: "get_eligible_cards",
    description:
      "Retrieve all eligible payment cards for a given user. Returns tokenized card IDs (never raw PANs), card network, issuer, tier, and available credit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: { type: "string", description: "The user identifier" },
      },
      required: ["userId"],
    },
  },
  {
    name: "authorize_payment",
    description:
      "Execute a payment authorization (mock ISO 8583 response). Returns auth code, response code, and trace ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cardId: { type: "string", description: "Tokenized card ID" },
        amount: { type: "number", description: "Transaction amount (positive)" },
        currency: { type: "string", description: "Currency code (default: USD)" },
        merchantId: { type: "string", description: "Merchant identifier" },
        merchantName: { type: "string", description: "Merchant name" },
        category: {
          type: "string",
          description: "Merchant category (e.g., dining, travel, groceries)",
        },
      },
      required: ["cardId", "amount", "merchantId", "merchantName", "category"],
    },
  },
  {
    name: "calculate_rewards",
    description:
      "Calculate potential rewards (points and cash value) for a transaction on a given card. Takes into account card tier, merchant category, and bonus multipliers.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cardId: { type: "string", description: "Tokenized card ID" },
        amount: { type: "number", description: "Transaction amount (positive)" },
        category: {
          type: "string",
          description: "Merchant category (e.g., dining, travel, groceries)",
        },
      },
      required: ["cardId", "amount", "category"],
    },
  },
  {
    name: "redeem_rewards",
    description:
      "Redeem accumulated rewards points for cash back, statement credit, gift cards, or travel. Returns redemption confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cardId: { type: "string", description: "Tokenized card ID" },
        points: { type: "number", description: "Number of points to redeem (positive)" },
        redemptionType: {
          type: "string",
          enum: ["cash_back", "statement_credit", "gift_card", "travel"],
          description: "Redemption type",
        },
      },
      required: ["cardId", "points", "redemptionType"],
    },
  },
  {
    name: "get_applicable_offers",
    description:
      "Fetch promotions and offers applicable for a specific transaction context — filters by card(s), merchant category, merchant name, and transaction amount.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cardIds: {
          type: "array",
          items: { type: "string" },
          description: "List of tokenized card IDs to check",
        },
        category: { type: "string", description: "Merchant category" },
        merchant: { type: "string", description: "Merchant name" },
        amount: { type: "number", description: "Transaction amount (positive)" },
      },
      required: ["cardIds", "category", "merchant", "amount"],
    },
  },
  {
    name: "recommend_payment_strategy",
    description:
      "Analyze all eligible cards, calculate rewards, check promotions, and recommend the optimal payment card. Returns the best card, expected rewards, applicable promotions, and estimated total savings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: { type: "string", description: "The user identifier" },
        amount: { type: "number", description: "Transaction amount (positive)" },
        merchant: { type: "string", description: "Merchant name" },
        category: {
          type: "string",
          description: "Merchant category (e.g., dining, travel, groceries, shopping)",
        },
        currency: { type: "string", description: "Currency code (default: USD)" },
      },
      required: ["userId", "amount", "merchant", "category"],
    },
  },
  {
    name: "simulate_transaction",
    description:
      "Run a full transaction simulation: authorization, rewards calculation, promotion application, and net cost breakdown. Does not execute a real charge.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: { type: "string", description: "The user identifier" },
        amount: { type: "number", description: "Transaction amount (positive)" },
        merchant: { type: "string", description: "Merchant name" },
        category: { type: "string", description: "Merchant category" },
        cardId: {
          type: "string",
          description:
            "Specific card to simulate (optional — if omitted, the best card is chosen automatically)",
        },
        currency: { type: "string", description: "Currency code (default: USD)" },
      },
      required: ["userId", "amount", "merchant", "category"],
    },
  },
  {
    name: "list_card_products",
    description:
      "List issuer card products in the catalog with marketing positioning, feature lists, and strong spend categories. Use this to compare products, explain benefits, or ground checkout advice before choosing a card.",
    inputSchema: {
      type: "object" as const,
      properties: {
        issuer: {
          type: "string",
          description: "Optional filter: issuer name substring (e.g. Chase, Citi)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_card_product_features",
    description:
      "Return full product details and features for a catalog productId, or resolve features via a user's cardId. Use for deep benefit and offer-adjacent reasoning (protections, category strengths).",
    inputSchema: {
      type: "object" as const,
      properties: {
        productId: {
          type: "string",
          description: "Catalog product id (e.g. prod-chase-sapphire-reserve)",
        },
        cardId: {
          type: "string",
          description: "Tokenized wallet card id — resolves linked product when productId is omitted",
        },
      },
      required: [],
    },
  },
  {
    name: "evaluate_purchase_payment_options",
    description:
      "Primary agent tool for checkout: ranks eligible payment cards for a specific purchase (amount, merchant, category), merges active offers, rewards, and product features, and returns checkout-ready suggestions plus an agentSummary for user-facing guidance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: { type: "string", description: "The user identifier" },
        amount: { type: "number", description: "Purchase amount (positive)" },
        merchant: { type: "string", description: "Merchant or storefront name" },
        category: {
          type: "string",
          description:
            "Spend category for this basket (e.g. dining, travel, groceries, shopping, electronics)",
        },
        currency: { type: "string", description: "Currency code (default: USD)" },
        purchaseNotes: {
          type: "string",
          description:
            "Optional free text: items, SKUs, or channels (e.g. laptop, preorder, subscription) to surface relevant protections or tags",
        },
      },
      required: ["userId", "amount", "merchant", "category"],
    },
  },
  {
    name: "list_openapi_loaded_operations",
    description:
      "List all HTTP operations that were registered as MCP tools from OpenAPI specs (OPENAPI_SPEC_PATHS at server startup). Use to discover ext_* tool names, methods, paths, and base URLs before calling them.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "optimize_cart",
    description:
      "Given a cart of multiple items, recommend the best payment card for each item independently. Returns per-item card recommendations with expected rewards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: { type: "string", description: "The user identifier" },
        items: {
          type: "array",
          description: "Cart items to optimize",
          items: {
            type: "object",
            properties: {
              merchant: { type: "string", description: "Merchant name" },
              amount: { type: "number", description: "Item amount (positive)" },
              category: {
                type: "string",
                description: "Merchant category (e.g., dining, travel, groceries). Defaults to 'shopping'",
              },
            },
            required: ["merchant", "amount"],
          },
        },
      },
      required: ["userId", "items"],
    },
  },
  {
    name: "list_agents",
    description:
      "List all available AI agents in the marketplace with their capabilities, descriptions, and pricing.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_agent",
    description:
      "Get details for a specific marketplace agent by ID, including capabilities and pricing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "The agent identifier (e.g. default_optimizer)" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "publish_agent",
    description:
      "Publish a new AI agent to the marketplace. Requires publisher, consumer_publisher, or admin role.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Unique agent identifier (slug)" },
        name: { type: "string", description: "Agent display name" },
        shortDescription: { type: "string", description: "One-line description (max 100 chars)" },
        fullDescription: { type: "string", description: "Full marketing description" },
        icon: { type: "string", description: "Emoji icon for the agent" },
        category: {
          type: "string",
          enum: ["finance", "travel", "shopping", "productivity", "utilities", "lifestyle"],
          description: "Agent category",
        },
        tags: { type: "array", items: { type: "string" }, description: "Searchable tags" },
        publisherId: { type: "string", description: "Publisher identifier" },
        publisherName: { type: "string", description: "Publisher display name" },
        version: { type: "string", description: "Semantic version (e.g. 1.0.0)" },
        pricingType: {
          type: "string",
          enum: ["free", "one_time", "subscription"],
          description: "Pricing model",
        },
        price: { type: "number", description: "Price (required for one_time and subscription)" },
        priceInterval: {
          type: "string",
          enum: ["month", "year"],
          description: "Billing interval (required for subscription)",
        },
        capabilities: { type: "array", items: { type: "string" }, description: "MCP tool capabilities" },
      },
      required: ["agentId", "name", "shortDescription", "fullDescription", "icon", "category", "publisherId", "publisherName", "version", "pricingType", "capabilities"],
    },
  },
  {
    name: "install_agent",
    description:
      "Install a marketplace agent for the current user. Returns installation confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "The agent to install" },
        userId: { type: "string", description: "The user installing the agent" },
      },
      required: ["agentId", "userId"],
    },
  },
  {
    name: "review_agent",
    description:
      "Submit a review and rating for an installed marketplace agent.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "The agent to review" },
        userId: { type: "string", description: "The reviewer's user id" },
        userName: { type: "string", description: "Display name for the review" },
        rating: { type: "number", description: "Rating from 1 to 5" },
        comment: { type: "string", description: "Review text" },
      },
      required: ["agentId", "userId", "userName", "rating", "comment"],
    },
  },
  {
    name: "manage_users",
    description:
      "Manage platform users: list, create, update, or deactivate. Requires admin role when RBAC is enabled.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "update", "deactivate"],
          description: "Action to perform",
        },
        userId: { type: "string", description: "Target userId (required for create/update/deactivate)" },
        displayName: { type: "string", description: "Display name (create/update)" },
        email: { type: "string", description: "Email (create/update)" },
        roles: {
          type: "array",
          items: {
            type: "string",
            enum: ["consumer", "publisher", "consumer_publisher", "admin", "operations", "finance", "support"],
          },
          description: "Roles to assign (create/update)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_audit_log",
    description:
      "Query the RBAC audit log. Filter by userId, action prefix, or limit. Available to admin, finance, and support roles.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: { type: "string", description: "Filter by userId" },
        actionPrefix: { type: "string", description: "Filter by action prefix (e.g. 'tool:')" },
        limit: { type: "number", description: "Max entries to return (default 100)" },
      },
      required: [],
    },
  },
];

/** Built-in tools only; server merges OpenAPI-generated tools at runtime. */
export const toolDefinitions = staticToolDefinitions;

// ── Zod schemas for runtime validation ──────────────────────────────────────

const GetEligibleCardsInput = z.object({ userId: z.string() });

const AuthorizePaymentInput = z.object({
  cardId: z.string(),
  amount: z.number().positive(),
  currency: z.string().optional().default("USD"),
  merchantId: z.string(),
  merchantName: z.string(),
  category: z.string(),
});

const CalculateRewardsInput = z.object({
  cardId: z.string(),
  amount: z.number().positive(),
  category: z.string(),
});

const RedeemRewardsInput = z.object({
  cardId: z.string(),
  points: z.number().positive(),
  redemptionType: z.enum(["cash_back", "statement_credit", "gift_card", "travel"]),
});

const GetApplicableOffersInput = z.object({
  cardIds: z.array(z.string()),
  category: z.string(),
  merchant: z.string(),
  amount: z.number().positive(),
});

const RecommendStrategyInput = z.object({
  userId: z.string(),
  amount: z.number().positive(),
  merchant: z.string(),
  category: z.string(),
  currency: z.string().optional().default("USD"),
});

const SimulateTransactionInput = z.object({
  userId: z.string(),
  amount: z.number().positive(),
  merchant: z.string(),
  category: z.string(),
  cardId: z.string().optional(),
  currency: z.string().optional().default("USD"),
});

const ListCardProductsInput = z.object({
  issuer: z.string().optional(),
});

const GetCardProductFeaturesInput = z.object({
  productId: z.string().optional(),
  cardId: z.string().optional(),
});

const EvaluatePurchasePaymentInput = z.object({
  userId: z.string(),
  amount: z.number().positive(),
  merchant: z.string(),
  category: z.string(),
  currency: z.string().optional().default("USD"),
  purchaseNotes: z.string().optional(),
});

const OptimizeCartInput = z.object({
  userId: z.string(),
  items: z.array(
    z.object({
      merchant: z.string(),
      amount: z.number().positive(),
      category: z.string().optional().default("shopping"),
    })
  ),
});

const GetAgentInput = z.object({
  agentId: z.string(),
});

const PublishAgentInput = z.object({
  agentId: z.string(),
  name: z.string(),
  shortDescription: z.string(),
  fullDescription: z.string(),
  icon: z.string(),
  category: z.enum(["finance", "travel", "shopping", "productivity", "utilities", "lifestyle"]),
  tags: z.array(z.string()).optional().default([]),
  publisherId: z.string(),
  publisherName: z.string(),
  version: z.string(),
  pricingType: z.enum(["free", "one_time", "subscription"]),
  price: z.number().optional(),
  priceInterval: z.enum(["month", "year"]).optional(),
  capabilities: z.array(z.string()),
});

const InstallAgentInput = z.object({
  agentId: z.string(),
  userId: z.string(),
});

const ReviewAgentInput = z.object({
  agentId: z.string(),
  userId: z.string(),
  userName: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string(),
});

const ManageUsersInput = z.object({
  action: z.enum(["list", "create", "update", "deactivate"]),
  userId: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  roles: z.array(RoleSchema).optional(),
});

const GetAuditLogInput = z.object({
  userId: z.string().optional(),
  actionPrefix: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

// ── Tool handler dispatch ───────────────────────────────────────────────────

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(error: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ success: false, error }) }],
    isError: true,
  };
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  userContext?: UserContext,
): Promise<ToolResult> {
  try {
    // ── RBAC gate ──────────────────────────────────────────────────────
    if (config.rbacEnabled && userContext) {
      const permission = `tool:${name}`;
      try {
        entitlementService.assertPermission(userContext, permission);
        entitlementService.recordAccess(userContext.userId, permission);
      } catch (err) {
        if (err instanceof EntitlementError) {
          entitlementService.recordDenied(userContext.userId, permission);
          throw err;
        }
        throw err;
      }
    }

    const dynamicBundle = getDynamicToolBundle();
    if (dynamicBundle?.hasTool(name)) {
      return await dynamicBundle.invoke(name, args);
    }

    switch (name) {
      // ── Card tools ──────────────────────────────────────────────────────
      case "get_eligible_cards": {
        const { userId } = GetEligibleCardsInput.parse(args);
        const cards = await cardService.getEligibleCards(userId);
        return ok({
          success: true,
          count: cards.length,
          cards: cards.map((c) => ({
            cardId: c.cardId,
            tokenizedId: c.tokenizedId,
            last4: c.last4,
            network: c.network,
            type: c.type,
            issuer: c.issuer,
            tier: c.tier,
            availableCredit: c.availableCredit,
            rewardsProgram: c.rewardsProgram,
            productId: c.productId,
            productName: c.productName,
            features: c.features ?? [],
          })),
        });
      }

      case "authorize_payment": {
        const params = AuthorizePaymentInput.parse(args);
        const result = await cardService.authorizePayment(params);
        return ok({ success: true, authorization: result });
      }

      // ── Rewards tools ───────────────────────────────────────────────────
      case "calculate_rewards": {
        const { cardId, amount, category } = CalculateRewardsInput.parse(args);
        const card = await cardService.getCardById(cardId);
        if (!card) return fail(`Card ${cardId} not found`);
        const result = await rewardsService.calculateRewards(
          cardId,
          amount,
          category,
          card.tier
        );
        return ok({ success: true, rewards: result });
      }

      case "redeem_rewards": {
        const params = RedeemRewardsInput.parse(args);
        const result = await rewardsService.redeemRewards(params);
        return ok({ success: result.status !== "failed", redemption: result });
      }

      // ── Promo tools ─────────────────────────────────────────────────────
      case "get_applicable_offers": {
        const { cardIds, category, merchant, amount } =
          GetApplicableOffersInput.parse(args);
        const promos = await promoService.getApplicableOffers(
          cardIds,
          category,
          merchant,
          amount
        );
        return ok({ success: true, count: promos.length, promotions: promos });
      }

      // ── Strategy tools ──────────────────────────────────────────────────
      case "recommend_payment_strategy": {
        const params = RecommendStrategyInput.parse(args);
        const strategy = await decisionEngine.recommendPaymentStrategy(params);
        const featBest = featuresRelevantToPurchase(
          strategy.bestCard.card.features,
          params.category
        );
        return ok({
          success: true,
          summary: strategy.summary,
          estimatedSavings: strategy.estimatedSavings,
          bestCard: {
            cardId: strategy.bestCard.card.cardId,
            last4: strategy.bestCard.card.last4,
            network: strategy.bestCard.card.network,
            issuer: strategy.bestCard.card.issuer,
            tier: strategy.bestCard.card.tier,
            productId: strategy.bestCard.card.productId,
            productName: strategy.bestCard.card.productName,
            rewardValue: strategy.bestCard.rewardValue,
            discountValue: strategy.bestCard.discountValue,
            effectiveValue: strategy.bestCard.effectiveValue,
            rewards: strategy.bestCard.rewards,
            relevantFeatures: featBest,
            promotions: strategy.bestCard.applicablePromotions.map((p) => ({
              promoId: p.promoId,
              title: p.title,
              discountType: p.discountType,
              discountValue: p.discountValue,
            })),
          },
          alternatives: strategy.alternatives.map((alt) => ({
            rank: alt.rank,
            cardId: alt.card.cardId,
            last4: alt.card.last4,
            issuer: alt.card.issuer,
            productId: alt.card.productId,
            productName: alt.card.productName,
            effectiveValue: alt.effectiveValue,
            rewardValue: alt.rewardValue,
            discountValue: alt.discountValue,
            relevantFeatures: featuresRelevantToPurchase(alt.card.features, params.category),
          })),
        });
      }

      case "simulate_transaction": {
        const params = SimulateTransactionInput.parse(args);
        const result = await decisionEngine.simulateTransaction(params);
        return ok({
          success: true,
          simulation: {
            authorized: result.authorization.approved,
            authCode: result.authorization.authCode,
            responseCode: result.authorization.responseCode,
            traceId: result.authorization.traceId,
            breakdown: result.breakdown,
            totalBenefitValue: result.totalBenefitValue,
            netCost: result.netCost,
            rewards: {
              pointsEarned: result.rewards.pointsEarned,
              cashValueEarned: result.rewards.cashValueEarned,
              totalRate: result.rewards.totalRate,
            },
            promotionsApplied: result.promotionsApplied.map((p) => ({
              promoId: p.promoId,
              title: p.title,
              discountType: p.discountType,
              discountValue: p.discountValue,
            })),
          },
        });
      }

      case "list_card_products": {
        const { issuer } = ListCardProductsInput.parse(args);
        const products = purchaseService.listProducts(issuer ? { issuer } : undefined);
        return ok({
          success: true,
          count: products.length,
          products: products.map((p) => ({
            productId: p.productId,
            displayName: p.displayName,
            issuer: p.issuer,
            network: p.network,
            tier: p.tier,
            annualFeeUsd: p.annualFeeUsd,
            marketingSummary: p.marketingSummary,
            strongCategories: p.strongCategories,
            features: p.features,
          })),
        });
      }

      case "get_card_product_features": {
        const { productId, cardId } = GetCardProductFeaturesInput.parse(args);
        if (!productId && !cardId) {
          return fail("Provide productId or cardId to load product features");
        }
        let resolvedProductId = productId;
        if (cardId && !resolvedProductId) {
          const card = await cardService.getCardById(cardId);
          if (!card) return fail(`Card ${cardId} not found`);
          resolvedProductId = card.productId;
          if (!resolvedProductId) {
            return fail(`Card ${cardId} has no linked catalog productId`);
          }
        }
        const detail = purchaseService.getProductDetail(resolvedProductId!);
        if (!detail) return fail(`Unknown productId: ${resolvedProductId}`);
        return ok({ success: true, product: detail });
      }

      case "evaluate_purchase_payment_options": {
        const params = EvaluatePurchasePaymentInput.parse(args);
        const evaluation = await purchaseService.evaluatePurchasePayment(params);
        return ok({ success: true, ...evaluation });
      }

      case "list_openapi_loaded_operations": {
        const b = getDynamicToolBundle();
        return ok({
          success: true,
          count: b?.operationSummaries.length ?? 0,
          operations: b?.operationSummaries ?? [],
          hint: "OpenAPI-backed tools are named ext_<specFile>_<operationId>. Set OPENAPI_SPEC_PATHS (semicolon- or comma-separated) before starting the server to load specs.",
        });
      }

      // ── Cart optimization ──────────────────────────────────────────────
      case "optimize_cart": {
        const { userId, items } = OptimizeCartInput.parse(args);
        const results = [];
        for (const item of items) {
          const strategy = await decisionEngine.recommendPaymentStrategy({
            userId,
            amount: item.amount,
            merchant: item.merchant,
            category: item.category,
            currency: "USD",
          });
          results.push({
            merchant: item.merchant,
            amount: item.amount,
            category: item.category,
            recommendedCard: {
              cardId: strategy.bestCard.card.cardId,
              last4: strategy.bestCard.card.last4,
              issuer: strategy.bestCard.card.issuer,
              network: strategy.bestCard.card.network,
            },
            expectedRewards: strategy.bestCard.rewardValue,
            appliedOffers: strategy.bestCard.applicablePromotions.map((p) => p.promoId),
            estimatedSavings: strategy.estimatedSavings,
          });
        }
        const totalSavings = results.reduce((sum, r) => sum + r.estimatedSavings, 0);
        return ok({
          success: true,
          optimizedCart: results,
          totalEstimatedSavings: Math.round(totalSavings * 100) / 100,
        });
      }

      // ── Marketplace tools ──────────────────────────────────────────────
      case "list_agents": {
        const agents = marketplaceService.listAgents();
        return ok({ success: true, count: agents.length, agents });
      }

      case "get_agent": {
        const { agentId } = GetAgentInput.parse(args);
        const agent = marketplaceService.getAgent(agentId);
        if (!agent) return fail(`Agent ${agentId} not found`);
        return ok({ success: true, agent });
      }

      case "publish_agent": {
        const input = PublishAgentInput.parse(args);
        let pricing: import("../services/marketplace.service").PricingModel;
        if (input.pricingType === "free") {
          pricing = { type: "free" };
        } else if (input.pricingType === "one_time") {
          pricing = { type: "one_time", price: input.price ?? 0 };
        } else {
          pricing = { type: "subscription", price: input.price ?? 0, interval: input.priceInterval ?? "month" };
        }
        const published = marketplaceService.publishAgent({
          agentId: input.agentId,
          name: input.name,
          shortDescription: input.shortDescription,
          fullDescription: input.fullDescription,
          icon: input.icon,
          category: input.category,
          tags: input.tags,
          publisherId: input.publisherId,
          publisherName: input.publisherName,
          version: input.version,
          pricing,
          capabilities: input.capabilities,
        });
        return ok({ success: true, agent: published });
      }

      case "install_agent": {
        const { agentId, userId } = InstallAgentInput.parse(args);
        const installation = marketplaceService.installAgent(agentId, userId);
        if (!installation) return fail(`Agent ${agentId} not found or not published`);
        return ok({ success: true, installation });
      }

      case "review_agent": {
        const input = ReviewAgentInput.parse(args);
        const review = marketplaceService.addReview(input);
        if (!review) return fail(`Agent ${input.agentId} not found`);
        return ok({ success: true, review });
      }

      // ── RBAC management tools ──────────────────────────────────────────
      case "manage_users": {
        const { action, userId, displayName, email, roles } = ManageUsersInput.parse(args);
        switch (action) {
          case "list":
            return ok({ success: true, users: userStore.list() });
          case "create": {
            if (!userId || !displayName || !email || !roles?.length) {
              return fail("create requires userId, displayName, email, and roles");
            }
            const created = userStore.create({ userId, displayName, email, roles });
            return ok({ success: true, user: created });
          }
          case "update": {
            if (!userId) return fail("update requires userId");
            const updated = userStore.update(userId, {
              ...(displayName ? { displayName } : {}),
              ...(email ? { email } : {}),
              ...(roles ? { roles } : {}),
            });
            return ok({ success: true, user: updated });
          }
          case "deactivate": {
            if (!userId) return fail("deactivate requires userId");
            const deactivated = userStore.update(userId, { active: false });
            return ok({ success: true, user: deactivated });
          }
          default:
            return fail(`Unknown manage_users action: ${action}`);
        }
      }

      case "get_audit_log": {
        const filter = GetAuditLogInput.parse(args);
        const entries = entitlementService.queryAuditLog(filter);
        return ok({ success: true, count: entries.length, entries });
      }

      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof EntitlementError) {
      logger.warn("RBAC denied", { tool: name, userId: err.userId, permission: err.permission });
      return fail(err.message);
    }
    if (err instanceof z.ZodError) {
      logger.error("Validation error", { tool: name, issues: err.issues });
      return fail(`Validation error: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    if (config.rbacEnabled && userContext) {
      entitlementService.recordError(userContext.userId, `tool:${name}`, (err as Error).message);
    }
    logger.error("Tool execution error", { tool: name, error: (err as Error).message });
    return fail((err as Error).message);
  }
}
