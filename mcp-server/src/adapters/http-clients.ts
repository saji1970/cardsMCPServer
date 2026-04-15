import axios, { AxiosInstance } from "axios";
import {
  getEffectiveAuthToken,
  getEffectiveCardApiBaseUrl,
  getEffectivePromoApiBaseUrl,
  getEffectiveRewardsApiBaseUrl,
} from "../config/effective-config";

type Kind = "card" | "rewards" | "promo";

const store = new Map<Kind, { sig: string; client: AxiosInstance }>();

function baseUrlFor(kind: Kind): string {
  switch (kind) {
    case "card":
      return getEffectiveCardApiBaseUrl();
    case "rewards":
      return getEffectiveRewardsApiBaseUrl();
    case "promo":
      return getEffectivePromoApiBaseUrl();
  }
}

function getClient(kind: Kind): AxiosInstance {
  const baseURL = baseUrlFor(kind);
  const token = getEffectiveAuthToken();
  const sig = `${baseURL}|${token}`;
  const prev = store.get(kind);
  if (prev?.sig === sig) return prev.client;
  const client = axios.create({
    baseURL,
    timeout: 5000,
    headers: { Authorization: `Bearer ${token}` },
  });
  store.set(kind, { sig, client });
  return client;
}

export function getCardHttpClient(): AxiosInstance {
  return getClient("card");
}

export function getRewardsHttpClient(): AxiosInstance {
  return getClient("rewards");
}

export function getPromoHttpClient(): AxiosInstance {
  return getClient("promo");
}

export function clearHttpClientCache(): void {
  store.clear();
}
