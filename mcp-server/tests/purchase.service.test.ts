import { featuresRelevantToPurchase, purchaseService } from "../src/services/purchase.service";

process.env.SIMULATION_MODE = "true";

describe("Purchase service", () => {
  it("lists card products", () => {
    const all = purchaseService.listProducts();
    expect(all.length).toBeGreaterThanOrEqual(4);
    const chase = purchaseService.listProducts({ issuer: "Chase" });
    expect(chase.every((p) => p.issuer.toLowerCase().includes("chase"))).toBe(true);
  });

  it("returns product detail by id", () => {
    const p = purchaseService.getProductDetail("prod-amex-gold");
    expect(p?.displayName).toContain("Gold");
    expect(p?.features.length).toBeGreaterThan(0);
  });

  it("surfaces category-matching features", () => {
    const dining = featuresRelevantToPurchase(
      [
        {
          featureId: "x",
          name: "Dining multiplier",
          category: "rewards",
          summary: "More points on dining",
          purchaseRelevanceTags: ["dining"],
        },
        {
          featureId: "y",
          name: "Travel lounge",
          category: "travel",
          summary: "Lounges",
          purchaseRelevanceTags: ["travel"],
        },
      ],
      "dining"
    );
    expect(dining.some((f) => f.featureId === "x")).toBe(true);
  });

  it("evaluatePurchasePayment returns ranked options and agent summary", async () => {
    const out = await purchaseService.evaluatePurchasePayment({
      userId: "test-user",
      amount: 120,
      merchant: "Best Buy",
      category: "electronics",
      currency: "USD",
      purchaseNotes: "laptop",
    });
    expect(out.recommended.cardId).toBeTruthy();
    expect(out.recommended.checkoutSuggestion).toContain("****");
    expect(out.agentSummary).toContain(out.recommended.last4);
    expect(out.alternatives.length).toBeGreaterThanOrEqual(0);
  });
});
