import { logger } from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentCategory =
  | "finance"
  | "travel"
  | "shopping"
  | "productivity"
  | "utilities"
  | "lifestyle";

export type PricingModel =
  | { type: "free" }
  | { type: "one_time"; price: number }
  | { type: "subscription"; price: number; interval: "month" | "year" };

export type AgentStatus = "draft" | "published" | "suspended";

export interface MarketplaceAgent {
  agentId: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  icon: string;
  screenshots: string[];
  category: AgentCategory;
  tags: string[];
  publisherId: string;
  publisherName: string;
  version: string;
  pricing: PricingModel;
  capabilities: string[];
  status: AgentStatus;
  rating: number;
  reviewCount: number;
  installCount: number;
  revenue: number;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  reviewId: string;
  agentId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Installation {
  agentId: string;
  userId: string;
  installedAt: string;
  status: "active" | "uninstalled";
}

// Backward-compatible re-export
export type Agent = MarketplaceAgent;

// ── Stores ────────────────────────────────────────────────────────────────────

const agents = new Map<string, MarketplaceAgent>();
const reviews = new Map<string, Review[]>(); // agentId → reviews
const installations = new Map<string, Installation[]>(); // `${userId}` → installations

let reviewCounter = 1;

// ── Seed data ─────────────────────────────────────────────────────────────────

function seed(): void {
  const now = new Date().toISOString();
  const seedAgents: MarketplaceAgent[] = [
    {
      agentId: "default_optimizer",
      name: "Default Rewards Optimizer",
      shortDescription: "Finds the best card for any purchase",
      fullDescription:
        "Analyzes your entire card portfolio and calculates optimal payment strategy based on reward multipliers, active promotions, and merchant category. Works automatically at checkout to maximize every transaction.",
      icon: "\u{1F4B3}",
      screenshots: ["Checkout optimization screen", "Rewards comparison chart"],
      category: "finance",
      tags: ["rewards", "optimizer", "checkout", "cards"],
      publisherId: "pub-cards-mcp",
      publisherName: "Cards MCP Team",
      version: "2.1.0",
      pricing: { type: "free" },
      capabilities: ["recommend_payment_strategy", "calculate_rewards"],
      status: "published",
      rating: 4.6,
      reviewCount: 128,
      installCount: 15200,
      revenue: 0,
      createdAt: "2025-01-15T00:00:00Z",
      updatedAt: now,
    },
    {
      agentId: "travel_agent",
      name: "Travel Rewards Pro",
      shortDescription: "Maximize travel points and find the best redemptions",
      fullDescription:
        "Dedicated travel rewards optimizer that understands airline and hotel loyalty programs. Automatically applies travel-specific promotions, finds bonus earning opportunities, and suggests the best card for flights, hotels, and car rentals.",
      icon: "\u{2708}\uFE0F",
      screenshots: ["Travel dashboard", "Points transfer map", "Hotel booking optimizer"],
      category: "travel",
      tags: ["travel", "airlines", "hotels", "points", "loyalty"],
      publisherId: "pub-cards-mcp",
      publisherName: "Cards MCP Team",
      version: "3.0.1",
      pricing: { type: "subscription", price: 9.99, interval: "month" },
      capabilities: ["recommend_payment_strategy", "optimize_cart", "get_applicable_offers"],
      status: "published",
      rating: 4.8,
      reviewCount: 89,
      installCount: 8400,
      revenue: 83916,
      createdAt: "2024-11-10T00:00:00Z",
      updatedAt: now,
    },
    {
      agentId: "grocery_saver",
      name: "Grocery Saver",
      shortDescription: "Stack coupons and card rewards for groceries",
      fullDescription:
        "Combines grocery store loyalty programs with credit card category bonuses. Automatically detects rotating 5% categories, quarterly activations, and store-specific promotions to minimize your grocery spend.",
      icon: "\u{1F6D2}",
      screenshots: ["Weekly savings summary", "Coupon stack view"],
      category: "shopping",
      tags: ["groceries", "coupons", "savings", "cashback"],
      publisherId: "pub-savvy-shop",
      publisherName: "Savvy Shopping Co",
      version: "1.4.2",
      pricing: { type: "free" },
      capabilities: ["recommend_payment_strategy", "get_applicable_offers"],
      status: "published",
      rating: 4.3,
      reviewCount: 256,
      installCount: 22100,
      revenue: 0,
      createdAt: "2025-03-01T00:00:00Z",
      updatedAt: now,
    },
    {
      agentId: "budget_tracker",
      name: "Smart Budget Tracker",
      shortDescription: "AI-powered spending insights and budget alerts",
      fullDescription:
        "Tracks spending across all your cards in real time. Uses AI to categorize transactions, detect unusual spending patterns, and send proactive alerts when you approach budget limits. Monthly reports with actionable insights.",
      icon: "\u{1F4CA}",
      screenshots: ["Budget dashboard", "Spending heatmap", "Alert settings"],
      category: "productivity",
      tags: ["budget", "tracking", "alerts", "insights", "spending"],
      publisherId: "pub-fintools",
      publisherName: "FinTools Inc",
      version: "2.0.0",
      pricing: { type: "subscription", price: 4.99, interval: "month" },
      capabilities: ["calculate_rewards", "simulate_transaction"],
      status: "published",
      rating: 4.5,
      reviewCount: 312,
      installCount: 18700,
      revenue: 93313,
      createdAt: "2024-08-20T00:00:00Z",
      updatedAt: now,
    },
    {
      agentId: "deal_finder",
      name: "Deal Finder AI",
      shortDescription: "Finds the best deals and matches them to your cards",
      fullDescription:
        "Scans merchant promotions across major retailers and cross-references with your card portfolio to find double-dip opportunities. Alerts you when a deal plus card bonus creates exceptional value.",
      icon: "\u{1F525}",
      screenshots: ["Deal feed", "Card match overlay"],
      category: "shopping",
      tags: ["deals", "shopping", "promotions", "alerts"],
      publisherId: "pub-savvy-shop",
      publisherName: "Savvy Shopping Co",
      version: "1.2.0",
      pricing: { type: "one_time", price: 2.99 },
      capabilities: ["get_applicable_offers", "recommend_payment_strategy"],
      status: "published",
      rating: 4.1,
      reviewCount: 67,
      installCount: 5300,
      revenue: 15847,
      createdAt: "2025-02-14T00:00:00Z",
      updatedAt: now,
    },
    {
      agentId: "fx_optimizer",
      name: "FX Fee Optimizer",
      shortDescription: "Avoid foreign transaction fees and get best rates",
      fullDescription:
        "Identifies which of your cards have no foreign transaction fees and compares real-time exchange rates. Recommends the optimal card for international purchases, online foreign merchants, and travel abroad.",
      icon: "\u{1F30D}",
      screenshots: ["Currency comparison", "Fee-free card picker"],
      category: "finance",
      tags: ["forex", "international", "fees", "exchange-rate"],
      publisherId: "pub-fintools",
      publisherName: "FinTools Inc",
      version: "1.0.3",
      pricing: { type: "free" },
      capabilities: ["recommend_payment_strategy", "calculate_rewards"],
      status: "published",
      rating: 4.4,
      reviewCount: 43,
      installCount: 3200,
      revenue: 0,
      createdAt: "2025-04-01T00:00:00Z",
      updatedAt: now,
    },
    {
      agentId: "sub_manager",
      name: "Subscription Manager",
      shortDescription: "Track and optimize recurring subscription payments",
      fullDescription:
        "Monitors all recurring charges across your cards. Detects price increases, identifies unused subscriptions, and recommends the best card for each subscription based on category rewards. Saves the average user $23/month.",
      icon: "\u{1F504}",
      screenshots: ["Subscription list", "Savings opportunities", "Card reassignment"],
      category: "utilities",
      tags: ["subscriptions", "recurring", "savings", "management"],
      publisherId: "pub-cards-mcp",
      publisherName: "Cards MCP Team",
      version: "1.1.0",
      pricing: { type: "subscription", price: 2.99, interval: "month" },
      capabilities: ["optimize_cart", "calculate_rewards"],
      status: "published",
      rating: 4.7,
      reviewCount: 95,
      installCount: 7600,
      revenue: 22724,
      createdAt: "2025-01-28T00:00:00Z",
      updatedAt: now,
    },
    {
      agentId: "wellness_rewards",
      name: "Wellness Rewards",
      shortDescription: "Maximize rewards on health, fitness, and wellness",
      fullDescription:
        "Specializes in health and wellness spending categories: gym memberships, pharmacies, health food stores, and wellness apps. Finds cards with enhanced wellness rewards and stacks them with FSA/HSA when eligible.",
      icon: "\u{1F9D8}",
      screenshots: ["Wellness spending view", "Category bonuses"],
      category: "lifestyle",
      tags: ["wellness", "health", "fitness", "pharmacy"],
      publisherId: "pub-savvy-shop",
      publisherName: "Savvy Shopping Co",
      version: "1.0.0",
      pricing: { type: "one_time", price: 1.99 },
      capabilities: ["recommend_payment_strategy", "get_applicable_offers"],
      status: "published",
      rating: 3.9,
      reviewCount: 21,
      installCount: 1400,
      revenue: 2786,
      createdAt: "2025-04-10T00:00:00Z",
      updatedAt: now,
    },
  ];

  for (const a of seedAgents) {
    agents.set(a.agentId, a);
    reviews.set(a.agentId, []);
  }

  // Seed some reviews
  const sampleReviews: Omit<Review, "reviewId">[] = [
    { agentId: "default_optimizer", userId: "user-alice", userName: "Alice M.", rating: 5, comment: "Saved me $40 last month just from better card selection!", createdAt: "2025-04-15T10:00:00Z" },
    { agentId: "default_optimizer", userId: "user-bob", userName: "Bob K.", rating: 4, comment: "Works great for most purchases. Wish it supported more international merchants.", createdAt: "2025-04-12T14:30:00Z" },
    { agentId: "travel_agent", userId: "user-alice", userName: "Alice M.", rating: 5, comment: "The points transfer suggestions are incredible. Booked a first-class flight for half the usual points.", createdAt: "2025-04-20T09:00:00Z" },
    { agentId: "budget_tracker", userId: "user-bob", userName: "Bob K.", rating: 5, comment: "Finally a budget app that understands my card rewards. The spending heatmap is genius.", createdAt: "2025-04-18T16:00:00Z" },
    { agentId: "grocery_saver", userId: "user-carol", userName: "Carol D.", rating: 4, comment: "Great coupon stacking. Would love Costco support.", createdAt: "2025-04-11T11:00:00Z" },
  ];

  for (const r of sampleReviews) {
    const id = `rev-${reviewCounter++}`;
    const arr = reviews.get(r.agentId) ?? [];
    arr.push({ ...r, reviewId: id });
    reviews.set(r.agentId, arr);
  }
}

seed();

// ── Helpers ───────────────────────────────────────────────────────────────────

function recalcRating(agentId: string): void {
  const agentReviews = reviews.get(agentId);
  const agent = agents.get(agentId);
  if (!agent || !agentReviews || agentReviews.length === 0) return;
  const sum = agentReviews.reduce((s, r) => s + r.rating, 0);
  agent.rating = Math.round((sum / agentReviews.length) * 10) / 10;
  agent.reviewCount = agentReviews.length;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const marketplaceService = {
  listAgents(filter?: {
    query?: string;
    category?: AgentCategory;
    sort?: "rating" | "installs" | "newest" | "price";
  }): MarketplaceAgent[] {
    logger.info("Listing marketplace agents", { filter });
    let result = Array.from(agents.values()).filter((a) => a.status === "published");

    if (filter?.query) {
      const q = filter.query.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.shortDescription.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (filter?.category) {
      result = result.filter((a) => a.category === filter.category);
    }

    const sort = filter?.sort ?? "installs";
    switch (sort) {
      case "rating":
        result.sort((a, b) => b.rating - a.rating);
        break;
      case "installs":
        result.sort((a, b) => b.installCount - a.installCount);
        break;
      case "newest":
        result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "price":
        result.sort((a, b) => {
          const pa = a.pricing.type === "free" ? 0 : (a.pricing as { price: number }).price;
          const pb = b.pricing.type === "free" ? 0 : (b.pricing as { price: number }).price;
          return pa - pb;
        });
        break;
    }

    return result;
  },

  getAgent(agentId: string): MarketplaceAgent | undefined {
    logger.info("Fetching agent", { agentId });
    return agents.get(agentId);
  },

  getFeatured(): MarketplaceAgent[] {
    return Array.from(agents.values())
      .filter((a) => a.status === "published")
      .sort((a, b) => b.rating * b.installCount - a.rating * a.installCount)
      .slice(0, 4);
  },

  publishAgent(data: {
    agentId: string;
    name: string;
    shortDescription: string;
    fullDescription: string;
    icon: string;
    category: AgentCategory;
    tags: string[];
    publisherId: string;
    publisherName: string;
    version: string;
    pricing: PricingModel;
    capabilities: string[];
  }): MarketplaceAgent {
    logger.info("Publishing agent", { agentId: data.agentId });
    const now = new Date().toISOString();
    const agent: MarketplaceAgent = {
      ...data,
      screenshots: [],
      status: "published",
      rating: 0,
      reviewCount: 0,
      installCount: 0,
      revenue: 0,
      createdAt: now,
      updatedAt: now,
    };
    agents.set(agent.agentId, agent);
    reviews.set(agent.agentId, []);
    return agent;
  },

  updateAgent(
    agentId: string,
    updates: Partial<
      Pick<
        MarketplaceAgent,
        "name" | "shortDescription" | "fullDescription" | "icon" | "category" | "tags" | "version" | "pricing" | "capabilities" | "status"
      >
    >
  ): MarketplaceAgent | undefined {
    const agent = agents.get(agentId);
    if (!agent) return undefined;
    Object.assign(agent, updates, { updatedAt: new Date().toISOString() });
    return agent;
  },

  installAgent(agentId: string, userId: string): Installation | undefined {
    const agent = agents.get(agentId);
    if (!agent || agent.status !== "published") return undefined;

    const userInstalls = installations.get(userId) ?? [];
    const existing = userInstalls.find((i) => i.agentId === agentId);
    if (existing && existing.status === "active") return existing;

    if (existing) {
      existing.status = "active";
      existing.installedAt = new Date().toISOString();
    } else {
      const inst: Installation = {
        agentId,
        userId,
        installedAt: new Date().toISOString(),
        status: "active",
      };
      userInstalls.push(inst);
      installations.set(userId, userInstalls);
    }

    agent.installCount += 1;
    if (agent.pricing.type === "one_time") {
      agent.revenue += (agent.pricing as { price: number }).price;
    } else if (agent.pricing.type === "subscription") {
      agent.revenue += (agent.pricing as { price: number }).price;
    }

    logger.info("Agent installed", { agentId, userId });
    return installations.get(userId)!.find((i) => i.agentId === agentId)!;
  },

  uninstallAgent(agentId: string, userId: string): boolean {
    const userInstalls = installations.get(userId);
    if (!userInstalls) return false;
    const inst = userInstalls.find((i) => i.agentId === agentId && i.status === "active");
    if (!inst) return false;
    inst.status = "uninstalled";
    logger.info("Agent uninstalled", { agentId, userId });
    return true;
  },

  getUserInstallations(userId: string): (Installation & { agent?: MarketplaceAgent })[] {
    const userInstalls = installations.get(userId) ?? [];
    return userInstalls
      .filter((i) => i.status === "active")
      .map((i) => ({ ...i, agent: agents.get(i.agentId) }));
  },

  addReview(data: {
    agentId: string;
    userId: string;
    userName: string;
    rating: number;
    comment: string;
  }): Review | undefined {
    if (!agents.has(data.agentId)) return undefined;
    const id = `rev-${reviewCounter++}`;
    const review: Review = {
      reviewId: id,
      agentId: data.agentId,
      userId: data.userId,
      userName: data.userName,
      rating: Math.min(5, Math.max(1, Math.round(data.rating))),
      comment: data.comment,
      createdAt: new Date().toISOString(),
    };
    const arr = reviews.get(data.agentId) ?? [];
    arr.push(review);
    reviews.set(data.agentId, arr);
    recalcRating(data.agentId);
    logger.info("Review added", { agentId: data.agentId, reviewId: id });
    return review;
  },

  getReviews(agentId: string): Review[] {
    return reviews.get(agentId) ?? [];
  },

  getPublisherAgents(publisherId: string): MarketplaceAgent[] {
    return Array.from(agents.values()).filter((a) => a.publisherId === publisherId);
  },

  getPublisherRevenue(publisherId: string): {
    totalRevenue: number;
    totalInstalls: number;
    agentCount: number;
    agents: Array<{ agentId: string; name: string; revenue: number; installCount: number }>;
  } {
    const pubAgents = this.getPublisherAgents(publisherId);
    return {
      totalRevenue: pubAgents.reduce((s, a) => s + a.revenue, 0),
      totalInstalls: pubAgents.reduce((s, a) => s + a.installCount, 0),
      agentCount: pubAgents.length,
      agents: pubAgents.map((a) => ({
        agentId: a.agentId,
        name: a.name,
        revenue: a.revenue,
        installCount: a.installCount,
      })),
    };
  },
};
