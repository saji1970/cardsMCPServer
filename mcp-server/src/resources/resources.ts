import { listCardProducts } from "../data/card-catalog";
import { cardService } from "../services/card.service";
import { rewardsService } from "../services/rewards.service";
import { promoService } from "../services/promo.service";
import { marketplaceService } from "../services/marketplace.service";
import { entitlementService, EntitlementError } from "../services/entitlement.service";
import { config } from "../config/env";
import type { UserContext } from "../types/rbac";
import { logger } from "../utils/logger";

export const resourceDefinitions = [
  {
    uri: "cards://user",
    name: "User Cards",
    description: "All active payment cards for the current user (tokenized, no raw PANs)",
    mimeType: "application/json",
  },
  {
    uri: "rewards://balance",
    name: "Rewards Balance",
    description: "Rewards point balances across all user cards",
    mimeType: "application/json",
  },
  {
    uri: "promotions://active",
    name: "Active Promotions",
    description: "All currently active promotions and offers",
    mimeType: "application/json",
  },
  {
    uri: "cards://products",
    name: "Card product catalog",
    description:
      "Issuer card products with marketing summaries, feature lists, and strong spend categories for comparing payment options",
    mimeType: "application/json",
  },
  {
    uri: "agents://marketplace",
    name: "Agent Marketplace",
    description:
      "Available AI agents with capabilities, descriptions, and pricing for card rewards optimization",
    mimeType: "application/json",
  },
];

type ResourceResult = {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
};

export async function handleResourceRead(uri: string, userContext?: UserContext): Promise<ResourceResult> {
  // ── RBAC gate ──────────────────────────────────────────────────────────
  if (config.rbacEnabled && userContext) {
    const permission = `resource:${uri}`;
    try {
      entitlementService.assertPermission(userContext, permission);
      entitlementService.recordAccess(userContext.userId, permission);
    } catch (err) {
      if (err instanceof EntitlementError) {
        entitlementService.recordDenied(userContext.userId, permission);
        throw err;
      }
      throw err;
    }
  }

  switch (uri) {
    case "cards://user": {
      logger.info("Resource: cards://user");
      const cards = await cardService.getEligibleCards("default-user");
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              cards.map((c) => ({
                cardId: c.cardId,
                last4: c.last4,
                network: c.network,
                issuer: c.issuer,
                tier: c.tier,
                type: c.type,
                availableCredit: c.availableCredit,
                rewardsProgram: c.rewardsProgram,
              })),
              null,
              2
            ),
          },
        ],
      };
    }

    case "rewards://balance": {
      logger.info("Resource: rewards://balance");
      const cards = await cardService.getEligibleCards("default-user");
      const balances = await Promise.all(
        cards.map((c) => rewardsService.getBalance(c.cardId))
      );
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              balances.filter(Boolean).map((b) => ({
                cardId: b!.cardId,
                programName: b!.programName,
                pointsBalance: b!.pointsBalance,
                cashValue: b!.cashValue,
                expiringPoints: b!.expiringPoints,
                expiryDate: b!.expiryDate,
              })),
              null,
              2
            ),
          },
        ],
      };
    }

    case "promotions://active": {
      logger.info("Resource: promotions://active");
      const promos = await promoService.getActivePromotions();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(promos, null, 2),
          },
        ],
      };
    }

    case "cards://products": {
      logger.info("Resource: cards://products");
      const products = listCardProducts();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(products, null, 2),
          },
        ],
      };
    }

    case "agents://marketplace": {
      logger.info("Resource: agents://marketplace");
      const agents = marketplaceService.listAgents();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(agents, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
