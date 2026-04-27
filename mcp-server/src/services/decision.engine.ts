import { cardService } from "./card.service";
import { rewardsService } from "./rewards.service";
import { promoService } from "./promo.service";
import { logger } from "../utils/logger";
import {
  StrategyInput,
  PaymentStrategy,
  CardRanking,
  Promotion,
  SimulationInput,
  SimulationResult,
  ScoringWeights,
  DEFAULT_SCORING_WEIGHTS,
  Card,
  RewardsCalculation,
} from "../types";

function computeDiscountValue(promos: Promotion[], amount: number): number {
  let totalDiscount = 0;
  for (const promo of promos) {
    let discount = 0;
    switch (promo.discountType) {
      case "percentage":
        discount = (promo.discountValue / 100) * amount;
        break;
      case "fixed":
        discount = promo.discountValue;
        break;
      case "cashback":
        discount = (promo.discountValue / 100) * amount;
        break;
      case "bonus_points":
        discount = promo.discountValue * amount * 0.01;
        break;
    }
    if (promo.maxDiscount) {
      discount = Math.min(discount, promo.maxDiscount);
    }
    totalDiscount += discount;
  }
  return Math.round(totalDiscount * 100) / 100;
}

const TIER_SCORE: Record<string, number> = {
  standard: 0,
  gold: 1,
  platinum: 2,
  infinite: 3,
};

function getPromosForCard(allPromos: Promotion[], card: Card): Promotion[] {
  return allPromos.filter(
    (p) => p.applicableCards.length === 0 || p.applicableCards.includes(card.cardId)
  );
}

export const decisionEngine = {
  async recommendPaymentStrategy(
    input: StrategyInput,
    weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
  ): Promise<PaymentStrategy> {
    logger.info("Computing payment strategy", {
      userId: input.userId,
      amount: input.amount,
      merchant: input.merchant,
      category: input.category,
    });

    const cards = await cardService.getEligibleCards(input.userId);
    if (cards.length === 0) {
      throw new Error("No eligible cards found for user");
    }

    const cardIds = cards.map((c) => c.cardId);
    const allPromos = await promoService.getApplicableOffers(
      cardIds,
      input.category,
      input.merchant,
      input.amount
    );

    const rankings: CardRanking[] = [];

    for (const card of cards) {
      if (card.availableCredit !== undefined && card.availableCredit < input.amount) {
        continue;
      }

      const rewards = await rewardsService.calculateRewards(
        card.cardId,
        input.amount,
        input.category,
        card.tier,
        card.productId
      );
      const applicablePromotions = getPromosForCard(allPromos, card);
      const rewardValue = rewards.cashValueEarned;
      const discountValue = computeDiscountValue(applicablePromotions, input.amount);
      const tierBonus = (TIER_SCORE[card.tier] ?? 0) * weights.tierBonus;

      const effectiveValue =
        rewardValue * weights.rewardValue +
        discountValue * weights.discountValue +
        tierBonus;

      rankings.push({
        card,
        rewards,
        applicablePromotions,
        rewardValue: Math.round(rewardValue * 100) / 100,
        discountValue,
        effectiveValue: Math.round(effectiveValue * 100) / 100,
        rank: 0,
      });
    }

    rankings.sort((a, b) => b.effectiveValue - a.effectiveValue);
    rankings.forEach((r, i) => (r.rank = i + 1));

    if (rankings.length === 0) {
      throw new Error("No cards with sufficient credit for the requested amount");
    }

    const best = rankings[0];
    const strategy: PaymentStrategy = {
      bestCard: best,
      alternatives: rankings.slice(1),
      estimatedSavings: Math.round((best.rewardValue + best.discountValue) * 100) / 100,
      summary: `Best card: ${best.card.issuer} ${best.card.network.toUpperCase()} (****${best.card.last4}). ` +
        `Estimated savings: $${(best.rewardValue + best.discountValue).toFixed(2)} ` +
        `(rewards: $${best.rewardValue.toFixed(2)}, promotions: $${best.discountValue.toFixed(2)}). ` +
        `${best.applicablePromotions.length} promotion(s) applied.`,
    };

    logger.info("Strategy computed", {
      bestCard: best.card.cardId,
      effectiveValue: best.effectiveValue,
      estimatedSavings: strategy.estimatedSavings,
    });

    return strategy;
  },

  async simulateTransaction(input: SimulationInput): Promise<SimulationResult> {
    logger.info("Simulating transaction", { ...input });

    let targetCardId = input.cardId;

    if (!targetCardId) {
      const strategy = await this.recommendPaymentStrategy({
        userId: input.userId,
        amount: input.amount,
        merchant: input.merchant,
        category: input.category,
        currency: input.currency,
      });
      targetCardId = strategy.bestCard.card.cardId;
    }

    const card = await cardService.getCardById(targetCardId);
    if (!card) throw new Error(`Card ${targetCardId} not found`);

    const [authorization, rewards] = await Promise.all([
      cardService.authorizePayment({
        cardId: targetCardId,
        amount: input.amount,
        currency: input.currency,
        merchantId: input.merchant.toLowerCase().replace(/\s+/g, "_"),
        merchantName: input.merchant,
        category: input.category,
      }),
      rewardsService.calculateRewards(targetCardId, input.amount, input.category, card.tier, card.productId),
    ]);

    const promos = await promoService.getApplicableOffers(
      [targetCardId],
      input.category,
      input.merchant,
      input.amount
    );

    const promoDiscount = computeDiscountValue(promos, input.amount);
    const rewardsCashback = rewards.cashValueEarned;
    const totalBenefitValue = Math.round((rewardsCashback + promoDiscount) * 100) / 100;
    const netEffectiveCost = Math.round((input.amount - totalBenefitValue) * 100) / 100;

    return {
      authorization,
      rewards,
      promotionsApplied: promos,
      netCost: netEffectiveCost,
      totalBenefitValue,
      breakdown: {
        grossAmount: input.amount,
        rewardsCashback,
        promoDiscount,
        netEffectiveCost,
      },
    };
  },
};
