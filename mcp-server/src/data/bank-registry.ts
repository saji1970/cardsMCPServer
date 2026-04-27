/**
 * Each connected bank/issuer can register its own outbound API base URLs and auth.
 * The single global default (env + /api/admin/config) is used when no bankId is in context.
 */
export type BankConnection = {
  bankId: string;
  displayName: string;
  cardApiBaseUrl?: string;
  rewardsApiBaseUrl?: string;
  promoApiBaseUrl?: string;
  /** Optional bearer for calls to that bank’s APIs. */
  authToken?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const store = new Map<string, BankConnection>();

function now(): string {
  return new Date().toISOString();
}

export const bankRegistry = {
  get(bankId: string): BankConnection | undefined {
    return store.get(bankId);
  },

  list(): BankConnection[] {
    return [...store.values()];
  },

  /** Public / agent dropdown: no token values. */
  listPublic(): Array<{
    bankId: string;
    displayName: string;
    hasCardUrl: boolean;
    hasRewardsUrl: boolean;
    hasPromoUrl: boolean;
    hasAuth: boolean;
    active: boolean;
  }> {
    return this.list()
      .filter((b) => b.active)
      .map((b) => ({
        bankId: b.bankId,
        displayName: b.displayName,
        hasCardUrl: !!b.cardApiBaseUrl?.trim(),
        hasRewardsUrl: !!b.rewardsApiBaseUrl?.trim(),
        hasPromoUrl: !!b.promoApiBaseUrl?.trim(),
        hasAuth: !!b.authToken?.trim(),
        active: b.active,
      }));
  },

  create(input: {
    bankId: string;
    displayName: string;
    cardApiBaseUrl?: string;
    rewardsApiBaseUrl?: string;
    promoApiBaseUrl?: string;
    authToken?: string;
  }): BankConnection {
    const id = input.bankId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (id.length < 2) throw new Error("bankId must be at least 2 characters (letters, numbers, hyphens)");
    if (store.has(id)) throw new Error(`Bank ${id} already exists`);
    const row: BankConnection = {
      bankId: id,
      displayName: input.displayName.trim() || id,
      cardApiBaseUrl: input.cardApiBaseUrl?.trim() || undefined,
      rewardsApiBaseUrl: input.rewardsApiBaseUrl?.trim() || undefined,
      promoApiBaseUrl: input.promoApiBaseUrl?.trim() || undefined,
      authToken: input.authToken?.trim() || undefined,
      active: true,
      createdAt: now(),
      updatedAt: now(),
    };
    store.set(id, row);
    return row;
  },

  update(
    bankId: string,
    partial: {
      displayName?: string;
      cardApiBaseUrl?: string;
      rewardsApiBaseUrl?: string;
      promoApiBaseUrl?: string;
      authToken?: string;
      active?: boolean;
    },
  ): BankConnection {
    const existing = store.get(bankId);
    if (!existing) throw new Error(`Bank ${bankId} not found`);
    const next: BankConnection = {
      ...existing,
      displayName: partial.displayName !== undefined ? partial.displayName.trim() : existing.displayName,
      cardApiBaseUrl:
        partial.cardApiBaseUrl !== undefined
          ? partial.cardApiBaseUrl.trim() || undefined
          : existing.cardApiBaseUrl,
      rewardsApiBaseUrl:
        partial.rewardsApiBaseUrl !== undefined
          ? partial.rewardsApiBaseUrl.trim() || undefined
          : existing.rewardsApiBaseUrl,
      promoApiBaseUrl:
        partial.promoApiBaseUrl !== undefined
          ? partial.promoApiBaseUrl.trim() || undefined
          : existing.promoApiBaseUrl,
      authToken: partial.authToken !== undefined ? partial.authToken.trim() || undefined : existing.authToken,
      active: partial.active !== undefined ? partial.active : existing.active,
      updatedAt: now(),
    };
    store.set(bankId, next);
    return next;
  },

  delete(bankId: string): boolean {
    return store.delete(bankId);
  },
};
