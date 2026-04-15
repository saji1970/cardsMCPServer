// Card tool definitions and handlers are registered via src/tools/registry.ts
// This file exists for structural consistency with the project layout.
//
// Tools provided (see registry.ts): cards, rewards, promos, strategy, simulation,
// plus catalog and checkout-oriented tools (list_card_products, get_card_product_features,
// evaluate_purchase_payment_options).

export { toolDefinitions, handleToolCall } from "./registry";
