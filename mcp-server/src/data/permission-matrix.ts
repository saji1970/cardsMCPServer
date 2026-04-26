import type { Role, Permission } from "../types/rbac";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  consumer: [
    "tool:get_eligible_cards",
    "tool:authorize_payment",
    "tool:calculate_rewards",
    "tool:redeem_rewards",
    "tool:get_applicable_offers",
    "tool:recommend_payment_strategy",
    "tool:simulate_transaction",
    "tool:list_card_products",
    "tool:get_card_product_features",
    "tool:evaluate_purchase_payment_options",
    "tool:optimize_cart",
    "tool:list_agents",
    "tool:get_agent",
    "tool:install_agent",
    "tool:review_agent",
    "resource:cards://user",
    "resource:rewards://balance",
    "resource:promotions://active",
    "resource:cards://products",
    "resource:agents://marketplace",
  ],

  publisher: [
    "tool:list_agents",
    "tool:get_agent",
    "tool:publish_agent",
    "tool:list_card_products",
    "tool:get_card_product_features",
    "resource:cards://products",
    "resource:agents://marketplace",
  ],

  consumer_publisher: [
    // Union of consumer + publisher
    "tool:get_eligible_cards",
    "tool:authorize_payment",
    "tool:calculate_rewards",
    "tool:redeem_rewards",
    "tool:get_applicable_offers",
    "tool:recommend_payment_strategy",
    "tool:simulate_transaction",
    "tool:list_card_products",
    "tool:get_card_product_features",
    "tool:evaluate_purchase_payment_options",
    "tool:optimize_cart",
    "tool:list_agents",
    "tool:get_agent",
    "tool:publish_agent",
    "tool:install_agent",
    "tool:review_agent",
    "resource:cards://user",
    "resource:rewards://balance",
    "resource:promotions://active",
    "resource:cards://products",
    "resource:agents://marketplace",
  ],

  admin: [
    "tool:get_eligible_cards",
    "tool:authorize_payment",
    "tool:calculate_rewards",
    "tool:redeem_rewards",
    "tool:get_applicable_offers",
    "tool:recommend_payment_strategy",
    "tool:simulate_transaction",
    "tool:list_card_products",
    "tool:get_card_product_features",
    "tool:evaluate_purchase_payment_options",
    "tool:optimize_cart",
    "tool:list_agents",
    "tool:get_agent",
    "tool:publish_agent",
    "tool:install_agent",
    "tool:review_agent",
    "tool:list_openapi_loaded_operations",
    "tool:ext_*",
    "tool:manage_users",
    "tool:get_audit_log",
    "resource:cards://user",
    "resource:rewards://balance",
    "resource:promotions://active",
    "resource:cards://products",
    "resource:agents://marketplace",
  ],

  operations: [
    "tool:list_card_products",
    "tool:get_card_product_features",
    "tool:list_agents",
    "tool:get_agent",
    "tool:list_openapi_loaded_operations",
    "tool:ext_*",
    "resource:cards://products",
    "resource:agents://marketplace",
  ],

  finance: [
    "tool:get_eligible_cards",
    "tool:calculate_rewards",
    "tool:simulate_transaction",
    "tool:list_card_products",
    "tool:get_card_product_features",
    "tool:get_audit_log",
    "resource:cards://user",
    "resource:rewards://balance",
    "resource:cards://products",
  ],

  support: [
    "tool:get_eligible_cards",
    "tool:calculate_rewards",
    "tool:simulate_transaction",
    "tool:list_card_products",
    "tool:get_card_product_features",
    "tool:list_agents",
    "tool:get_agent",
    "tool:get_audit_log",
    "resource:cards://user",
    "resource:rewards://balance",
    "resource:cards://products",
    "resource:agents://marketplace",
  ],
};

/**
 * Expand an array of roles into the union of all their permissions.
 */
export function expandPermissions(roles: Role[]): Set<Permission> {
  const perms = new Set<Permission>();
  for (const role of roles) {
    const list = ROLE_PERMISSIONS[role];
    if (list) {
      for (const p of list) perms.add(p);
    }
  }
  return perms;
}
