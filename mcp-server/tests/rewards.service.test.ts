import { rewardsService } from "../src/services/rewards.service";

process.env.SIMULATION_MODE = "true";

describe("Rewards Service", () => {
  describe("calculateRewards", () => {
    it("should calculate higher rewards for dining category on a platinum card", async () => {
      const result = await rewardsService.calculateRewards(
        "card-tok-001",
        100,
        "dining",
        "platinum"
      );

      // Dining base rate = 3.0, platinum bonus = 1.0, total = 4.0
      expect(result.baseRate).toBe(3.0);
      expect(result.bonusRate).toBe(1.0);
      expect(result.totalRate).toBe(4.0);
      expect(result.pointsEarned).toBe(400);
      expect(result.cashValueEarned).toBe(4.0);
    });

    it("should calculate base rewards for default category on standard card", async () => {
      const result = await rewardsService.calculateRewards(
        "card-tok-003",
        50,
        "utilities",
        "standard"
      );

      // Utilities base rate = 1.0, standard bonus = 0, total = 1.0
      expect(result.baseRate).toBe(1.0);
      expect(result.bonusRate).toBe(0);
      expect(result.totalRate).toBe(1.0);
      expect(result.pointsEarned).toBe(50);
      expect(result.cashValueEarned).toBe(0.5);
    });

    it("should apply tier bonus for infinite cards", async () => {
      const result = await rewardsService.calculateRewards(
        "card-tok-004",
        200,
        "travel",
        "infinite"
      );

      // Travel base rate = 3.0, infinite bonus = 1.5, total = 4.5
      expect(result.baseRate).toBe(3.0);
      expect(result.bonusRate).toBe(1.5);
      expect(result.totalRate).toBe(4.5);
      expect(result.pointsEarned).toBe(900);
      expect(result.cashValueEarned).toBe(9.0);
    });

    it("should handle unknown category with default rate", async () => {
      const result = await rewardsService.calculateRewards(
        "card-tok-001",
        75,
        "unknown_category",
        "gold"
      );

      // Default rate = 1.0, gold bonus = 0.5
      expect(result.baseRate).toBe(1.0);
      expect(result.bonusRate).toBe(0.5);
      expect(result.totalRate).toBe(1.5);
    });
  });

  describe("getBalance", () => {
    it("should return balance for known card", async () => {
      const balance = await rewardsService.getBalance("card-tok-001");
      expect(balance).not.toBeNull();
      expect(balance!.programName).toBe("Ultimate Rewards");
      expect(balance!.pointsBalance).toBeGreaterThan(0);
    });

    it("should return null for unknown card", async () => {
      const balance = await rewardsService.getBalance("card-tok-999");
      expect(balance).toBeNull();
    });
  });

  describe("redeemRewards", () => {
    it("should fail if points exceed balance", async () => {
      const result = await rewardsService.redeemRewards({
        cardId: "card-tok-003",
        points: 999999,
        redemptionType: "cash_back",
      });
      expect(result.status).toBe("failed");
      expect(result.pointsRedeemed).toBe(0);
    });
  });
});
