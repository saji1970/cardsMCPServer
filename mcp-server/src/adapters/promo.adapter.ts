import axios, { AxiosError } from "axios";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { Promotion } from "../types";

const client = axios.create({
  baseURL: config.promoApiBaseUrl,
  timeout: 5000,
  headers: { Authorization: `Bearer ${config.authToken}` },
});

// ── Mock promotions ─────────────────────────────────────────────────────────

const MOCK_PROMOTIONS: Promotion[] = [
  {
    promoId: "PROMO-001",
    title: "Dining 10% Cashback",
    description: "Get 10% cashback on all dining transactions over $25",
    discountType: "cashback",
    discountValue: 10,
    minSpend: 25,
    maxDiscount: 50,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    applicableCategories: ["dining"],
    applicableMerchants: [],
    applicableCards: ["card-tok-001", "card-tok-002", "card-tok-004"],
    stackable: true,
  },
  {
    promoId: "PROMO-002",
    title: "Travel 5X Points",
    description: "Earn 5X bonus points on travel purchases",
    discountType: "bonus_points",
    discountValue: 5,
    minSpend: 50,
    maxDiscount: undefined,
    validFrom: "2026-03-01",
    validTo: "2026-09-30",
    applicableCategories: ["travel"],
    applicableMerchants: [],
    applicableCards: ["card-tok-001", "card-tok-004"],
    stackable: true,
  },
  {
    promoId: "PROMO-003",
    title: "Amazon $15 Off",
    description: "Get $15 off on purchases over $100 at Amazon",
    discountType: "fixed",
    discountValue: 15,
    minSpend: 100,
    maxDiscount: 15,
    validFrom: "2026-04-01",
    validTo: "2026-06-30",
    applicableCategories: ["shopping"],
    applicableMerchants: ["amazon"],
    applicableCards: ["card-tok-002", "card-tok-003"],
    stackable: false,
  },
  {
    promoId: "PROMO-004",
    title: "Grocery 5% Off",
    description: "5% discount on grocery purchases",
    discountType: "percentage",
    discountValue: 5,
    minSpend: 0,
    maxDiscount: 30,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    applicableCategories: ["groceries"],
    applicableMerchants: [],
    applicableCards: ["card-tok-001", "card-tok-002", "card-tok-003", "card-tok-004"],
    stackable: true,
  },
];

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function isPromotionActive(promo: Promotion): boolean {
  const now = new Date();
  return new Date(promo.validFrom) <= now && now <= new Date(promo.validTo);
}

export const promoAdapter = {
  async getApplicableOffers(
    cardIds: string[],
    category: string,
    merchant: string,
    amount: number
  ): Promise<Promotion[]> {
    if (config.simulationMode) {
      logger.info("Simulation mode: returning mock promotions", { category, merchant });
      return MOCK_PROMOTIONS.filter((p) => {
        if (!isPromotionActive(p)) return false;
        if (p.minSpend && amount < p.minSpend) return false;
        const cardMatch = p.applicableCards.length === 0 || p.applicableCards.some((c) => cardIds.includes(c));
        const catMatch = p.applicableCategories.length === 0 || p.applicableCategories.includes(category.toLowerCase());
        const merchantMatch =
          p.applicableMerchants.length === 0 ||
          p.applicableMerchants.some((m) => merchant.toLowerCase().includes(m.toLowerCase()));
        return cardMatch && (catMatch || merchantMatch);
      });
    }
    try {
      const res = await withRetry(() =>
        client.post<Promotion[]>("/applicable", { cardIds, category, merchant, amount })
      );
      return res.data;
    } catch (err) {
      logger.error("Promo API unreachable, falling back to mock", {
        error: (err as AxiosError).message,
      });
      return MOCK_PROMOTIONS.filter((p) => {
        if (!isPromotionActive(p)) return false;
        if (p.minSpend && amount < p.minSpend) return false;
        const cardMatch = p.applicableCards.length === 0 || p.applicableCards.some((c) => cardIds.includes(c));
        const catMatch = p.applicableCategories.length === 0 || p.applicableCategories.includes(category.toLowerCase());
        const merchantMatch =
          p.applicableMerchants.length === 0 ||
          p.applicableMerchants.some((m) => merchant.toLowerCase().includes(m.toLowerCase()));
        return cardMatch && (catMatch || merchantMatch);
      });
    }
  },

  async getActivePromotions(): Promise<Promotion[]> {
    if (config.simulationMode) {
      return MOCK_PROMOTIONS.filter(isPromotionActive);
    }
    try {
      const res = await withRetry(() => client.get<Promotion[]>("/active"));
      return res.data;
    } catch {
      return MOCK_PROMOTIONS.filter(isPromotionActive);
    }
  },
};
