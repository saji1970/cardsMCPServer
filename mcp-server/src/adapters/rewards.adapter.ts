import axios, { AxiosError } from "axios";
import { getEffectiveSimulationMode } from "../config/effective-config";
import { logger } from "../utils/logger";
import {
  RewardsBalance,
  RewardsCalculation,
  RedemptionRequest,
  RedemptionResponse,
} from "../types";
import { getRewardsHttpClient } from "./http-clients";
import { v4Hex } from "./util";
import { getCardProductById } from "../data/card-catalog";

// ── Category multipliers for mock calculation ───────────────────────────────

const CATEGORY_RATES: Record<string, number> = {
  dining: 3.0,
  travel: 3.0,
  groceries: 2.0,
  gas: 2.0,
  entertainment: 2.0,
  shopping: 1.5,
  utilities: 1.0,
  default: 1.0,
};

const TIER_BONUS: Record<string, number> = {
  standard: 0,
  gold: 0.5,
  platinum: 1.0,
  infinite: 1.5,
};

const MOCK_BALANCES: Record<string, RewardsBalance> = {
  "card-tok-001": {
    cardId: "card-tok-001",
    programName: "Ultimate Rewards",
    pointsBalance: 45200,
    cashValue: 452.0,
    tier: "platinum",
    expiringPoints: 5000,
    expiryDate: "2026-06-30",
  },
  "card-tok-002": {
    cardId: "card-tok-002",
    programName: "Membership Rewards",
    pointsBalance: 78500,
    cashValue: 785.0,
    tier: "gold",
    expiringPoints: 0,
  },
  "card-tok-003": {
    cardId: "card-tok-003",
    programName: "ThankYou Points",
    pointsBalance: 12300,
    cashValue: 123.0,
    tier: "standard",
    expiringPoints: 2000,
    expiryDate: "2026-05-15",
  },
  "card-tok-004": {
    cardId: "card-tok-004",
    programName: "Venture Rewards",
    pointsBalance: 120000,
    cashValue: 1200.0,
    tier: "infinite",
    expiringPoints: 0,
  },
};

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

export const rewardsAdapter = {
  async getBalance(cardId: string): Promise<RewardsBalance | null> {
    if (getEffectiveSimulationMode()) {
      return MOCK_BALANCES[cardId] ?? null;
    }
    try {
      const res = await withRetry(() =>
        getRewardsHttpClient().get<RewardsBalance>(`/balance/${cardId}`)
      );
      return res.data;
    } catch {
      return MOCK_BALANCES[cardId] ?? null;
    }
  },

  async calculateRewards(
    cardId: string,
    amount: number,
    category: string,
    cardTier: string,
    productId?: string
  ): Promise<RewardsCalculation> {
    const localCalc = (): RewardsCalculation => {
      let baseRate: number;
      if (productId) {
        const product = getCardProductById(productId);
        if (product?.rewardRates?.length) {
          const cat = category.toLowerCase();
          const match = product.rewardRates.find(
            (r) => r.category.toLowerCase() === cat
          );
          const fallback = product.rewardRates.find(
            (r) => r.category.toLowerCase() === "other" || r.category.toLowerCase() === "all"
          );
          baseRate = match?.multiplier ?? fallback?.multiplier ?? CATEGORY_RATES[cat] ?? CATEGORY_RATES["default"];
        } else {
          baseRate = CATEGORY_RATES[category.toLowerCase()] ?? CATEGORY_RATES["default"];
        }
      } else {
        baseRate = CATEGORY_RATES[category.toLowerCase()] ?? CATEGORY_RATES["default"];
      }
      const bonusRate = TIER_BONUS[cardTier.toLowerCase()] ?? 0;
      const totalRate = baseRate + bonusRate;
      const pointsEarned = Math.round(amount * totalRate * 100) / 100;
      const cashValueEarned = Math.round(pointsEarned * 0.01 * 100) / 100;
      return { cardId, amount, category, baseRate, bonusRate, totalRate, pointsEarned, cashValueEarned };
    };

    if (getEffectiveSimulationMode()) {
      return localCalc();
    }
    try {
      const res = await withRetry(() =>
        getRewardsHttpClient().post<RewardsCalculation>("/calculate", { cardId, amount, category })
      );
      return res.data;
    } catch (err) {
      logger.error("Rewards calculate API failed, using local calc", {
        error: (err as AxiosError).message,
      });
      return localCalc();
    }
  },

  async redeemRewards(req: RedemptionRequest): Promise<RedemptionResponse> {
    if (getEffectiveSimulationMode()) {
      const balance = MOCK_BALANCES[req.cardId];
      if (!balance || balance.pointsBalance < req.points) {
        return {
          redemptionId: "",
          cardId: req.cardId,
          pointsRedeemed: 0,
          cashValue: 0,
          redemptionType: req.redemptionType,
          status: "failed",
          timestamp: new Date().toISOString(),
        };
      }
      const cashValue = Math.round(req.points * 0.01 * 100) / 100;
      balance.pointsBalance -= req.points;
      balance.cashValue = Math.round(balance.pointsBalance * 0.01 * 100) / 100;
      return {
        redemptionId: `RDM${v4Hex(8)}`,
        cardId: req.cardId,
        pointsRedeemed: req.points,
        cashValue,
        redemptionType: req.redemptionType,
        status: "completed",
        timestamp: new Date().toISOString(),
      };
    }
    try {
      const res = await withRetry(() =>
        getRewardsHttpClient().post<RedemptionResponse>("/redeem", req)
      );
      return res.data;
    } catch (err) {
      logger.error("Redemption API failed", { error: (err as AxiosError).message });
      return {
        redemptionId: "",
        cardId: req.cardId,
        pointsRedeemed: 0,
        cashValue: 0,
        redemptionType: req.redemptionType,
        status: "failed",
        timestamp: new Date().toISOString(),
      };
    }
  },
};
