import { rewardsAdapter } from "../adapters/rewards.adapter";
import { cache } from "../utils/cache";
import { logger } from "../utils/logger";
import {
  RewardsBalance,
  RewardsCalculation,
  RedemptionRequest,
  RedemptionResponse,
} from "../types";

export const rewardsService = {
  async getBalance(cardId: string): Promise<RewardsBalance | null> {
    const cacheKey = `rewards:balance:${cardId}`;
    const cached = cache.get<RewardsBalance>(cacheKey);
    if (cached) return cached;

    logger.info("Fetching rewards balance", { cardId });
    const balance = await rewardsAdapter.getBalance(cardId);
    if (balance) cache.set(cacheKey, balance);
    return balance;
  },

  async calculateRewards(
    cardId: string,
    amount: number,
    category: string,
    cardTier: string,
    productId?: string
  ): Promise<RewardsCalculation> {
    logger.info("Calculating rewards", { cardId, amount, category, productId });
    return rewardsAdapter.calculateRewards(cardId, amount, category, cardTier, productId);
  },

  async redeemRewards(request: RedemptionRequest): Promise<RedemptionResponse> {
    logger.info("Redeeming rewards", {
      cardId: request.cardId,
      points: request.points,
      type: request.redemptionType,
    });
    const result = await rewardsAdapter.redeemRewards(request);
    if (result.status === "completed") {
      cache.invalidate(`rewards:balance:${request.cardId}`);
    }
    return result;
  },
};
