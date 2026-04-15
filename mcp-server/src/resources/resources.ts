import { cardService } from "../services/card.service";
import { rewardsService } from "../services/rewards.service";
import { promoService } from "../services/promo.service";
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
];

type ResourceResult = {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
};

export async function handleResourceRead(uri: string): Promise<ResourceResult> {
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

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
