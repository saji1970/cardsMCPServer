import type { ToolsetMetadata, SubscriptionTier } from "../types/toolset";

const store = new Map<string, ToolsetMetadata>();

// Seed default toolsets
const SEED_TOOLSETS: ToolsetMetadata[] = [
  /** Curated API toolsets (numeric ids for agent manifests and MCP headers). */
  {
    toolsetId: "1",
    name: "Toolset 1 — Discovery & comparison",
    description:
      "Read-only card intelligence: match and compare products, annual value, signup bonuses, eligibility, and purchase evaluation. Includes toolset listing.",
    tools: [
      "match_card_products",
      "compare_card_products",
      "estimate_annual_value",
      "get_signup_bonuses",
      "check_product_eligibility",
      "list_card_products",
      "get_card_product",
      "get_card_product_features",
      "evaluate_purchase_payment_options",
      "list_toolsets",
      "get_toolset",
    ],
    version: "1.0.0",
    requiredTier: "free",
  },
  {
    toolsetId: "2",
    name: "Toolset 2 — Catalog authoring",
    description:
      "Create and maintain issuer card products: reward rate tables, signup bonuses, eligibility, APR, fees, and benefits.",
    tools: [
      "create_card_product",
      "update_card_product",
      "get_card_product",
      "delete_card_product",
      "update_reward_rates",
      "update_signup_bonus",
      "update_eligibility",
      "update_apr_ranges",
      "update_fees",
      "update_benefits",
    ],
    version: "1.0.0",
    requiredTier: "pro",
  },
  {
    toolsetId: "card-discovery",
    name: "Card Discovery",
    description: "Search, compare, and evaluate card products based on spending profiles, signup bonuses, and eligibility criteria.",
    tools: [
      "match_card_products",
      "compare_card_products",
      "estimate_annual_value",
      "get_signup_bonuses",
      "check_product_eligibility",
    ],
    version: "1.0.0",
    requiredTier: "free",
  },
  {
    toolsetId: "card-catalog-management",
    name: "Card Catalog Management",
    description: "Create, update, and delete card products and their sub-resources (reward rates, signup bonus, eligibility, APR, fees, benefits).",
    tools: [
      "create_card_product",
      "update_card_product",
      "get_card_product",
      "delete_card_product",
      "update_reward_rates",
      "update_signup_bonus",
      "update_eligibility",
      "update_apr_ranges",
      "update_fees",
      "update_benefits",
    ],
    version: "1.0.0",
    requiredTier: "pro",
  },
];

for (const ts of SEED_TOOLSETS) {
  store.set(ts.toolsetId, ts);
}

export const toolsetRegistry = {
  get(toolsetId: string): ToolsetMetadata | undefined {
    return store.get(toolsetId);
  },

  list(): ToolsetMetadata[] {
    return [...store.values()];
  },

  listForTier(tier: SubscriptionTier): ToolsetMetadata[] {
    const tierRank: Record<SubscriptionTier, number> = { free: 0, basic: 1, pro: 2 };
    const rank = tierRank[tier];
    return [...store.values()].filter((ts) => tierRank[ts.requiredTier] <= rank);
  },

  getToolsForTier(tier: SubscriptionTier): Set<string> {
    const toolsets = this.listForTier(tier);
    const tools = new Set<string>();
    for (const ts of toolsets) {
      for (const t of ts.tools) tools.add(t);
    }
    return tools;
  },

  /**
   * Tools exposed to an MCP client: subscription tier, optionally narrowed to one toolset
   * (HTTP header `X-Toolset-Id`). Unknown toolset id falls back to the full tier union.
   */
  getAllowedToolsForTier(tier: SubscriptionTier, toolsetId?: string): Set<string> {
    const tierTools = this.getToolsForTier(tier);
    const id = toolsetId?.trim();
    if (!id) return tierTools;
    const ts = this.get(id);
    if (!ts) return tierTools;
    const want = new Set(ts.tools);
    return new Set([...want].filter((t) => tierTools.has(t)));
  },

  register(toolset: ToolsetMetadata): void {
    store.set(toolset.toolsetId, toolset);
  },
};
