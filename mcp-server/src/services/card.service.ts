import { cardAdapter } from "../adapters/card.adapter";
import { cache } from "../utils/cache";
import { logger } from "../utils/logger";
import { Card, AuthorizationRequest, AuthorizationResponse } from "../types";

export const cardService = {
  async getEligibleCards(userId: string): Promise<Card[]> {
    const cacheKey = `cards:eligible:${userId}`;
    const cached = cache.get<Card[]>(cacheKey);
    if (cached) return cached;

    logger.info("Fetching eligible cards", { userId });
    const cards = await cardAdapter.getEligibleCards(userId);
    cache.set(cacheKey, cards);
    return cards;
  },

  async getCardById(cardId: string): Promise<Card | null> {
    const cacheKey = `cards:detail:${cardId}`;
    const cached = cache.get<Card | null>(cacheKey);
    if (cached !== null) return cached;

    const card = await cardAdapter.getCardById(cardId);
    if (card) cache.set(cacheKey, card);
    return card;
  },

  async authorizePayment(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    logger.info("Authorizing payment", {
      cardId: request.cardId,
      amount: request.amount,
      merchantName: request.merchantName,
    });
    const result = await cardAdapter.authorizePayment(request);
    if (result.approved) {
      cache.invalidatePattern(`cards:.*`);
    }
    logger.info("Authorization result", {
      approved: result.approved,
      responseCode: result.responseCode,
      traceId: result.traceId,
    });
    return result;
  },
};
