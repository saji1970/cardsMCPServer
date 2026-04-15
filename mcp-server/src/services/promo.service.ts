import { promoAdapter } from "../adapters/promo.adapter";
import { cache } from "../utils/cache";
import { logger } from "../utils/logger";
import { Promotion } from "../types";

export const promoService = {
  async getApplicableOffers(
    cardIds: string[],
    category: string,
    merchant: string,
    amount: number
  ): Promise<Promotion[]> {
    const cacheKey = `promos:${cardIds.sort().join(",")}:${category}:${merchant}:${amount}`;
    const cached = cache.get<Promotion[]>(cacheKey);
    if (cached) return cached;

    logger.info("Fetching applicable promotions", { category, merchant, amount });
    const promos = await promoAdapter.getApplicableOffers(cardIds, category, merchant, amount);
    cache.set(cacheKey, promos);
    return promos;
  },

  async getActivePromotions(): Promise<Promotion[]> {
    const cacheKey = "promos:active";
    const cached = cache.get<Promotion[]>(cacheKey);
    if (cached) return cached;

    const promos = await promoAdapter.getActivePromotions();
    cache.set(cacheKey, promos);
    return promos;
  },
};
