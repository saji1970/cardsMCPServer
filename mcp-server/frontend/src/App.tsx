import React, { useCallback, useEffect, useState } from "react";

type Tab = "cards" | "admin" | "openapi" | "sandbox";

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

const ADMIN_KEY = "cards-mcp-admin-token";

function authHeaders(): HeadersInit {
  const t = localStorage.getItem(ADMIN_KEY)?.trim();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

export function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>("cards");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_KEY) ?? "");
  const [wallet, setWallet] = useState<CardRow[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [userId, setUserId] = useState("demo-user");
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
  const [toolArgs, setToolArgs] = useState('{\n  "userId": "demo-user"\n}');
  const [sandboxOut, setSandboxOut] = useState<string>("");

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

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    void fetch("/api/tools")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.tools)) setTools(d.tools);
      })
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    void fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        setCardUrl(d.envDefaults?.cardApiBaseUrl ?? "");
        setRewardsUrl(d.envDefaults?.rewardsApiBaseUrl ?? "");
        setPromoUrl(d.envDefaults?.promoApiBaseUrl ?? "");
      })
      .catch(() => {});
  }, []);

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
    const r = await fetch("/api/admin/config/reset", {
      method: "POST",
      headers: authHeaders(),
    });
    const j = await r.json();
    if (!r.ok) setAdminMsg(j.error || r.statusText);
    else {
      setAdminMsg("Runtime overrides cleared.");
      void fetch("/api/admin/config")
        .then((x) => x.json())
        .then((d) => {
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
    const r = await fetch("/api/admin/openapi/upload", {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
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
    try {
      args = JSON.parse(toolArgs) as Record<string, unknown>;
    } catch (e) {
      setSandboxOut(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    const r = await fetch("/api/sandbox/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: toolName, arguments: args }),
    });
    const j = await r.json();
    setSandboxOut(JSON.stringify(j, null, 2));
  };

  return (
    <div className="app">
      <header>
        <h1>Cards MCP — Control plane</h1>
        <p className="sub">
          Catalog, wallet, bank API endpoints, OpenAPI → MCP tools, and agentic sandbox. Built-in tools match your MCP
          server; <code>ext_*</code> tools come from OpenAPI specs.
        </p>
      </header>

      <div className="tabs">
        {(
          [
            ["cards", "Cards & features"],
            ["admin", "Bank APIs"],
            ["openapi", "OpenAPI → MCP"],
            ["sandbox", "Tool sandbox"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "cards" && (
        <>
          <div className="panel">
            <h2>Wallet (MCP-backed)</h2>
            <label htmlFor="uid">User id</label>
            <input id="uid" value={userId} onChange={(e) => setUserId(e.target.value)} />
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="primary" onClick={() => void loadCards()}>
                Refresh wallet
              </button>
            </div>
            {loadErr && <p className="err">{loadErr}</p>}
            <div className="grid" style={{ marginTop: "1rem" }}>
              {wallet.map((c) => (
                <div key={c.cardId} className="card-tile">
                  <h3>{c.productName || c.issuer}</h3>
                  <div className="meta">
                    ****{c.last4} · {c.network} · {c.tier}
                  </div>
                  {c.features && c.features.length > 0 && (
                    <ul className="features">
                      {c.features.slice(0, 6).map((f) => (
                        <li key={f.name}>
                          <strong>{f.name}</strong> — {f.summary}
                        </li>
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
                  <div className="meta">
                    {p.issuer} · {p.tier}
                  </div>
                  <p style={{ fontSize: "0.85rem", margin: "0.5rem 0 0" }}>{p.marketingSummary}</p>
                  <p className="meta" style={{ marginTop: "0.35rem" }}>
                    Strong: {p.strongCategories?.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "admin" && (
        <div className="panel">
          <h2>Bank API endpoints (runtime overrides)</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            Values override process env until reset. Used by the same adapters as the MCP server. Set{" "}
            <code>ADMIN_API_TOKEN</code> on the server to require Bearer auth for these actions.
          </p>
          <label htmlFor="adm">Admin Bearer token (browser only)</label>
          <input
            id="adm"
            type="password"
            autoComplete="off"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Matches server ADMIN_API_TOKEN"
          />
          <div className="row">
            <button type="button" className="secondary" onClick={persistToken}>
              Save token locally
            </button>
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
          <select
            value={simMode === "" ? "" : simMode ? "true" : "false"}
            onChange={(e) => {
              const v = e.target.value;
              setSimMode(v === "" ? "" : v === "true");
            }}
          >
            <option value="">(use env default)</option>
            <option value="true">true (mock data)</option>
            <option value="false">false (call real APIs)</option>
          </select>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="primary" onClick={() => void saveAdmin()}>
              Save overrides
            </button>
            <button type="button" className="secondary" onClick={() => void resetAdmin()}>
              Reset overrides
            </button>
            <button type="button" className="secondary" onClick={() => void pingBank("card")}>
              Ping card API
            </button>
            <button type="button" className="secondary" onClick={() => void pingBank("rewards")}>
              Ping rewards API
            </button>
            <button type="button" className="secondary" onClick={() => void pingBank("promo")}>
              Ping promo API
            </button>
          </div>
          {adminMsg && <pre className="out ok" style={{ marginTop: "0.75rem" }}>{adminMsg}</pre>}
        </div>
      )}

      {tab === "openapi" && (
        <div className="panel">
          <h2>Convert OpenAPI → MCP tools</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            Upload a spec or paste JSON/YAML, then tools appear as <code>ext_*</code> in <code>/api/tools</code> and in
            Cursor if you restart the stdio server with matching paths. On this HTTP server, reload applies immediately.
          </p>
          <label>Upload file</label>
          <input type="file" accept=".json,.yaml,.yml" onChange={(e) => void uploadOpenapiFile(e.target.files?.[0] ?? null)} />
          <label>Paste OpenAPI (JSON or YAML)</label>
          <textarea value={rawOpenapi} onChange={(e) => setRawOpenapi(e.target.value)} placeholder="{ openapi: '3.0.3', ... }" />
          <label>Filename when saving paste</label>
          <input value={openapiFilename} onChange={(e) => setOpenapiFilename(e.target.value)} />
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="primary" onClick={() => void uploadOpenapiRaw()}>
              Save paste &amp; load into MCP
            </button>
            <button type="button" className="secondary" onClick={() => void reloadOpenapi()}>
              Reload OpenAPI bundle
            </button>
            <button type="button" className="secondary" onClick={() => void clearOpenapiUploads()}>
              Clear uploaded specs
            </button>
          </div>
          {openapiMsg && <p className="ok">{openapiMsg}</p>}
        </div>
      )}

      {tab === "sandbox" && (
        <div className="panel">
          <h2>Agentic tool sandbox</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            Invokes the same <code>handleToolCall</code> as the MCP server. Response shape matches MCP tool results
            (JSON text content).
          </p>
          <label>Tool name</label>
          <input list="tool-pick" value={toolName} onChange={(e) => setToolName(e.target.value)} />
          <datalist id="tool-pick">
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.source}
              </option>
            ))}
          </datalist>
          <label>Arguments (JSON)</label>
          <textarea value={toolArgs} onChange={(e) => setToolArgs(e.target.value)} spellCheck={false} />
          <div className="row">
            <button type="button" className="primary" onClick={() => void runSandbox()}>
              Run tool
            </button>
          </div>
          {sandboxOut && <pre className="out">{sandboxOut}</pre>}
        </div>
      )}
    </div>
  );
}
