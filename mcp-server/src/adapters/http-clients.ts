import axios, { AxiosInstance } from "axios";
import {
  getEffectiveAuthTokenForBank,
  getEffectiveCardApiBaseUrlForBank,
  getEffectivePromoApiBaseUrlForBank,
  getEffectiveRewardsApiBaseUrlForBank,
} from "../config/effective-config";

type Kind = "card" | "rewards" | "promo";

const store = new Map<string, { sig: string; client: AxiosInstance }>();

function baseUrlFor(kind: Kind, bankId?: string): string {
  switch (kind) {
    case "card":
      return getEffectiveCardApiBaseUrlForBank(bankId);
    case "rewards":
      return getEffectiveRewardsApiBaseUrlForBank(bankId);
    case "promo":
      return getEffectivePromoApiBaseUrlForBank(bankId);
  }
}

function getClient(kind: Kind, bankId?: string): AxiosInstance {
  const b = bankId?.trim() || "";
  const baseURL = baseUrlFor(kind, bankId);
  const token = getEffectiveAuthTokenForBank(bankId);
  const sig = `${kind}|${b}|${baseURL}|${token}`;
  const key = `${kind}|${b}`;
  const prev = store.get(key);
  if (prev?.sig === sig) return prev.client;
  const client = axios.create({
    baseURL,
    timeout: 5000,
    headers: { Authorization: `Bearer ${token}` },
  });
  store.set(key, { sig, client });
  return client;
}

/** Outbound card API—optionally for a registered bank (see /api/banks). */
export function getCardHttpClient(bankId?: string): AxiosInstance {
  return getClient("card", bankId);
}

export function getRewardsHttpClient(bankId?: string): AxiosInstance {
  return getClient("rewards", bankId);
}

export function getPromoHttpClient(bankId?: string): AxiosInstance {
  return getClient("promo", bankId);
}

export function clearHttpClientCache(): void {
  store.clear();
}
