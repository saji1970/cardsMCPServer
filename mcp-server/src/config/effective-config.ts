import { config } from "./env";
import { getBankApiOverrides } from "./runtime-settings";
import { bankRegistry } from "../data/bank-registry";

export function getEffectiveCardApiBaseUrl(): string {
  const o = getBankApiOverrides().cardApiBaseUrl?.trim();
  return o || config.cardApiBaseUrl;
}

export function getEffectiveRewardsApiBaseUrl(): string {
  const o = getBankApiOverrides().rewardsApiBaseUrl?.trim();
  return o || config.rewardsApiBaseUrl;
}

export function getEffectivePromoApiBaseUrl(): string {
  const o = getBankApiOverrides().promoApiBaseUrl?.trim();
  return o || config.promoApiBaseUrl;
}

export function getEffectiveAuthToken(): string {
  const o = getBankApiOverrides().authToken?.trim();
  return o || config.authToken;
}

export function getEffectiveSimulationMode(): boolean {
  const o = getBankApiOverrides().simulationMode;
  if (typeof o === "boolean") return o;
  return config.simulationMode;
}

/** When calling a specific bank’s HTTP APIs, use that bank’s URLs; otherwise global env + admin override. */
export function getEffectiveCardApiBaseUrlForBank(bankId?: string): string {
  if (bankId?.trim()) {
    const b = bankRegistry.get(bankId.trim());
    if (b?.active && b.cardApiBaseUrl?.trim()) return b.cardApiBaseUrl.trim();
  }
  return getEffectiveCardApiBaseUrl();
}

export function getEffectiveRewardsApiBaseUrlForBank(bankId?: string): string {
  if (bankId?.trim()) {
    const b = bankRegistry.get(bankId.trim());
    if (b?.active && b.rewardsApiBaseUrl?.trim()) return b.rewardsApiBaseUrl.trim();
  }
  return getEffectiveRewardsApiBaseUrl();
}

export function getEffectivePromoApiBaseUrlForBank(bankId?: string): string {
  if (bankId?.trim()) {
    const b = bankRegistry.get(bankId.trim());
    if (b?.active && b.promoApiBaseUrl?.trim()) return b.promoApiBaseUrl.trim();
  }
  return getEffectivePromoApiBaseUrl();
}

export function getEffectiveAuthTokenForBank(bankId?: string): string {
  if (bankId?.trim()) {
    const b = bankRegistry.get(bankId.trim());
    if (b?.active && b.authToken?.trim()) return b.authToken.trim();
  }
  return getEffectiveAuthToken();
}
