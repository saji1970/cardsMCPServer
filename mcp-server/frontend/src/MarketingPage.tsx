import React from "react";

type MarketingPageProps = {
  onSignIn: () => void;
  onRegister: () => void;
};

export function MarketingPage({ onSignIn, onRegister }: MarketingPageProps): React.ReactElement {
  return (
    <div className="marketing">
      <header className="marketing-nav">
        <div className="marketing-nav-inner">
          <span className="marketing-logo">Cards MCP</span>
          <div className="marketing-nav-actions">
            <button type="button" className="secondary" onClick={onSignIn}>
              Sign in
            </button>
            <button type="button" className="primary" onClick={onRegister}>
              Create account
            </button>
          </div>
        </div>
      </header>

      <section className="marketing-hero">
        <div className="marketing-hero-inner">
          <p className="marketing-eyebrow">Card intelligence platform</p>
          <h1 className="marketing-title">
            Power payment agents, banks, and advisors with one MCP gateway
          </h1>
          <p className="marketing-lead">
            Expose card catalogs, reward math, and issuer APIs to shopping bots, financial copilots, and internal tools.
            Streamable HTTP MCP, API keys, multi-bank connections, and a built-in agent marketplace.
          </p>
          <div className="marketing-cta">
            <button type="button" className="primary marketing-cta-primary" onClick={onSignIn}>
              Sign in to dashboard
            </button>
            <button type="button" className="secondary marketing-cta-secondary" onClick={onRegister}>
              Get started
            </button>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <h2>Built for sales &amp; partnerships</h2>
        <p className="marketing-section-lead">
          Pitch a single integration story: issuers onboard via <code>/api/banks</code>, external developers copy <code>/mcp-config</code> into Cursor or Claude,
          and your team runs the control plane from one place.
        </p>
        <ul className="marketing-grid">
          <li className="marketing-card">
            <h3>Issuers &amp; banks</h3>
            <p>Register multiple bank connections, push card products (rewards, APR, bonuses), and ping each environment.</p>
          </li>
          <li className="marketing-card">
            <h3>Agent developers</h3>
            <p>Toolsets, subscription tiers, and MCP config export—like RapidAPI copy-paste for AI clients.</p>
          </li>
          <li className="marketing-card">
            <h3>Your GTM</h3>
            <p>Agent marketplace for discovery, reviews, and installs—ready for demo to prospects and partners.</p>
          </li>
        </ul>
      </section>

      <footer className="marketing-footer">
        <p>Cards MCP — connect card data to the agent economy.</p>
        <button type="button" className="marketing-footer-link" onClick={onSignIn}>
          Sign in
        </button>
      </footer>
    </div>
  );
}
