/**
 * In-memory admin overrides (HTTP control plane). Does not persist across process restarts.
 * Used for demo: bank API base URLs, auth token, simulation mode, uploaded OpenAPI paths.
 */

export type BankApiOverrides = {
  cardApiBaseUrl?: string;
  rewardsApiBaseUrl?: string;
  promoApiBaseUrl?: string;
  authToken?: string;
  simulationMode?: boolean;
};

let bankOverrides: BankApiOverrides = {};
let uploadedOpenApiPaths: string[] = [];

export function getBankApiOverrides(): BankApiOverrides {
  return { ...bankOverrides };
}

export function setBankApiOverrides(partial: BankApiOverrides): void {
  bankOverrides = { ...bankOverrides, ...partial };
  for (const k of Object.keys(bankOverrides) as (keyof BankApiOverrides)[]) {
    const v = bankOverrides[k];
    if (v === "" || v === undefined) delete bankOverrides[k];
  }
}

export function clearBankApiOverrides(): void {
  bankOverrides = {};
}

export function getUploadedOpenApiPaths(): string[] {
  return [...uploadedOpenApiPaths];
}

export function addUploadedOpenApiPath(absPath: string): void {
  if (!uploadedOpenApiPaths.includes(absPath)) uploadedOpenApiPaths.push(absPath);
}

export function clearUploadedOpenApiPaths(): void {
  uploadedOpenApiPaths = [];
}
