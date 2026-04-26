import React, { useCallback, useEffect, useState } from "react";

type Tab = "marketplace" | "cards" | "admin" | "openapi" | "sandbox" | "users" | "audit";
type MpView = "browse" | "detail" | "publisher" | "installed";

type CardRow = {
  cardId: string;
  last4: string;
  issuer: string;
  network: string;
  tier: string;
  productName?: string;
  features?: Array<{ name: string; summary: string; category?: string }>;
};

type Product = {
  productId: string;
  displayName: string;
  issuer: string;
  tier: string;
  marketingSummary: string;
  strongCategories: string[];
  features: Array<{ name: string; summary: string; category?: string }>;
};

type ToolRow = { name: string; description: string; source: string };

type MpPricing =
  | { type: "free" }
  | { type: "one_time"; price: number }
  | { type: "subscription"; price: number; interval: string };

type MpAgent = {
  agentId: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  icon: string;
  screenshots: string[];
  category: string;
  tags: string[];
  publisherId: string;
  publisherName: string;
  version: string;
  pricing: MpPricing;
  capabilities: string[];
  status: string;
  rating: number;
  reviewCount: number;
  installCount: number;
  revenue: number;
};

type MpReview = {
  reviewId: string;
  agentId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

type MpInstallation = {
  agentId: string;
  userId: string;
  installedAt: string;
  status: string;
  agent?: MpAgent;
};

type AuthUser = {
  userId: string;
  displayName: string;
  email: string;
  roles: string[];
};

type PlatformUser = {
  userId: string;
  displayName: string;
  email: string;
  roles: string[];
  active: boolean;
  createdAt: string;
  lastActiveAt: string;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  result: "allowed" | "denied" | "error";
  meta?: Record<string, unknown>;
};

const CATEGORIES = ["All", "Finance", "Travel", "Shopping", "Productivity", "Utilities", "Lifestyle"] as const;

const ADMIN_KEY = "cards-mcp-admin-token";
const AUTH_KEY = "cards-mcp-auth-user";

function authHeaders(): HeadersInit {
  const t = localStorage.getItem(ADMIN_KEY)?.trim();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

function formatPrice(pricing: MpPricing): React.ReactElement {
  if (pricing.type === "free") return <span className="mp-price free">Free</span>;
  if (pricing.type === "one_time") return <span className="mp-price one-time">${pricing.price.toFixed(2)}</span>;
  return <span className="mp-price subscription">${pricing.price}/{pricing.interval === "year" ? "yr" : "mo"}</span>;
}

function stars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.3;
  return "\u2605".repeat(full) + (half ? "\u00BD" : "") + " " + rating.toFixed(1);
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + "K+";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function loadAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function App(): React.ReactElement {
  // ── Auth state ──────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState<AuthUser | null>(loadAuthUser);
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const isAdmin = authUser?.roles.includes("admin") ?? false;
  const userId = authUser?.userId ?? "demo-user";

  const doLogin = async () => {
    setLoginErr(null);
    setLoginLoading(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: loginId, password: loginPw }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setLoginErr(d.error || "Login failed");
        return;
      }
      const user = d.user as AuthUser;
      setAuthUser(user);
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    } catch (e) {
      setLoginErr((e as Error).message);
    } finally {
      setLoginLoading(false);
    }
  };

  const doLogout = () => {
    setAuthUser(null);
    localStorage.removeItem(AUTH_KEY);
    setLoginId("");
    setLoginPw("");
    setTab("marketplace");
  };

  // ── If not logged in, show login screen ─────────────────────────────────
  if (!authUser) {
    return (
      <div className="login-backdrop">
        <div className="login-card">
          <h1>Cards MCP</h1>
          <p className="sub">Sign in to continue</p>
          <label>User ID</label>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="e.g. admin"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") void doLogin(); }}
          />
          <label>Password</label>
          <input
            type="password"
            value={loginPw}
            onChange={(e) => setLoginPw(e.target.value)}
            placeholder="Enter password"
            onKeyDown={(e) => { if (e.key === "Enter") void doLogin(); }}
          />
          {loginErr && <p className="err">{loginErr}</p>}
          <button type="button" className="login-btn" disabled={loginLoading || !loginId || !loginPw} onClick={() => void doLogin()}>
            {loginLoading ? "Signing in..." : "Sign in"}
          </button>
          <p className="sub" style={{ marginTop: "1rem", fontSize: "0.78rem" }}>
            Demo accounts: admin / admin@123, demo-user / demo
          </p>
        </div>
      </div>
    );
  }

  // ── Logged-in app ─────────────────────────────────────────────────────
  return <LoggedInApp authUser={authUser} userId={userId} isAdmin={isAdmin} onLogout={doLogout} />;
}

// ── Main app (after login) ─────────────────────────────────────────────────

function LoggedInApp({ authUser, userId, isAdmin, onLogout }: {
  authUser: AuthUser;
  userId: string;
  isAdmin: boolean;
  onLogout: () => void;
}): React.ReactElement {
  const [tab, setTab] = useState<Tab>("marketplace");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_KEY) ?? "");
  const [wallet, setWallet] = useState<CardRow[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [cardUrl, setCardUrl] = useState("");
  const [rewardsUrl, setRewardsUrl] = useState("");
  const [promoUrl, setPromoUrl] = useState("");
  const [authTok, setAuthTok] = useState("");
  const [simMode, setSimMode] = useState<boolean | "">("");
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  const [rawOpenapi, setRawOpenapi] = useState("");
  const [openapiFilename, setOpenapiFilename] = useState("uploaded.json");
  const [openapiMsg, setOpenapiMsg] = useState<string | null>(null);

  const [tools, setTools] = useState<ToolRow[]>([]);
  const [toolName, setToolName] = useState("get_eligible_cards");
  const [toolArgs, setToolArgs] = useState(`{\n  "userId": "${userId}"\n}`);
  const [sandboxOut, setSandboxOut] = useState<string>("");

  // ── Marketplace state ───────────────────────────────────────────────────
  const [mpView, setMpView] = useState<MpView>("browse");
  const [mpAgents, setMpAgents] = useState<MpAgent[]>([]);
  const [mpFeatured, setMpFeatured] = useState<MpAgent[]>([]);
  const [mpSearch, setMpSearch] = useState("");
  const [mpCategory, setMpCategory] = useState("All");
  const [mpDetailAgent, setMpDetailAgent] = useState<MpAgent | null>(null);
  const [mpDetailTab, setMpDetailTab] = useState<"about" | "reviews">("about");
  const [mpReviews, setMpReviews] = useState<MpReview[]>([]);
  const [mpInstalled, setMpInstalled] = useState<MpInstallation[]>([]);
  const [mpInstalledIds, setMpInstalledIds] = useState<Set<string>>(new Set());
  const [mpReviewRating, setMpReviewRating] = useState(5);
  const [mpReviewComment, setMpReviewComment] = useState("");
  const [mpPubAgents, setMpPubAgents] = useState<MpAgent[]>([]);
  const [mpPubRevenue, setMpPubRevenue] = useState<{ totalRevenue: number; totalInstalls: number; agentCount: number } | null>(null);
  const [mpShowPubForm, setMpShowPubForm] = useState(false);
  const [mpPubForm, setMpPubForm] = useState({
    agentId: "", name: "", shortDescription: "", fullDescription: "", icon: "\u{1F916}",
    category: "productivity", tags: "", version: "1.0.0", pricingType: "free", price: "0",
    priceInterval: "month", capabilities: "",
  });
  const [mpMsg, setMpMsg] = useState<string | null>(null);

  // ── Admin: Users state ──────────────────────────────────────────────────
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);

  // ── Admin: Audit state ──────────────────────────────────────────────────
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditFilterUser, setAuditFilterUser] = useState("");
  const [auditFilterAction, setAuditFilterAction] = useState("");
  const [auditLimit, setAuditLimit] = useState("100");

  const MP_PUBLISHER_ID = "pub-demo";
  const MP_PUBLISHER_NAME = "Demo Publisher";

  const persistToken = () => {
    localStorage.setItem(ADMIN_KEY, adminToken.trim());
    setAdminMsg("Admin token saved in browser localStorage.");
  };

  const loadCards = useCallback(async () => {
    setLoadErr(null);
    try {
      const [w, p] = await Promise.all([
        fetch(`/api/cards/wallet?userId=${encodeURIComponent(userId)}`).then((r) => r.json()),
        fetch("/api/catalog/products").then((r) => r.json()),
      ]);
      if (!w.success) throw new Error(w.error || "wallet failed");
      if (!p.success) throw new Error(p.error || "catalog failed");
      setWallet(w.cards || []);
      setCatalog(p.products || []);
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, [userId]);

  useEffect(() => { void loadCards(); }, [loadCards]);

  useEffect(() => {
    void fetch("/api/tools").then((r) => r.json()).then((d) => {
      if (d.success && Array.isArray(d.tools)) setTools(d.tools);
    }).catch(() => {});
  }, [tab]);

  useEffect(() => {
    void fetch("/api/admin/config").then((r) => r.json()).then((d) => {
      if (!d.success) return;
      setCardUrl(d.envDefaults?.cardApiBaseUrl ?? "");
      setRewardsUrl(d.envDefaults?.rewardsApiBaseUrl ?? "");
      setPromoUrl(d.envDefaults?.promoApiBaseUrl ?? "");
    }).catch(() => {});
  }, []);

  // ── Load users when Users tab is active ─────────────────────────────────
  const loadUsers = useCallback(async () => {
    const r = await fetch("/api/admin/users");
    const d = await r.json();
    if (d.success) setPlatformUsers(d.users);
  }, []);

  useEffect(() => {
    if (tab === "users" && isAdmin) void loadUsers();
  }, [tab, isAdmin, loadUsers]);

  // ── Load audit when Audit tab is active ─────────────────────────────────
  const loadAudit = useCallback(async () => {
    const params = new URLSearchParams();
    if (auditFilterUser) params.set("userId", auditFilterUser);
    if (auditFilterAction) params.set("actionPrefix", auditFilterAction);
    if (auditLimit) params.set("limit", auditLimit);
    const r = await fetch(`/api/admin/audit?${params}`);
    const d = await r.json();
    if (d.success) setAuditEntries(d.entries);
  }, [auditFilterUser, auditFilterAction, auditLimit]);

  useEffect(() => {
    if (tab === "audit" && isAdmin) void loadAudit();
  }, [tab, isAdmin, loadAudit]);

  // ── Marketplace data loading ─────────────────────────────────────────────
  const loadMpAgents = useCallback(async () => {
    const params = new URLSearchParams();
    if (mpSearch) params.set("q", mpSearch);
    if (mpCategory !== "All") params.set("category", mpCategory.toLowerCase());
    const r = await fetch(`/api/marketplace/agents?${params}`);
    const d = await r.json();
    if (d.success) setMpAgents(d.agents);
  }, [mpSearch, mpCategory]);

  const loadMpFeatured = useCallback(async () => {
    const r = await fetch("/api/marketplace/agents/featured");
    const d = await r.json();
    if (d.success) setMpFeatured(d.agents);
  }, []);

  const loadMpInstalled = useCallback(async () => {
    const r = await fetch(`/api/marketplace/user/${encodeURIComponent(userId)}/installed`);
    const d = await r.json();
    if (d.success) {
      setMpInstalled(d.installations);
      setMpInstalledIds(new Set((d.installations as MpInstallation[]).map((i) => i.agentId)));
    }
  }, [userId]);

  const loadMpPublisher = useCallback(async () => {
    const [a, rev] = await Promise.all([
      fetch(`/api/marketplace/publisher/${encodeURIComponent(MP_PUBLISHER_ID)}/agents`).then((r) => r.json()),
      fetch(`/api/marketplace/publisher/${encodeURIComponent(MP_PUBLISHER_ID)}/revenue`).then((r) => r.json()),
    ]);
    if (a.success) setMpPubAgents(a.agents);
    if (rev.success) setMpPubRevenue({ totalRevenue: rev.totalRevenue, totalInstalls: rev.totalInstalls, agentCount: rev.agentCount });
  }, []);

  useEffect(() => {
    if (tab !== "marketplace") return;
    void loadMpAgents();
    void loadMpFeatured();
    void loadMpInstalled();
  }, [tab, loadMpAgents, loadMpFeatured, loadMpInstalled]);

  useEffect(() => {
    if (tab === "marketplace" && mpView === "publisher") void loadMpPublisher();
  }, [tab, mpView, loadMpPublisher]);

  const openDetail = async (agentId: string) => {
    const r = await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}`);
    const d = await r.json();
    if (d.success) {
      setMpDetailAgent(d.agent);
      setMpDetailTab("about");
      setMpView("detail");
      const rv = await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}/reviews`);
      const rd = await rv.json();
      if (rd.success) setMpReviews(rd.reviews);
    }
  };

  const installAgent = async (agentId: string) => {
    await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await loadMpInstalled();
    if (mpDetailAgent?.agentId === agentId) {
      const r = await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}`);
      const d = await r.json();
      if (d.success) setMpDetailAgent(d.agent);
    }
  };

  const uninstallAgent = async (agentId: string) => {
    await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}/uninstall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await loadMpInstalled();
    if (mpDetailAgent?.agentId === agentId) {
      const r = await fetch(`/api/marketplace/agents/${encodeURIComponent(agentId)}`);
      const d = await r.json();
      if (d.success) setMpDetailAgent(d.agent);
    }
  };

  const submitReview = async () => {
    if (!mpDetailAgent) return;
    setMpMsg(null);
    const r = await fetch(`/api/marketplace/agents/${encodeURIComponent(mpDetailAgent.agentId)}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, userName: authUser.displayName, rating: mpReviewRating, comment: mpReviewComment }),
    });
    const d = await r.json();
    if (d.success) {
      setMpReviewComment("");
      setMpReviewRating(5);
      const rv = await fetch(`/api/marketplace/agents/${encodeURIComponent(mpDetailAgent.agentId)}/reviews`);
      const rd = await rv.json();
      if (rd.success) setMpReviews(rd.reviews);
      const ag = await fetch(`/api/marketplace/agents/${encodeURIComponent(mpDetailAgent.agentId)}`);
      const ad = await ag.json();
      if (ad.success) setMpDetailAgent(ad.agent);
      setMpMsg("Review submitted!");
    } else {
      setMpMsg(d.error || "Failed to submit review");
    }
  };

  const publishAgent = async () => {
    setMpMsg(null);
    const body: Record<string, unknown> = {
      agentId: mpPubForm.agentId,
      name: mpPubForm.name,
      shortDescription: mpPubForm.shortDescription,
      fullDescription: mpPubForm.fullDescription,
      icon: mpPubForm.icon,
      category: mpPubForm.category,
      tags: mpPubForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      publisherId: MP_PUBLISHER_ID,
      publisherName: MP_PUBLISHER_NAME,
      version: mpPubForm.version,
      pricingType: mpPubForm.pricingType,
      price: parseFloat(mpPubForm.price) || 0,
      priceInterval: mpPubForm.priceInterval,
      capabilities: mpPubForm.capabilities.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const r = await fetch("/api/marketplace/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.success) {
      setMpMsg("Agent published!");
      setMpShowPubForm(false);
      setMpPubForm({ agentId: "", name: "", shortDescription: "", fullDescription: "", icon: "\u{1F916}", category: "productivity", tags: "", version: "1.0.0", pricingType: "free", price: "0", priceInterval: "month", capabilities: "" });
      void loadMpPublisher();
      void loadMpAgents();
    } else {
      setMpMsg(d.error || "Publish failed");
    }
  };

  const saveAdmin = async () => {
    setAdminMsg(null);
    const body: Record<string, unknown> = {
      cardApiBaseUrl: cardUrl || undefined,
      rewardsApiBaseUrl: rewardsUrl || undefined,
      promoApiBaseUrl: promoUrl || undefined,
      authToken: authTok || undefined,
    };
    if (simMode !== "") body.simulationMode = simMode;
    const r = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) setAdminMsg(j.error || r.statusText);
    else setAdminMsg("Saved runtime overrides. HTTP clients refreshed.");
  };

  const resetAdmin = async () => {
    setAdminMsg(null);
    const r = await fetch("/api/admin/config/reset", { method: "POST", headers: authHeaders() });
    const j = await r.json();
    if (!r.ok) setAdminMsg(j.error || r.statusText);
    else {
      setAdminMsg("Runtime overrides cleared.");
      void fetch("/api/admin/config").then((x) => x.json()).then((d) => {
        if (d.envDefaults) {
          setCardUrl(d.envDefaults.cardApiBaseUrl ?? "");
          setRewardsUrl(d.envDefaults.rewardsApiBaseUrl ?? "");
          setPromoUrl(d.envDefaults.promoApiBaseUrl ?? "");
        }
      });
    }
  };

  const pingBank = async (which: "card" | "rewards" | "promo") => {
    setAdminMsg(null);
    const r = await fetch("/api/admin/bank/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ which }),
    });
    const j = await r.json();
    setAdminMsg(JSON.stringify(j, null, 2));
  };

  const uploadOpenapiFile = async (file: File | null) => {
    setOpenapiMsg(null);
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/admin/openapi/upload", { method: "POST", headers: authHeaders(), body: fd });
    const j = await r.json();
    if (!r.ok) setOpenapiMsg(j.error || r.statusText);
    else setOpenapiMsg(`Loaded ${j.toolCount} OpenAPI tools. Paths: ${(j.paths || []).join(", ")}`);
  };

  const uploadOpenapiRaw = async () => {
    setOpenapiMsg(null);
    const r = await fetch("/api/admin/openapi/raw", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ filename: openapiFilename, content: rawOpenapi }),
    });
    const j = await r.json();
    if (!r.ok) setOpenapiMsg(j.error || r.statusText);
    else setOpenapiMsg(`Loaded ${j.toolCount} tools from pasted spec.`);
  };

  const reloadOpenapi = async () => {
    setOpenapiMsg(null);
    const r = await fetch("/api/admin/openapi/reload", { method: "POST", headers: authHeaders() });
    const j = await r.json();
    if (!r.ok) setOpenapiMsg(j.error || r.statusText);
    else setOpenapiMsg(`Reloaded. ${j.toolCount} OpenAPI tools.`);
  };

  const clearOpenapiUploads = async () => {
    setOpenapiMsg(null);
    const r = await fetch("/api/admin/openapi/clear-uploads", { method: "POST", headers: authHeaders() });
    const j = await r.json();
    if (!r.ok) setOpenapiMsg(j.error || r.statusText);
    else setOpenapiMsg(`Cleared uploads. ${j.toolCount} tools remain from env paths only.`);
  };

  const runSandbox = async () => {
    setSandboxOut("");
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(toolArgs) as Record<string, unknown>; } catch (e) {
      setSandboxOut(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    const r = await fetch("/api/sandbox/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: toolName, arguments: args, userId }),
    });
    const j = await r.json();
    setSandboxOut(JSON.stringify(j, null, 2));
  };

  // ── Tab definitions (role-based) ────────────────────────────────────────

  const allTabs: Array<[Tab, string]> = [
    ["marketplace", "Marketplace"],
    ...(isAdmin ? [
      ["cards", "Cards & features"],
      ["admin", "Bank APIs"],
      ["openapi", "OpenAPI \u2192 MCP"],
      ["sandbox", "Tool sandbox"],
      ["users", "Users"],
      ["audit", "Audit log"],
    ] as Array<[Tab, string]> : []),
  ];

  // ── Render helpers ──────────────────────────────────────────────────────

  const renderAgentCard = (a: MpAgent) => (
    <div key={a.agentId} className="mp-agent-card" onClick={() => void openDetail(a.agentId)}>
      <div className="mp-agent-head">
        <div className="mp-agent-icon">{a.icon}</div>
        <div className="mp-agent-info">
          <h3>{a.name}</h3>
          <p className="mp-agent-desc">{a.shortDescription}</p>
        </div>
      </div>
      <div className="mp-agent-footer">
        <span className="mp-stars">{stars(a.rating)}</span>
        {formatPrice(a.pricing)}
        <span className="mp-installs">{formatCount(a.installCount)} installs</span>
      </div>
    </div>
  );

  const renderMpBrowse = () => (
    <>
      <div className="mp-topbar">
        <input
          className="mp-search"
          placeholder="Search agents..."
          value={mpSearch}
          onChange={(e) => setMpSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void loadMpAgents(); }}
        />
        <div className="mp-nav-btns">
          {(["browse", "installed", "publisher"] as const).map((v) => (
            <button key={v} type="button" className={`mp-nav-btn${mpView === v ? " active" : ""}`} onClick={() => setMpView(v)}>
              {v === "browse" ? "Browse" : v === "installed" ? "My Agents" : "Publisher"}
            </button>
          ))}
        </div>
      </div>

      <div className="mp-chips">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={`mp-chip${mpCategory === c ? " active" : ""}`} onClick={() => setMpCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      {mpCategory === "All" && mpFeatured.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>Featured</h3>
          <div className="mp-featured">
            {mpFeatured.map((a) => (
              <div key={a.agentId} className="mp-hero-card" onClick={() => void openDetail(a.agentId)}>
                <div className="mp-hero-icon">{a.icon}</div>
                <h3>{a.name}</h3>
                <div className="meta">{a.shortDescription}</div>
                <div className="mp-agent-footer" style={{ marginTop: "0.5rem" }}>
                  <span className="mp-stars">{stars(a.rating)}</span>
                  {formatPrice(a.pricing)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
        {mpCategory === "All" ? "All Agents" : mpCategory}
      </h3>
      {mpAgents.length === 0 ? (
        <p className="mp-empty">No agents found.</p>
      ) : (
        <div className="mp-grid">{mpAgents.map(renderAgentCard)}</div>
      )}
    </>
  );

  const renderMpDetail = () => {
    if (!mpDetailAgent) return null;
    const a = mpDetailAgent;
    const isInstalled = mpInstalledIds.has(a.agentId);
    return (
      <div className="mp-detail">
        <button type="button" className="mp-back" onClick={() => setMpView("browse")}>&larr; Back to browse</button>
        <div className="mp-detail-hero">
          <div className="mp-detail-icon">{a.icon}</div>
          <div className="mp-detail-meta">
            <h2>{a.name}</h2>
            <div className="meta">{a.publisherName} &middot; v{a.version} &middot; {a.category}</div>
            <div className="mp-detail-actions">
              {isInstalled ? (
                <button type="button" className="mp-install-btn installed" onClick={() => void uninstallAgent(a.agentId)}>Uninstall</button>
              ) : (
                <button type="button" className="mp-install-btn" onClick={() => void installAgent(a.agentId)}>Install</button>
              )}
              {formatPrice(a.pricing)}
            </div>
          </div>
        </div>

        <div className="mp-stats-row">
          <div className="mp-stat"><div className="mp-stat-val">{stars(a.rating)}</div><div className="mp-stat-label">{a.reviewCount} reviews</div></div>
          <div className="mp-stat"><div className="mp-stat-val">{formatCount(a.installCount)}</div><div className="mp-stat-label">installs</div></div>
          <div className="mp-stat"><div className="mp-stat-val">{a.capabilities.length}</div><div className="mp-stat-label">capabilities</div></div>
        </div>

        <div className="mp-detail-tabs">
          <button type="button" className={`mp-detail-tab${mpDetailTab === "about" ? " active" : ""}`} onClick={() => setMpDetailTab("about")}>About</button>
          <button type="button" className={`mp-detail-tab${mpDetailTab === "reviews" ? " active" : ""}`} onClick={() => setMpDetailTab("reviews")}>Reviews ({mpReviews.length})</button>
        </div>

        {mpDetailTab === "about" && (
          <>
            <p className="mp-about">{a.fullDescription}</p>
            {a.tags.length > 0 && (
              <div className="mp-tags">{a.tags.map((t) => <span key={t} className="mp-tag">{t}</span>)}</div>
            )}
            {a.capabilities.length > 0 && (
              <>
                <div className="mp-section-title">Capabilities</div>
                <div className="mp-tags">{a.capabilities.map((c) => <span key={c} className="mp-tag">{c}</span>)}</div>
              </>
            )}
            {a.screenshots.length > 0 && (
              <>
                <div className="mp-section-title">Screenshots</div>
                <div className="mp-tags">{a.screenshots.map((s, i) => <span key={i} className="mp-tag">{s}</span>)}</div>
              </>
            )}
          </>
        )}

        {mpDetailTab === "reviews" && (
          <>
            {mpReviews.length === 0 ? (
              <p className="mp-empty">No reviews yet. Be the first!</p>
            ) : (
              mpReviews.map((r) => (
                <div key={r.reviewId} className="mp-review">
                  <div className="mp-review-head">
                    <span className="mp-review-user">{r.userName}</span>
                    <span className="mp-stars">{stars(r.rating)}</span>
                    <span className="mp-review-date">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mp-review-comment">{r.comment}</p>
                </div>
              ))
            )}
            <div className="mp-review-form">
              <div className="mp-section-title">Write a review</div>
              <div className="mp-rating-input">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={n <= mpReviewRating ? "filled" : ""} onClick={() => setMpReviewRating(n)}>{"\u2605"}</button>
                ))}
              </div>
              <textarea placeholder="Share your experience..." value={mpReviewComment} onChange={(e) => setMpReviewComment(e.target.value)} style={{ minHeight: "80px" }} />
              <div className="row">
                <button type="button" className="primary" onClick={() => void submitReview()}>Submit review</button>
              </div>
              {mpMsg && <p className="ok" style={{ marginTop: "0.5rem" }}>{mpMsg}</p>}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderMpInstalled = () => (
    <>
      <div className="mp-topbar">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>My Installed Agents</h3>
        <div className="mp-nav-btns" style={{ marginLeft: "auto" }}>
          {(["browse", "installed", "publisher"] as const).map((v) => (
            <button key={v} type="button" className={`mp-nav-btn${mpView === v ? " active" : ""}`} onClick={() => setMpView(v)}>
              {v === "browse" ? "Browse" : v === "installed" ? "My Agents" : "Publisher"}
            </button>
          ))}
        </div>
      </div>
      {mpInstalled.length === 0 ? (
        <p className="mp-empty">No agents installed yet. Browse the marketplace to get started!</p>
      ) : (
        <div className="mp-installed-grid">
          {mpInstalled.map((inst) => (
            <div key={inst.agentId} className="mp-installed-card">
              <div className="mp-agent-icon">{inst.agent?.icon || "\u{1F916}"}</div>
              <div className="mp-installed-info">
                <h4>{inst.agent?.name || inst.agentId}</h4>
                <div className="meta">{inst.agent?.shortDescription || ""}</div>
              </div>
              <button type="button" className="mp-uninstall-btn" onClick={() => void uninstallAgent(inst.agentId)}>Uninstall</button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const renderMpPublisher = () => (
    <>
      <div className="mp-topbar">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Publisher Dashboard</h3>
        <div className="mp-nav-btns" style={{ marginLeft: "auto" }}>
          {(["browse", "installed", "publisher"] as const).map((v) => (
            <button key={v} type="button" className={`mp-nav-btn${mpView === v ? " active" : ""}`} onClick={() => setMpView(v)}>
              {v === "browse" ? "Browse" : v === "installed" ? "My Agents" : "Publisher"}
            </button>
          ))}
        </div>
      </div>

      {mpPubRevenue && (
        <div className="mp-pub-stats">
          <div className="mp-pub-stat"><div className="mp-stat-val">${mpPubRevenue.totalRevenue.toLocaleString()}</div><div className="mp-stat-label">Total Revenue</div></div>
          <div className="mp-pub-stat"><div className="mp-stat-val">{formatCount(mpPubRevenue.totalInstalls)}</div><div className="mp-stat-label">Total Installs</div></div>
          <div className="mp-pub-stat"><div className="mp-stat-val">{mpPubRevenue.agentCount}</div><div className="mp-stat-label">Agents</div></div>
        </div>
      )}

      <div className="mp-section-title">My Listings</div>
      {mpPubAgents.length === 0 ? (
        <p className="mp-empty">No agents published yet.</p>
      ) : (
        <table className="mp-pub-table">
          <thead><tr><th>Agent</th><th>Status</th><th>Installs</th><th>Revenue</th><th>Rating</th></tr></thead>
          <tbody>
            {mpPubAgents.map((a) => (
              <tr key={a.agentId}>
                <td><span style={{ marginRight: "0.5rem" }}>{a.icon}</span>{a.name}</td>
                <td>{a.status}</td>
                <td>{formatCount(a.installCount)}</td>
                <td>${a.revenue.toLocaleString()}</td>
                <td>{stars(a.rating)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ marginTop: "1rem" }}>
        <button type="button" className="primary" onClick={() => setMpShowPubForm(!mpShowPubForm)}>
          {mpShowPubForm ? "Cancel" : "Publish New Agent"}
        </button>
      </div>

      {mpShowPubForm && (
        <div className="mp-pub-form">
          <div className="mp-section-title">New Agent</div>
          <label>Agent ID (slug)</label>
          <input value={mpPubForm.agentId} onChange={(e) => setMpPubForm({ ...mpPubForm, agentId: e.target.value })} placeholder="my-cool-agent" />
          <label>Name</label>
          <input value={mpPubForm.name} onChange={(e) => setMpPubForm({ ...mpPubForm, name: e.target.value })} />
          <label>Short Description</label>
          <input value={mpPubForm.shortDescription} onChange={(e) => setMpPubForm({ ...mpPubForm, shortDescription: e.target.value })} />
          <label>Full Description</label>
          <textarea value={mpPubForm.fullDescription} onChange={(e) => setMpPubForm({ ...mpPubForm, fullDescription: e.target.value })} />
          <label>Icon (emoji)</label>
          <input value={mpPubForm.icon} onChange={(e) => setMpPubForm({ ...mpPubForm, icon: e.target.value })} style={{ maxWidth: "80px" }} />
          <label>Category</label>
          <select value={mpPubForm.category} onChange={(e) => setMpPubForm({ ...mpPubForm, category: e.target.value })}>
            {["finance", "travel", "shopping", "productivity", "utilities", "lifestyle"].map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <label>Tags (comma-separated)</label>
          <input value={mpPubForm.tags} onChange={(e) => setMpPubForm({ ...mpPubForm, tags: e.target.value })} placeholder="tag1, tag2" />
          <label>Version</label>
          <input value={mpPubForm.version} onChange={(e) => setMpPubForm({ ...mpPubForm, version: e.target.value })} />
          <label>Pricing</label>
          <select value={mpPubForm.pricingType} onChange={(e) => setMpPubForm({ ...mpPubForm, pricingType: e.target.value })}>
            <option value="free">Free</option>
            <option value="one_time">One-time</option>
            <option value="subscription">Subscription</option>
          </select>
          {mpPubForm.pricingType !== "free" && (
            <>
              <label>Price ($)</label>
              <input type="number" value={mpPubForm.price} onChange={(e) => setMpPubForm({ ...mpPubForm, price: e.target.value })} />
            </>
          )}
          {mpPubForm.pricingType === "subscription" && (
            <>
              <label>Interval</label>
              <select value={mpPubForm.priceInterval} onChange={(e) => setMpPubForm({ ...mpPubForm, priceInterval: e.target.value })}>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </>
          )}
          <label>Capabilities (comma-separated tool names)</label>
          <input value={mpPubForm.capabilities} onChange={(e) => setMpPubForm({ ...mpPubForm, capabilities: e.target.value })} placeholder="recommend_payment_strategy, calculate_rewards" />
          <div className="row">
            <button type="button" className="primary" onClick={() => void publishAgent()}>Publish</button>
          </div>
          {mpMsg && <p className="ok" style={{ marginTop: "0.5rem" }}>{mpMsg}</p>}
        </div>
      )}
    </>
  );

  // ── setTab needs to be available ────────────────────────────────────────
  // (using function-level state since this is a component)

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <div>
            <h1>Cards MCP — Control plane</h1>
            <p className="sub">
              Agent marketplace, catalog, wallet, bank API endpoints, OpenAPI tools, and sandbox.
            </p>
          </div>
          <div className="user-badge">
            <div className="user-avatar">{authUser.displayName.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{authUser.displayName}</div>
              <div className="user-role">{authUser.roles.join(", ")}</div>
            </div>
            <button type="button" className="logout-btn" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </header>

      <div className="tabs">
        {allTabs.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "marketplace" && (
        <div className="panel">
          {mpView === "browse" && renderMpBrowse()}
          {mpView === "detail" && renderMpDetail()}
          {mpView === "installed" && renderMpInstalled()}
          {mpView === "publisher" && renderMpPublisher()}
        </div>
      )}

      {tab === "cards" && isAdmin && (
        <>
          <div className="panel">
            <h2>Wallet (MCP-backed)</h2>
            <p className="sub" style={{ marginTop: 0 }}>Logged in as: <strong>{userId}</strong></p>
            {loadErr && <p className="err">{loadErr}</p>}
            <div className="row" style={{ marginBottom: "0.75rem" }}>
              <button type="button" className="primary" onClick={() => void loadCards()}>Refresh wallet</button>
            </div>
            <div className="grid">
              {wallet.map((c) => (
                <div key={c.cardId} className="card-tile">
                  <h3>{c.productName || c.issuer}</h3>
                  <div className="meta">****{c.last4} &middot; {c.network} &middot; {c.tier}</div>
                  {c.features && c.features.length > 0 && (
                    <ul className="features">
                      {c.features.slice(0, 6).map((f) => (
                        <li key={f.name}><strong>{f.name}</strong> &mdash; {f.summary}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Product catalog (reference)</h2>
            <div className="grid">
              {catalog.map((p) => (
                <div key={p.productId} className="card-tile">
                  <h3>{p.displayName}</h3>
                  <div className="meta">{p.issuer} &middot; {p.tier}</div>
                  <p style={{ fontSize: "0.85rem", margin: "0.5rem 0 0" }}>{p.marketingSummary}</p>
                  <p className="meta" style={{ marginTop: "0.35rem" }}>Strong: {p.strongCategories?.join(", ")}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "admin" && isAdmin && (
        <div className="panel">
          <h2>Bank API endpoints (runtime overrides)</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            Values override process env until reset. Set <code>ADMIN_API_TOKEN</code> on the server to require Bearer auth.
          </p>
          <label htmlFor="adm">Admin Bearer token (browser only)</label>
          <input id="adm" type="password" autoComplete="off" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="Matches server ADMIN_API_TOKEN" />
          <div className="row">
            <button type="button" className="secondary" onClick={persistToken}>Save token locally</button>
          </div>
          <label>Card API base URL</label>
          <input value={cardUrl} onChange={(e) => setCardUrl(e.target.value)} />
          <label>Rewards API base URL</label>
          <input value={rewardsUrl} onChange={(e) => setRewardsUrl(e.target.value)} />
          <label>Promo API base URL</label>
          <input value={promoUrl} onChange={(e) => setPromoUrl(e.target.value)} />
          <label>Auth bearer token (runtime)</label>
          <input value={authTok} onChange={(e) => setAuthTok(e.target.value)} placeholder="Optional override" />
          <label>Simulation mode override</label>
          <select value={simMode === "" ? "" : simMode ? "true" : "false"} onChange={(e) => { const v = e.target.value; setSimMode(v === "" ? "" : v === "true"); }}>
            <option value="">(use env default)</option>
            <option value="true">true (mock data)</option>
            <option value="false">false (call real APIs)</option>
          </select>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="primary" onClick={() => void saveAdmin()}>Save overrides</button>
            <button type="button" className="secondary" onClick={() => void resetAdmin()}>Reset overrides</button>
            <button type="button" className="secondary" onClick={() => void pingBank("card")}>Ping card API</button>
            <button type="button" className="secondary" onClick={() => void pingBank("rewards")}>Ping rewards API</button>
            <button type="button" className="secondary" onClick={() => void pingBank("promo")}>Ping promo API</button>
          </div>
          {adminMsg && <pre className="out ok" style={{ marginTop: "0.75rem" }}>{adminMsg}</pre>}
        </div>
      )}

      {tab === "openapi" && isAdmin && (
        <div className="panel">
          <h2>Convert OpenAPI &rarr; MCP tools</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            Upload a spec or paste JSON/YAML, then tools appear as <code>ext_*</code> in <code>/api/tools</code>.
          </p>
          <label>Upload file</label>
          <input type="file" accept=".json,.yaml,.yml" onChange={(e) => void uploadOpenapiFile(e.target.files?.[0] ?? null)} />
          <label>Paste OpenAPI (JSON or YAML)</label>
          <textarea value={rawOpenapi} onChange={(e) => setRawOpenapi(e.target.value)} placeholder="{ openapi: '3.0.3', ... }" />
          <label>Filename when saving paste</label>
          <input value={openapiFilename} onChange={(e) => setOpenapiFilename(e.target.value)} />
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="primary" onClick={() => void uploadOpenapiRaw()}>Save paste &amp; load into MCP</button>
            <button type="button" className="secondary" onClick={() => void reloadOpenapi()}>Reload OpenAPI bundle</button>
            <button type="button" className="secondary" onClick={() => void clearOpenapiUploads()}>Clear uploaded specs</button>
          </div>
          {openapiMsg && <p className="ok">{openapiMsg}</p>}
        </div>
      )}

      {tab === "sandbox" && isAdmin && (
        <div className="panel">
          <h2>Agentic tool sandbox</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            Invokes the same <code>handleToolCall</code> as the MCP server. Runs as user <strong>{userId}</strong>.
          </p>
          <label>Tool name</label>
          <input list="tool-pick" value={toolName} onChange={(e) => setToolName(e.target.value)} />
          <datalist id="tool-pick">
            {tools.map((t) => (
              <option key={t.name} value={t.name}>{t.source}</option>
            ))}
          </datalist>
          <label>Arguments (JSON)</label>
          <textarea value={toolArgs} onChange={(e) => setToolArgs(e.target.value)} spellCheck={false} />
          <div className="row">
            <button type="button" className="primary" onClick={() => void runSandbox()}>Run tool</button>
          </div>
          {sandboxOut && <pre className="out">{sandboxOut}</pre>}
        </div>
      )}

      {tab === "users" && isAdmin && (
        <div className="panel">
          <h2>Platform Users</h2>
          <p className="sub" style={{ marginTop: 0 }}>All registered users and their roles. {platformUsers.length} users total.</p>
          <div className="row" style={{ marginBottom: "0.75rem" }}>
            <button type="button" className="primary" onClick={() => void loadUsers()}>Refresh</button>
          </div>
          <table className="admin-table">
            <thead>
              <tr><th>User ID</th><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th>Last Active</th></tr>
            </thead>
            <tbody>
              {platformUsers.map((u) => (
                <tr key={u.userId}>
                  <td><code>{u.userId}</code></td>
                  <td>{u.displayName}</td>
                  <td>{u.email}</td>
                  <td>
                    {u.roles.map((r) => (
                      <span key={r} className={`role-chip${r === "admin" ? " admin" : ""}`}>{r}</span>
                    ))}
                  </td>
                  <td>
                    <span className={`status-dot ${u.active ? "active" : "inactive"}`} />
                    {u.active ? "Active" : "Inactive"}
                  </td>
                  <td style={{ fontSize: "0.78rem", color: "#5a6480" }}>
                    {new Date(u.lastActiveAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && isAdmin && (
        <div className="panel">
          <h2>Audit Log</h2>
          <p className="sub" style={{ marginTop: 0 }}>RBAC access log showing tool permissions granted, denied, and errors.</p>
          <div className="admin-filters">
            <div>
              <label>Filter by user</label>
              <input value={auditFilterUser} onChange={(e) => setAuditFilterUser(e.target.value)} placeholder="userId" />
            </div>
            <div>
              <label>Action prefix</label>
              <input value={auditFilterAction} onChange={(e) => setAuditFilterAction(e.target.value)} placeholder="e.g. tool:" />
            </div>
            <div>
              <label>Limit</label>
              <input type="number" value={auditLimit} onChange={(e) => setAuditLimit(e.target.value)} style={{ maxWidth: "80px" }} />
            </div>
            <button type="button" className="primary" style={{ alignSelf: "flex-end" }} onClick={() => void loadAudit()}>
              Search
            </button>
          </div>
          {auditEntries.length === 0 ? (
            <p className="mp-empty">No audit entries found. Tool calls will appear here when RBAC is enabled.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Time</th><th>User</th><th>Action</th><th>Result</th></tr>
              </thead>
              <tbody>
                {auditEntries.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontSize: "0.78rem", color: "#5a6480", whiteSpace: "nowrap" }}>
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td><code>{e.userId}</code></td>
                    <td><code>{e.action}</code></td>
                    <td><span className={`audit-result ${e.result}`}>{e.result}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
