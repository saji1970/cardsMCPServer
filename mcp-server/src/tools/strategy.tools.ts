// Strategy tool definitions and handlers are registered via src/tools/registry.ts
// This file exists for structural consistency with the project layout.
//
// Tools provided:
//   - recommend_payment_strategy: Recommend optimal payment card
//   - simulate_transaction: Full transaction simulation

export { toolDefinitions, handleToolCall } from "./registry";
