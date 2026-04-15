import { z } from "zod";
import { cardService } from "../services/card.service";
import { rewardsService } from "../services/rewards.service";
import { promoService } from "../services/promo.service";
import { decisionEngine } from "../services/decision.engine";
import { logger } from "../utils/logger";

// ── JSON Schema definitions for MCP tool listing ────────────────────────────

export const toolDefinitions = [
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
];

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
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
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
            rewardValue: strategy.bestCard.rewardValue,
            discountValue: strategy.bestCard.discountValue,
            effectiveValue: strategy.bestCard.effectiveValue,
            rewards: strategy.bestCard.rewards,
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
            effectiveValue: alt.effectiveValue,
            rewardValue: alt.rewardValue,
            discountValue: alt.discountValue,
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

      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      logger.error("Validation error", { tool: name, issues: err.issues });
      return fail(`Validation error: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    logger.error("Tool execution error", { tool: name, error: (err as Error).message });
    return fail((err as Error).message);
  }
}
