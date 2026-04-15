import { config } from "./env";
import { getBankApiOverrides } from "./runtime-settings";

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
