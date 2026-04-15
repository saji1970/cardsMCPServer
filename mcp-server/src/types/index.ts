import { z } from "zod";

// ── Card Types ──────────────────────────────────────────────────────────────

export const CardSchema = z.object({
  cardId: z.string(),
  tokenizedId: z.string(),
  last4: z.string().length(4),
  network: z.enum(["visa", "mastercard", "amex", "discover"]),
  type: z.enum(["credit", "debit", "prepaid"]),
  issuer: z.string(),
  tier: z.enum(["standard", "gold", "platinum", "infinite"]),
  status: z.enum(["active", "inactive", "blocked"]),
  creditLimit: z.number().optional(),
  availableCredit: z.number().optional(),
  rewardsProgram: z.string().optional(),
});

export type Card = z.infer<typeof CardSchema>;

export const AuthorizationRequestSchema = z.object({
  cardId: z.string(),
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  merchantId: z.string(),
  merchantName: z.string(),
  category: z.string(),
});

export type AuthorizationRequest = z.infer<typeof AuthorizationRequestSchema>;

export const AuthorizationResponseSchema = z.object({
  authCode: z.string(),
  responseCode: z.string(),
  approved: z.boolean(),
  cardId: z.string(),
  amount: z.number(),
  currency: z.string(),
  timestamp: z.string(),
  traceId: z.string(),
});

export type AuthorizationResponse = z.infer<typeof AuthorizationResponseSchema>;

// ── Rewards Types ───────────────────────────────────────────────────────────

export const RewardsBalanceSchema = z.object({
  cardId: z.string(),
  programName: z.string(),
  pointsBalance: z.number(),
  cashValue: z.number(),
  tier: z.string(),
  expiringPoints: z.number(),
  expiryDate: z.string().optional(),
});

export type RewardsBalance = z.infer<typeof RewardsBalanceSchema>;

export const RewardsCalculationSchema = z.object({
  cardId: z.string(),
  amount: z.number(),
  category: z.string(),
  baseRate: z.number(),
  bonusRate: z.number(),
  totalRate: z.number(),
  pointsEarned: z.number(),
  cashValueEarned: z.number(),
});

export type RewardsCalculation = z.infer<typeof RewardsCalculationSchema>;

export const RedemptionRequestSchema = z.object({
  cardId: z.string(),
  points: z.number().positive(),
  redemptionType: z.enum(["cash_back", "statement_credit", "gift_card", "travel"]),
});

export type RedemptionRequest = z.infer<typeof RedemptionRequestSchema>;

export const RedemptionResponseSchema = z.object({
  redemptionId: z.string(),
  cardId: z.string(),
  pointsRedeemed: z.number(),
  cashValue: z.number(),
  redemptionType: z.string(),
  status: z.enum(["completed", "pending", "failed"]),
  timestamp: z.string(),
});

export type RedemptionResponse = z.infer<typeof RedemptionResponseSchema>;

// ── Promotion Types ─────────────────────────────────────────────────────────

export const PromotionSchema = z.object({
  promoId: z.string(),
  title: z.string(),
  description: z.string(),
  discountType: z.enum(["percentage", "fixed", "cashback", "bonus_points"]),
  discountValue: z.number(),
  minSpend: z.number().optional(),
  maxDiscount: z.number().optional(),
  validFrom: z.string(),
  validTo: z.string(),
  applicableCategories: z.array(z.string()),
  applicableMerchants: z.array(z.string()),
  applicableCards: z.array(z.string()),
  stackable: z.boolean(),
});

export type Promotion = z.infer<typeof PromotionSchema>;

// ── Strategy Types ──────────────────────────────────────────────────────────

export const StrategyInputSchema = z.object({
  userId: z.string(),
  amount: z.number().positive(),
  merchant: z.string(),
  category: z.string(),
  currency: z.string().default("USD"),
});

export type StrategyInput = z.infer<typeof StrategyInputSchema>;

export interface CardRanking {
  card: Card;
  rewards: RewardsCalculation;
  applicablePromotions: Promotion[];
  rewardValue: number;
  discountValue: number;
  effectiveValue: number;
  rank: number;
}

export interface PaymentStrategy {
  bestCard: CardRanking;
  alternatives: CardRanking[];
  estimatedSavings: number;
  summary: string;
}

// ── Simulation Types ────────────────────────────────────────────────────────

export const SimulationInputSchema = z.object({
  userId: z.string(),
  amount: z.number().positive(),
  merchant: z.string(),
  category: z.string(),
  cardId: z.string().optional(),
  currency: z.string().default("USD"),
});

export type SimulationInput = z.infer<typeof SimulationInputSchema>;

export interface SimulationResult {
  authorization: AuthorizationResponse;
  rewards: RewardsCalculation;
  promotionsApplied: Promotion[];
  netCost: number;
  totalBenefitValue: number;
  breakdown: {
    grossAmount: number;
    rewardsCashback: number;
    promoDiscount: number;
    netEffectiveCost: number;
  };
}

// ── Scoring Weights ─────────────────────────────────────────────────────────

export interface ScoringWeights {
  rewardValue: number;
  discountValue: number;
  tierBonus: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  rewardValue: 1.0,
  discountValue: 1.2,
  tierBonus: 0.5,
};

// ── Cache entry ─────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
