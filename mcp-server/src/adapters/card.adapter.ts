import axios, { AxiosError } from "axios";
import { attachProductToCard } from "../data/card-catalog";
import { getEffectiveSimulationMode } from "../config/effective-config";
import { logger } from "../utils/logger";
import { Card, AuthorizationRequest, AuthorizationResponse } from "../types";
import { getCardHttpClient } from "./http-clients";
import { v4Hex } from "./util";

// ── Mock data (used in simulation mode or when API is unreachable) ──────────

const MOCK_CARDS: Card[] = [
  {
    cardId: "card-tok-001",
    tokenizedId: "tok_visa_plat_8821",
    last4: "8821",
    network: "visa",
    type: "credit",
    issuer: "Chase",
    tier: "platinum",
    status: "active",
    creditLimit: 25000,
    availableCredit: 18500,
    rewardsProgram: "Ultimate Rewards",
    productId: "prod-chase-sapphire-reserve",
  },
  {
    cardId: "card-tok-002",
    tokenizedId: "tok_amex_gold_4455",
    last4: "4455",
    network: "amex",
    type: "credit",
    issuer: "American Express",
    tier: "gold",
    status: "active",
    creditLimit: 15000,
    availableCredit: 12300,
    rewardsProgram: "Membership Rewards",
    productId: "prod-amex-gold",
  },
  {
    cardId: "card-tok-003",
    tokenizedId: "tok_mc_std_9012",
    last4: "9012",
    network: "mastercard",
    type: "credit",
    issuer: "Citi",
    tier: "standard",
    status: "active",
    creditLimit: 10000,
    availableCredit: 7200,
    rewardsProgram: "ThankYou Points",
    productId: "prod-citi-double-cash",
  },
  {
    cardId: "card-tok-004",
    tokenizedId: "tok_visa_inf_3367",
    last4: "3367",
    network: "visa",
    type: "credit",
    issuer: "Capital One",
    tier: "infinite",
    status: "active",
    creditLimit: 50000,
    availableCredit: 42000,
    rewardsProgram: "Venture Rewards",
    productId: "prod-capital-venture-x",
  },
];

function enrich(card: Card): Card {
  return attachProductToCard(card);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        logger.warn(`Retry attempt ${attempt + 1}`, { error: (err as Error).message });
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export const cardAdapter = {
  async getEligibleCards(userId: string): Promise<Card[]> {
    if (getEffectiveSimulationMode()) {
      logger.info("Simulation mode: returning mock cards", { userId });
      return MOCK_CARDS.filter((c) => c.status === "active").map(enrich);
    }
    try {
      const res = await withRetry(() =>
        getCardHttpClient().get<Card[]>(`/users/${userId}/eligible`)
      );
      return res.data.map(enrich);
    } catch (err) {
      logger.error("Card API unreachable, falling back to mock", {
        error: (err as AxiosError).message,
      });
      return MOCK_CARDS.filter((c) => c.status === "active").map(enrich);
    }
  },

  async getCardById(cardId: string): Promise<Card | null> {
    if (getEffectiveSimulationMode()) {
      const c = MOCK_CARDS.find((x) => x.cardId === cardId);
      return c ? enrich(c) : null;
    }
    try {
      const res = await withRetry(() => getCardHttpClient().get<Card>(`/${cardId}`));
      return enrich(res.data);
    } catch {
      const c = MOCK_CARDS.find((x) => x.cardId === cardId);
      return c ? enrich(c) : null;
    }
  },

  async authorizePayment(req: AuthorizationRequest): Promise<AuthorizationResponse> {
    if (getEffectiveSimulationMode()) {
      logger.info("Simulation mode: mock authorization", { cardId: req.cardId, amount: req.amount });
      const card = MOCK_CARDS.find((c) => c.cardId === req.cardId);
      const approved = card
        ? card.status === "active" && (card.availableCredit ?? Infinity) >= req.amount
        : false;
      return {
        authCode: approved ? `AUTH${v4Hex(6)}` : "",
        responseCode: approved ? "00" : "51",
        approved,
        cardId: req.cardId,
        amount: req.amount,
        currency: req.currency,
        timestamp: new Date().toISOString(),
        traceId: `TRC${v4Hex(12)}`,
      };
    }
    try {
      const res = await withRetry(() =>
        getCardHttpClient().post<AuthorizationResponse>("/authorize", req)
      );
      return res.data;
    } catch (err) {
      logger.error("Authorization API failed", { error: (err as AxiosError).message });
      return {
        authCode: "",
        responseCode: "96",
        approved: false,
        cardId: req.cardId,
        amount: req.amount,
        currency: req.currency,
        timestamp: new Date().toISOString(),
        traceId: `TRC${v4Hex(12)}`,
      };
    }
  },
};
