import type { Card, CardFeature, CardProduct } from "../types";
import { bankRegistry } from "./bank-registry";

/** Seed data: card products loaded at startup. */
const SEED_PRODUCTS: CardProduct[] = [
  {
    bankId: "_platform",
    productId: "prod-chase-sapphire-reserve",
    displayName: "Chase Sapphire Reserve",
    issuer: "Chase",
    network: "visa",
    tier: "platinum",
    annualFeeUsd: 550,
    marketingSummary:
      "Premium travel and dining card with strong earn in those categories and purchase protections useful for higher-ticket retail.",
    strongCategories: ["dining", "travel", "shopping", "electronics"],
    features: [
      {
        featureId: "csr-dining-travel-earn",
        name: "Elevated dining and travel earn",
        category: "rewards",
        summary: "Higher earn rates on dining and travel than base cards; good default for restaurants and flights.",
        purchaseRelevanceTags: ["dining", "travel"],
      },
      {
        featureId: "csr-purchase-protection",
        name: "Purchase protection",
        category: "protection",
        summary: "May cover theft or damage for eligible new purchases for a limited period.",
        purchaseRelevanceTags: ["electronics", "shopping", "general"],
      },
      {
        featureId: "csr-extended-warranty",
        name: "Extended warranty",
        category: "protection",
        summary: "Can extend eligible manufacturer warranty on covered purchases—relevant for appliances and electronics.",
        purchaseRelevanceTags: ["electronics", "shopping", "general"],
      },
      {
        featureId: "csr-trip-delay",
        name: "Trip delay coverage",
        category: "travel",
        summary: "Travel-oriented benefit when flights are delayed; less relevant at generic retail checkout.",
        purchaseRelevanceTags: ["travel"],
      },
    ],
    rewardRates: [
      { category: "dining", multiplier: 3, description: "3x points on dining worldwide" },
      { category: "travel", multiplier: 3, description: "3x points on travel" },
      { category: "other", multiplier: 1, description: "1x points on all other purchases" },
    ],
    signupBonus: {
      bonusAmount: 60000,
      bonusType: "Ultimate Rewards points",
      minimumSpend: 4000,
      timeWindowDays: 90,
      estimatedCashValue: 900,
      description: "Earn 60,000 bonus points after spending $4,000 in the first 3 months",
    },
    eligibility: {
      creditScoreMin: 720,
      creditScoreRange: "excellent",
      incomeRecommended: 50000,
      additionalNotes: "Not available if you received a Sapphire bonus in the last 48 months",
    },
    aprRanges: {
      purchaseAprMin: 22.49,
      purchaseAprMax: 29.49,
      cashAdvanceApr: 29.49,
      penaltyApr: 29.99,
    },
    fees: {
      annualFeeUsd: 550,
      foreignTransactionFeePercent: 0,
      balanceTransferFeePercent: 5,
      cashAdvanceFeePercent: 5,
      latePaymentFeeUsd: 40,
    },
    benefits: [
      { benefitId: "csr-travel-credit", name: "$300 Annual Travel Credit", estimatedAnnualValue: 300, description: "Automatic $300 statement credit for travel purchases annually" },
      { benefitId: "csr-lounge", name: "Priority Pass Lounge Access", estimatedAnnualValue: 100, description: "Complimentary Priority Pass Select membership for airport lounge access" },
      { benefitId: "csr-doordash", name: "DoorDash DashPass", estimatedAnnualValue: 60, description: "Complimentary DashPass subscription and annual DoorDash credits" },
      { benefitId: "csr-lyft", name: "Lyft Pink", estimatedAnnualValue: 50, description: "Complimentary Lyft Pink membership with ride discounts" },
    ],
  },
  {
    bankId: "_platform",
    productId: "prod-amex-gold",
    displayName: "American Express Gold Card",
    issuer: "American Express",
    network: "amex",
    tier: "gold",
    annualFeeUsd: 325,
    marketingSummary:
      "Dining and U.S. supermarket-focused rewards with credits and offers that often stack at major merchants.",
    strongCategories: ["dining", "groceries", "shopping"],
    features: [
      {
        featureId: "amex-gold-dining-grocery",
        name: "Dining and U.S. supermarket multipliers",
        category: "rewards",
        summary: "Strong earn on restaurants and U.S. supermarkets—useful for food-related baskets and many daily spend scenarios.",
        purchaseRelevanceTags: ["dining", "groceries"],
      },
      {
        featureId: "amex-gold-dining-credit",
        name: "Dining and delivery credits",
        category: "lifestyle",
        summary: "Statement credits at enrolled partners when eligible; can reduce net cost of qualifying dining orders.",
        purchaseRelevanceTags: ["dining"],
      },
      {
        featureId: "amex-offers-ecosystem",
        name: "Amex Offers",
        category: "shopping",
        summary: "Targeted statement credits or extra points at specific merchants—pair with basket-level promos when available.",
        purchaseRelevanceTags: ["shopping", "general"],
      },
    ],
    rewardRates: [
      { category: "dining", multiplier: 4, description: "4x points at restaurants worldwide" },
      { category: "groceries", multiplier: 4, description: "4x points at U.S. supermarkets (up to $25K/yr)" },
      { category: "other", multiplier: 1, description: "1x points on all other purchases" },
    ],
    signupBonus: {
      bonusAmount: 60000,
      bonusType: "Membership Rewards points",
      minimumSpend: 6000,
      timeWindowDays: 180,
      estimatedCashValue: 600,
      description: "Earn 60,000 bonus points after spending $6,000 in the first 6 months",
    },
    eligibility: {
      creditScoreMin: 700,
      creditScoreRange: "good_to_excellent",
      additionalNotes: "Subject to Amex welcome bonus eligibility rules (once per lifetime per product)",
    },
    aprRanges: {
      purchaseAprMin: 21.49,
      purchaseAprMax: 29.49,
      penaltyApr: 29.99,
    },
    fees: {
      annualFeeUsd: 325,
      foreignTransactionFeePercent: 0,
      latePaymentFeeUsd: 40,
    },
    benefits: [
      { benefitId: "amex-gold-dining-credit", name: "$120 Dining Credit", estimatedAnnualValue: 120, description: "$10/month credit at select dining partners (Grubhub, Seamless, etc.)" },
      { benefitId: "amex-gold-uber-credit", name: "$120 Uber Cash", estimatedAnnualValue: 120, description: "$10/month in Uber Cash for Uber Eats or rides" },
      { benefitId: "amex-gold-dunkin-credit", name: "$84 Dunkin Credit", estimatedAnnualValue: 84, description: "$7/month Dunkin statement credit" },
    ],
  },
  {
    bankId: "_platform",
    productId: "prod-citi-double-cash",
    displayName: "Citi Double Cash Card",
    issuer: "Citi",
    network: "mastercard",
    tier: "standard",
    annualFeeUsd: 0,
    marketingSummary:
      "Simple flat earn on purchases plus pay-on-time bonus structure; predictable when category bonuses do not apply.",
    strongCategories: ["shopping", "groceries", "general"],
    features: [
      {
        featureId: "citi-flat-earn",
        name: "Broad flat earn",
        category: "rewards",
        summary: "Consistent earn on most purchases without rotating categories—good fallback when no specialty card wins.",
        purchaseRelevanceTags: ["general", "shopping", "groceries"],
      },
      {
        featureId: "citi-price-rewind-legacy-note",
        name: "Mastercard protections",
        category: "protection",
        summary: "Network-level protections may apply to eligible purchases; check guide to benefits for current terms.",
        purchaseRelevanceTags: ["electronics", "shopping", "general"],
      },
    ],
    rewardRates: [
      { category: "all", multiplier: 2, description: "2% cash back on all purchases (1% at purchase + 1% when paid)" },
    ],
    eligibility: {
      creditScoreMin: 670,
      creditScoreRange: "good",
      additionalNotes: "No previous Citi Double Cash bonus in the last 24 months",
    },
    aprRanges: {
      purchaseAprMin: 19.49,
      purchaseAprMax: 29.49,
      balanceTransferApr: 29.49,
      cashAdvanceApr: 29.99,
      penaltyApr: 29.99,
    },
    fees: {
      annualFeeUsd: 0,
      foreignTransactionFeePercent: 3,
      balanceTransferFeePercent: 3,
      cashAdvanceFeePercent: 5,
      latePaymentFeeUsd: 40,
    },
    benefits: [],
  },
  {
    bankId: "_platform",
    productId: "prod-capital-venture-x",
    displayName: "Capital One Venture X",
    issuer: "Capital One",
    network: "visa",
    tier: "infinite",
    annualFeeUsd: 395,
    marketingSummary:
      "Premium travel card with flat travel-style earn and portal booking options; strong for travel-heavy baskets.",
    strongCategories: ["travel", "shopping", "electronics"],
    features: [
      {
        featureId: "vx-travel-portal-earn",
        name: "Travel portal earn",
        category: "rewards",
        summary: "Extra earn when booking eligible travel through issuer portal; aligns with vacation and flight spend.",
        purchaseRelevanceTags: ["travel"],
      },
      {
        featureId: "vx-flat-miles",
        name: "Flat miles on everyday spend",
        category: "rewards",
        summary: "Predictable miles on purchases outside bonus categories—simple choice at checkout when unsure.",
        purchaseRelevanceTags: ["general", "shopping"],
      },
      {
        featureId: "vx-cell-phone-protection",
        name: "Cell phone protection",
        category: "protection",
        summary: "May cover a damaged or stolen phone when monthly bill is paid with the card—relevant to telecom checkout flows.",
        purchaseRelevanceTags: ["electronics", "general"],
      },
    ],
    rewardRates: [
      { category: "travel", multiplier: 5, description: "5x miles on flights booked through Capital One Travel" },
      { category: "hotels", multiplier: 10, description: "10x miles on hotels booked through Capital One Travel" },
      { category: "other", multiplier: 2, description: "2x miles on all other purchases" },
    ],
    signupBonus: {
      bonusAmount: 75000,
      bonusType: "Venture miles",
      minimumSpend: 4000,
      timeWindowDays: 90,
      estimatedCashValue: 750,
      description: "Earn 75,000 bonus miles after spending $4,000 in the first 3 months",
    },
    eligibility: {
      creditScoreMin: 740,
      creditScoreRange: "excellent",
      incomeRecommended: 60000,
    },
    aprRanges: {
      purchaseAprMin: 21.49,
      purchaseAprMax: 28.49,
      cashAdvanceApr: 29.99,
      penaltyApr: 29.99,
    },
    fees: {
      annualFeeUsd: 395,
      foreignTransactionFeePercent: 0,
      cashAdvanceFeePercent: 5,
      latePaymentFeeUsd: 40,
    },
    benefits: [
      { benefitId: "vx-travel-credit", name: "$300 Annual Travel Credit", estimatedAnnualValue: 300, description: "Annual $300 credit for bookings through Capital One Travel" },
      { benefitId: "vx-lounge", name: "Capital One Lounge Access", estimatedAnnualValue: 100, description: "Access to Capital One Lounges and Priority Pass Select" },
      { benefitId: "vx-anniversary-bonus", name: "10,000 Anniversary Miles", estimatedAnnualValue: 100, description: "10,000 bonus miles every account anniversary" },
    ],
  },
];

// ── Mutable in-memory store ───────────────────────────────────────────────────

const catalog = new Map<string, CardProduct>();

for (const p of SEED_PRODUCTS) {
  catalog.set(p.productId, p);
}

/** Kept for backward compat — any code referencing CARD_PRODUCTS gets the live array. */
export const CARD_PRODUCTS = SEED_PRODUCTS;

export function getCardProductById(productId: string): CardProduct | undefined {
  return catalog.get(productId);
}

function normalizeBankId(p: CardProduct): string {
  return p.bankId?.trim() || "_platform";
}

export function listCardProducts(filter?: { issuer?: string; bankId?: string }): CardProduct[] {
  const all = [...catalog.values()];
  let rows = all;
  if (filter?.bankId?.trim()) {
    const bid = filter.bankId.trim();
    rows = rows.filter((p) => normalizeBankId(p) === bid);
  }
  if (filter?.issuer?.trim()) {
    const q = filter.issuer.toLowerCase();
    rows = rows.filter((p) => p.issuer.toLowerCase().includes(q));
  }
  return rows;
}

export function createCardProduct(product: CardProduct): CardProduct {
  if (catalog.has(product.productId)) {
    throw new Error(`Product ${product.productId} already exists`);
  }
  if (product.bankId?.trim()) {
    const b = product.bankId.trim();
    if (b !== "_platform" && !bankRegistry.get(b)) {
      throw new Error(`Unknown bankId "${b}". Add the bank in /api/banks first.`);
    }
  }
  catalog.set(product.productId, product);
  return product;
}

export function updateCardProduct(productId: string, updates: Partial<CardProduct>): CardProduct {
  const existing = catalog.get(productId);
  if (!existing) throw new Error(`Product ${productId} not found`);
  if (updates.bankId?.trim()) {
    const b = updates.bankId.trim();
    if (b !== "_platform" && !bankRegistry.get(b)) {
      throw new Error(`Unknown bankId "${b}". Add the bank in /api/banks first.`);
    }
  }
  const updated = { ...existing, ...updates, productId }; // productId is immutable
  catalog.set(productId, updated);
  return updated;
}

export function deleteCardProduct(productId: string): boolean {
  return catalog.delete(productId);
}

/** Merge catalog copy onto a card instance for MCP responses. */
export function attachProductToCard(card: Card): Card {
  const product = card.productId ? getCardProductById(card.productId) : undefined;
  if (!product) return card;
  return {
    ...card,
    productName: product.displayName,
    features: product.features,
  };
}
