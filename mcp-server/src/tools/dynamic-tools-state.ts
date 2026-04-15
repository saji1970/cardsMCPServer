import type { DynamicToolBundle } from "../openapi/types";

let bundle: DynamicToolBundle | null = null;

export function setDynamicToolBundle(b: DynamicToolBundle | null): void {
  bundle = b;
}

export function getDynamicToolBundle(): DynamicToolBundle | null {
  return bundle;
}
