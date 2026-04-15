// Rewards tool definitions and handlers are registered via src/tools/registry.ts
// This file exists for structural consistency with the project layout.
//
// Tools provided:
//   - calculate_rewards: Calculate potential rewards for a transaction
//   - redeem_rewards: Redeem accumulated rewards points

export { toolDefinitions, handleToolCall } from "./registry";
