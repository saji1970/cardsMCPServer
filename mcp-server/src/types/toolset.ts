import { z } from "zod";

export const SubscriptionTierSchema = z.enum(["free", "basic", "pro"]);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

export interface ToolsetMetadata {
  toolsetId: string;
  name: string;
  description: string;
  tools: string[];
  version: string;
  requiredTier: SubscriptionTier;
}
