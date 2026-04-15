import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  cardApiBaseUrl: process.env.CARD_API_BASE_URL || "http://localhost:4001/api/cards",
  rewardsApiBaseUrl: process.env.REWARDS_API_BASE_URL || "http://localhost:4002/api/rewards",
  promoApiBaseUrl: process.env.PROMO_API_BASE_URL || "http://localhost:4003/api/promotions",
  authToken: process.env.AUTH_TOKEN || "dev-token-changeme",
  logLevel: process.env.LOG_LEVEL || "info",
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || "300", 10),
  simulationMode: process.env.SIMULATION_MODE === "true",
} as const;
