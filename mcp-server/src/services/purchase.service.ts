import { getCardProductById, listCardProducts } from "../data/card-catalog";
import { decisionEngine } from "./decision.engine";
import { logger } from "../utils/logger";
import type { CardFeature, CardProduct, Promotion, RewardsCalculation } from "../types";

export function featuresRelevantToPurchase(
  features: CardFeature[] | undefined,
  category: string,
  purchaseNotes?: string
): CardFeature[] {
  if (!features?.length) return [];
  const cat = category.toLowerCase().trim();
  const notes = (purchaseNotes ?? "").toLowerCase();
  const matches = features.filter((f) => {
    const tags = f.purchaseRelevanceTags.map((t) => t.toLowerCase());
    if (tags.includes("general")) return true;
    if (tags.includes(cat)) return true;
    if (tags.some((t) => t.length >= 3 && notes.includes(t))) return true;
    return false;
  });
  return matches.length > 0 ? matches : features.slice(0, 4);
}

export interface PurchasePaymentOption {
  rank: number;
  cardId: string;
  last4: string;
  network: string;
  issuer: string;
  tier: string;
  productId?: string;
  productName?: string;
  availableCredit?: number;
  effectiveValue: number;
  rewardValue: number;
  discountValue: number;
  rewards: RewardsCalculation;
  applicableOffers: Promotion[];
  relevantFeatures: CardFeature[];
  strongCategories: string[];
  checkoutSuggestion: string;
}

export const purchaseService = {
  listProducts(filter?: { issuer?: string }): CardProduct[] {
    return listCardProducts(filter);
  },

  getProductDetail(productId: string): CardProduct | null {
    return getCardProductById(productId) ?? null;
  },

  async evaluatePurchasePayment(input: {
    userId: string;
    amount: number;
    merchant: string;
    category: string;
    currency: string;
    purchaseNotes?: string;
  }): Promise<{
    purchaseContext: {
      amount: number;
      currency: string;
      merchant: string;
      category: string;
      purchaseNotes: string | null;
    };
    recommended: PurchasePaymentOption;
    alternatives: PurchasePaymentOption[];
    agentSummary: string;
    rankingNotes: string;
  }> {
    logger.info("evaluatePurchasePayment", { ...input });
    const strategy = await decisionEngine.recommendPaymentStrategy({
      userId: input.userId,
      amount: input.amount,
      merchant: input.merchant,
      category: input.category,
      currency: input.currency,
    });

    const toOption = (
      r: {
        card: {
          cardId: string;
          last4: string;
          network: string;
          issuer: string;
          tier: string;
          productId?: string;
          productName?: string;
          availableCredit?: number;
          features?: CardFeature[];
        };
        rewards: RewardsCalculation;
        applicablePromotions: Promotion[];
        rewardValue: number;
        discountValue: number;
        effectiveValue: number;
      },
      rank: number
    ): PurchasePaymentOption => {
      const rel = featuresRelevantToPurchase(
        r.card.features,
        input.category,
        input.purchaseNotes
      );
      const product = r.card.productId ? getCardProductById(r.card.productId) : undefined;
      const checkoutSuggestion =
        `Prefer ****${r.card.last4} (${r.card.productName ?? r.card.issuer}) at checkout: ` +
        `about $${r.rewardValue.toFixed(2)} in rewards value and $${r.discountValue.toFixed(2)} from offers on this basket. ` +
        (rel.length
          ? `Relevant features: ${rel.map((f) => f.name).join("; ")}.`
          : "See full product features via list_card_products if benefits matter for this item.");

      return {
        rank,
        cardId: r.card.cardId,
        last4: r.card.last4,
        network: r.card.network,
        issuer: r.card.issuer,
        tier: r.card.tier,
        productId: r.card.productId,
        productName: r.card.productName,
        availableCredit: r.card.availableCredit,
        effectiveValue: r.effectiveValue,
        rewardValue: r.rewardValue,
        discountValue: r.discountValue,
        rewards: r.rewards,
        applicableOffers: r.applicablePromotions,
        relevantFeatures: rel,
        strongCategories: product?.strongCategories ?? [],
        checkoutSuggestion,
      };
    };

    const recommended = toOption(strategy.bestCard, 1);
    const alternatives = strategy.alternatives.map((r, i) => toOption(r, i + 2));

    const topOffer = strategy.bestCard.applicablePromotions[0];
    const agentSummary =
      `Recommended payment: ${recommended.productName ?? recommended.issuer} ending ${recommended.last4}. ` +
      `Estimated benefits on this purchase: $${(recommended.rewardValue + recommended.discountValue).toFixed(2)} ` +
      `(rewards $${recommended.rewardValue.toFixed(2)}, offers $${recommended.discountValue.toFixed(2)}). ` +
      (topOffer ? `Notable offer: ${topOffer.title}. ` : "") +
      `Use cardId "${recommended.cardId}" when selecting a payment method at checkout.`;

    return {
      purchaseContext: {
        amount: input.amount,
        currency: input.currency,
        merchant: input.merchant,
        category: input.category,
        purchaseNotes: input.purchaseNotes ?? null,
      },
      recommended,
      alternatives,
      agentSummary,
      rankingNotes: strategy.summary,
    };
  },
};
