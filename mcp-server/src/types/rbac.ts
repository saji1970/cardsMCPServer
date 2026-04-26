import { z } from "zod";

// ── Roles ────────────────────────────────────────────────────────────────────

export const RoleSchema = z.enum([
  "consumer",
  "publisher",
  "consumer_publisher",
  "admin",
  "operations",
  "finance",
  "support",
]);

export type Role = z.infer<typeof RoleSchema>;

// ── Permissions ──────────────────────────────────────────────────────────────

export const PermissionSchema = z.enum([
  // Card tools
  "tool:get_eligible_cards",
  "tool:authorize_payment",
  // Rewards tools
  "tool:calculate_rewards",
  "tool:redeem_rewards",
  // Promo tools
  "tool:get_applicable_offers",
  // Strategy tools
  "tool:recommend_payment_strategy",
  "tool:simulate_transaction",
  // Catalog tools
  "tool:list_card_products",
  "tool:get_card_product_features",
  "tool:evaluate_purchase_payment_options",
  // Cart tools
  "tool:optimize_cart",
  // Marketplace tools
  "tool:list_agents",
  "tool:get_agent",
  "tool:publish_agent",
  "tool:install_agent",
  "tool:review_agent",
  // OpenAPI tools
  "tool:list_openapi_loaded_operations",
  "tool:ext_*",
  // Admin tools
  "tool:manage_users",
  "tool:get_audit_log",
  // Resources
  "resource:cards://user",
  "resource:rewards://balance",
  "resource:promotions://active",
  "resource:cards://products",
  "resource:agents://marketplace",
]);

export type Permission = z.infer<typeof PermissionSchema>;

// ── User ─────────────────────────────────────────────────────────────────────

export interface User {
  userId: string;
  displayName: string;
  email: string;
  roles: Role[];
  active: boolean;
  createdAt: string;
  lastActiveAt: string;
}

// ── UserContext ───────────────────────────────────────────────────────────────

export interface UserContext {
  userId: string;
  roles: Role[];
  permissions: Set<Permission>;
}

// ── AuditEntry ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  result: "allowed" | "denied" | "error";
  meta?: Record<string, unknown>;
}
