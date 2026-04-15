import { promoService } from "../src/services/promo.service";

process.env.SIMULATION_MODE = "true";

describe("Promo Service", () => {
  describe("getApplicableOffers", () => {
    it("should return dining promotions for eligible cards", async () => {
      const promos = await promoService.getApplicableOffers(
        ["card-tok-001", "card-tok-002"],
        "dining",
        "Restaurant XYZ",
        50
      );

      expect(promos.length).toBeGreaterThan(0);
      // PROMO-001 is a dining cashback promo for card-tok-001 and card-tok-002
      const diningPromo = promos.find((p) => p.promoId === "PROMO-001");
      expect(diningPromo).toBeDefined();
      expect(diningPromo!.discountType).toBe("cashback");
    });

    it("should filter out promos where min spend is not met", async () => {
      const promos = await promoService.getApplicableOffers(
        ["card-tok-002"],
        "shopping",
        "Amazon",
        50 // Below PROMO-003's $100 min spend
      );

      const amazonPromo = promos.find((p) => p.promoId === "PROMO-003");
      expect(amazonPromo).toBeUndefined();
    });

    it("should return Amazon promo when min spend is met", async () => {
      const promos = await promoService.getApplicableOffers(
        ["card-tok-002"],
        "shopping",
        "Amazon",
        150
      );

      const amazonPromo = promos.find((p) => p.promoId === "PROMO-003");
      expect(amazonPromo).toBeDefined();
      expect(amazonPromo!.discountValue).toBe(15);
    });

    it("should not return promos for ineligible cards", async () => {
      const promos = await promoService.getApplicableOffers(
        ["card-tok-003"],
        "travel",
        "Airlines",
        200
      );

      // PROMO-002 (travel 5X) only applies to card-tok-001 and card-tok-004
      const travelPromo = promos.find((p) => p.promoId === "PROMO-002");
      expect(travelPromo).toBeUndefined();
    });
  });

  describe("getActivePromotions", () => {
    it("should return all currently active promotions", async () => {
      const promos = await promoService.getActivePromotions();
      expect(promos.length).toBeGreaterThan(0);

      // All returned promos should be currently active
      const now = new Date();
      for (const promo of promos) {
        expect(new Date(promo.validFrom).getTime()).toBeLessThanOrEqual(now.getTime());
        expect(new Date(promo.validTo).getTime()).toBeGreaterThanOrEqual(now.getTime());
      }
    });
  });
});
