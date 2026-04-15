import { decisionEngine } from "../src/services/decision.engine";

// Force simulation mode for tests
process.env.SIMULATION_MODE = "true";

describe("Decision Engine", () => {
  describe("recommendPaymentStrategy", () => {
    it("should return a ranked list of cards with the best card first", async () => {
      const strategy = await decisionEngine.recommendPaymentStrategy({
        userId: "test-user",
        amount: 150,
        merchant: "Olive Garden",
        category: "dining",
        currency: "USD",
      });

      expect(strategy.bestCard).toBeDefined();
      expect(strategy.bestCard.rank).toBe(1);
      expect(strategy.bestCard.effectiveValue).toBeGreaterThan(0);
      expect(strategy.estimatedSavings).toBeGreaterThan(0);
      expect(strategy.summary).toBeTruthy();

      // All alternatives should have lower or equal effective value
      for (const alt of strategy.alternatives) {
        expect(alt.effectiveValue).toBeLessThanOrEqual(strategy.bestCard.effectiveValue);
      }
    });

    it("should rank higher-tier cards with better rewards higher for dining", async () => {
      const strategy = await decisionEngine.recommendPaymentStrategy({
        userId: "test-user",
        amount: 200,
        merchant: "Steakhouse",
        category: "dining",
        currency: "USD",
      });

      // The infinite or platinum card should rank higher due to tier bonus + dining multiplier
      const bestTier = strategy.bestCard.card.tier;
      expect(["platinum", "infinite"]).toContain(bestTier);
    });

    it("should apply promotions and increase effective value", async () => {
      const strategy = await decisionEngine.recommendPaymentStrategy({
        userId: "test-user",
        amount: 100,
        merchant: "Restaurant",
        category: "dining",
        currency: "USD",
      });

      // At least one card should have promotions applied (PROMO-001 targets dining)
      const cardsWithPromos = [strategy.bestCard, ...strategy.alternatives].filter(
        (r) => r.applicablePromotions.length > 0
      );
      expect(cardsWithPromos.length).toBeGreaterThan(0);

      // Cards with promos should have a discount value > 0
      for (const card of cardsWithPromos) {
        expect(card.discountValue).toBeGreaterThan(0);
      }
    });

    it("should exclude cards with insufficient credit", async () => {
      // Amount of $20,000 exceeds card-tok-002 ($12.3k), card-tok-003 ($7.2k),
      // card-tok-001 ($18.5k) but not card-tok-004 ($42k)
      const strategy = await decisionEngine.recommendPaymentStrategy({
        userId: "test-user",
        amount: 20000,
        merchant: "Luxury Store",
        category: "shopping",
        currency: "USD",
      });

      const allCards = [strategy.bestCard, ...strategy.alternatives];
      // Every returned card must have sufficient credit
      for (const ranking of allCards) {
        if (ranking.card.availableCredit !== undefined) {
          expect(ranking.card.availableCredit).toBeGreaterThanOrEqual(20000);
        }
      }
      // Some cards should have been filtered out (those with < $20k credit)
      expect(allCards.length).toBeLessThan(4);
    });

    it("should throw when no cards have sufficient credit", async () => {
      await expect(
        decisionEngine.recommendPaymentStrategy({
          userId: "test-user",
          amount: 999999,
          merchant: "Impossible Purchase",
          category: "shopping",
          currency: "USD",
        })
      ).rejects.toThrow("No cards with sufficient credit");
    });
  });
});
