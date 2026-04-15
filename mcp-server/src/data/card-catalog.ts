import type { Card, CardFeature, CardProduct } from "../types";

/** Static catalog: card products, features, and category strengths for agent discovery. */
export const CARD_PRODUCTS: CardProduct[] = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

export function getCardProductById(productId: string): CardProduct | undefined {
  return CARD_PRODUCTS.find((p) => p.productId === productId);
}

export function listCardProducts(filter?: { issuer?: string }): CardProduct[] {
  if (!filter?.issuer?.trim()) return [...CARD_PRODUCTS];
  const q = filter.issuer.toLowerCase();
  return CARD_PRODUCTS.filter((p) => p.issuer.toLowerCase().includes(q));
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
