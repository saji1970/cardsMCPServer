import { listCardProducts, getCardProductById } from "../data/card-catalog";
import type { CardProduct } from "../types";
import { logger } from "../utils/logger";

export interface SpendingProfile {
  monthlyDining?: number;
  monthlyTravel?: number;
  monthlyGroceries?: number;
  monthlyGas?: number;
  monthlyShopping?: number;
  monthlyOther?: number;
}

export interface ProductMatch {
  productId: string;
  displayName: string;
  issuer: string;
  network: string;
  tier: string;
  annualFeeUsd: number;
  estimatedAnnualRewards: number;
  signupBonusValue: number;
  benefitsValue: number;
  netAnnualValue: number;
  breakdown: {
    rewardsByCategory: Array<{ category: string; annualSpend: number; multiplier: number; annualRewards: number }>;
    totalAnnualRewards: number;
    totalBenefitsValue: number;
    annualFee: number;
    signupBonusCashValue: number;
    netFirstYearValue: number;
    netOngoingAnnualValue: number;
  };
}

export interface ProductComparison {
  products: Array<ProductMatch & {
    rewardRates: CardProduct["rewardRates"];
    signupBonus: CardProduct["signupBonus"];
    fees: CardProduct["fees"];
    benefits: CardProduct["benefits"];
    eligibility: CardProduct["eligibility"];
  }>;
  recommendation: string;
}

function getMultiplierForCategory(product: CardProduct, category: string): number {
  if (!product.rewardRates?.length) return 1;
  const cat = category.toLowerCase();
  const match = product.rewardRates.find((r) => r.category.toLowerCase() === cat);
  if (match) return match.multiplier;
  const fallback = product.rewardRates.find(
    (r) => r.category.toLowerCase() === "other" || r.category.toLowerCase() === "all"
  );
  return fallback?.multiplier ?? 1;
}

function estimateAnnualRewards(product: CardProduct, profile: SpendingProfile): {
  rewardsByCategory: Array<{ category: string; annualSpend: number; multiplier: number; annualRewards: number }>;
  totalAnnualRewards: number;
} {
  const categories: Array<{ category: string; monthly: number }> = [
    { category: "dining", monthly: profile.monthlyDining ?? 0 },
    { category: "travel", monthly: profile.monthlyTravel ?? 0 },
    { category: "groceries", monthly: profile.monthlyGroceries ?? 0 },
    { category: "gas", monthly: profile.monthlyGas ?? 0 },
    { category: "shopping", monthly: profile.monthlyShopping ?? 0 },
    { category: "other", monthly: profile.monthlyOther ?? 0 },
  ];

  const rewardsByCategory = categories
    .filter((c) => c.monthly > 0)
    .map((c) => {
      const multiplier = getMultiplierForCategory(product, c.category);
      const annualSpend = c.monthly * 12;
      // Points value: multiplier * spend * $0.01 per point
      const annualRewards = Math.round(annualSpend * multiplier * 0.01 * 100) / 100;
      return { category: c.category, annualSpend, multiplier, annualRewards };
    });

  const totalAnnualRewards = Math.round(
    rewardsByCategory.reduce((sum, r) => sum + r.annualRewards, 0) * 100
  ) / 100;

  return { rewardsByCategory, totalAnnualRewards };
}

function computeMatch(product: CardProduct, profile: SpendingProfile, includeSignupBonus: boolean): ProductMatch {
  const { rewardsByCategory, totalAnnualRewards } = estimateAnnualRewards(product, profile);
  const annualFee = product.fees?.annualFeeUsd ?? product.annualFeeUsd ?? 0;
  const signupBonusCashValue = includeSignupBonus ? (product.signupBonus?.estimatedCashValue ?? 0) : 0;
  const totalBenefitsValue = (product.benefits ?? []).reduce(
    (sum, b) => sum + (b.estimatedAnnualValue ?? 0),
    0
  );
  const netFirstYearValue = Math.round((totalAnnualRewards + signupBonusCashValue + totalBenefitsValue - annualFee) * 100) / 100;
  const netOngoingAnnualValue = Math.round((totalAnnualRewards + totalBenefitsValue - annualFee) * 100) / 100;

  return {
    productId: product.productId,
    displayName: product.displayName,
    issuer: product.issuer,
    network: product.network,
    tier: product.tier,
    annualFeeUsd: annualFee,
    estimatedAnnualRewards: totalAnnualRewards,
    signupBonusValue: signupBonusCashValue,
    benefitsValue: totalBenefitsValue,
    netAnnualValue: includeSignupBonus ? netFirstYearValue : netOngoingAnnualValue,
    breakdown: {
      rewardsByCategory,
      totalAnnualRewards,
      totalBenefitsValue,
      annualFee,
      signupBonusCashValue,
      netFirstYearValue,
      netOngoingAnnualValue,
    },
  };
}

export const discoveryService = {
  matchCardProducts(profile: SpendingProfile): ProductMatch[] {
    logger.info("matchCardProducts", { profile });
    const matches = listCardProducts().map((p) => computeMatch(p, profile, false));
    matches.sort((a, b) => b.netAnnualValue - a.netAnnualValue);
    return matches;
  },

  compareProducts(productIds: string[], profile?: SpendingProfile): ProductComparison {
    logger.info("compareProducts", { productIds });
    const products = productIds
      .map((id) => getCardProductById(id))
      .filter((p): p is CardProduct => p !== undefined);

    if (products.length === 0) {
      return { products: [], recommendation: "No valid product IDs provided." };
    }

    const defaultProfile: SpendingProfile = profile ?? {
      monthlyDining: 200,
      monthlyTravel: 100,
      monthlyGroceries: 300,
      monthlyGas: 100,
      monthlyShopping: 200,
      monthlyOther: 200,
    };

    const compared = products.map((p) => {
      const match = computeMatch(p, defaultProfile, true);
      return {
        ...match,
        rewardRates: p.rewardRates,
        signupBonus: p.signupBonus,
        fees: p.fees,
        benefits: p.benefits,
        eligibility: p.eligibility,
      };
    });

    compared.sort((a, b) => b.netAnnualValue - a.netAnnualValue);
    const best = compared[0];
    const recommendation = `Based on ${profile ? "your spending profile" : "a typical spending profile"}, ` +
      `${best.displayName} offers the highest estimated net annual value of $${best.netAnnualValue.toFixed(2)}.`;

    return { products: compared, recommendation };
  },

  estimateAnnualValue(
    productId: string,
    profile: SpendingProfile,
    includeSignupBonus: boolean
  ): ProductMatch | null {
    logger.info("estimateAnnualValue", { productId });
    const product = getCardProductById(productId);
    if (!product) return null;
    return computeMatch(product, profile, includeSignupBonus);
  },

  getSignupBonuses(): Array<{
    productId: string;
    displayName: string;
    issuer: string;
    signupBonus: NonNullable<CardProduct["signupBonus"]>;
  }> {
    return listCardProducts()
      .filter((p) => p.signupBonus)
      .map((p) => ({
        productId: p.productId,
        displayName: p.displayName,
        issuer: p.issuer,
        signupBonus: p.signupBonus!,
      }));
  },

  checkEligibility(
    creditScore: string,
    annualIncome?: number
  ): Array<{
    productId: string;
    displayName: string;
    issuer: string;
    eligible: boolean;
    reason: string;
    eligibility: CardProduct["eligibility"];
  }> {
    logger.info("checkEligibility", { creditScore, annualIncome });
    const scoreRanges: Record<string, [number, number]> = {
      poor: [300, 579],
      fair: [580, 669],
      good: [670, 739],
      excellent: [740, 850],
    };

    const range = scoreRanges[creditScore.toLowerCase()];
    if (!range) {
      return listCardProducts().map((p) => ({
        productId: p.productId,
        displayName: p.displayName,
        issuer: p.issuer,
        eligible: false,
        reason: `Unknown credit score range "${creditScore}". Use: poor, fair, good, or excellent.`,
        eligibility: p.eligibility,
      }));
    }

    const midScore = Math.round((range[0] + range[1]) / 2);

    return listCardProducts().map((p) => {
      const minRequired = p.eligibility?.creditScoreMin ?? 0;
      const incomeRec = p.eligibility?.incomeRecommended;
      const eligible = midScore >= minRequired && (!incomeRec || !annualIncome || annualIncome >= incomeRec);
      const reasons: string[] = [];
      if (midScore < minRequired) {
        reasons.push(`Requires minimum credit score of ${minRequired} (your range mid: ${midScore})`);
      }
      if (incomeRec && annualIncome && annualIncome < incomeRec) {
        reasons.push(`Recommended income $${incomeRec.toLocaleString()}+; yours is $${annualIncome.toLocaleString()}`);
      }
      return {
        productId: p.productId,
        displayName: p.displayName,
        issuer: p.issuer,
        eligible,
        reason: eligible ? "Likely eligible based on provided criteria" : reasons.join("; "),
        eligibility: p.eligibility,
      };
    });
  },
};
