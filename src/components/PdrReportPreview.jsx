import React from "react";

const strategyLabels = {
  value_creation:         "Value Creation Strategy",
  capital_adjustment:     "Capital Adjustment Strategy",
  location_expansion:     "Location Expansion Strategy",
  property_configuration: "Property Configuration Strategy",
  subdivision:            "Subdivision Strategy",
  ancillary_dwelling:     "Ancillary Dwelling Strategy",
};

function fmtMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(num);
}

function valOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : value;
}

export default function PdrReportPreview({ report }) {
  if (!report) return null;

  const {
    clientName,
    suburbSummary,
    propertyTypeSummary,
    bedroomSummary,
    livingSummary,
    budgetDisplay,
    outcomeSummary,

    locations,
    propertyTypes,
    bedrooms,
    bathrooms,
    purpose,
    rentalYield,

    heroStatement,
    viabilitySummary,

    positioningIntro,
    entryPoint,
    budgetMarker,
    premiumPoint,
    positioningLegend,
    entryDescription,
    coreRange,
    coreDescription,
    premiumDescription,

    salesIntro,
    salesExamples = [],
    strategies = [],
    pathwaysIntro,
    pathways = [],
    salesRows = [],
    salesNote,
    finalStatement,
  } = report;

  const hasPositioning  = entryPoint || premiumPoint;
  const hasSalesExamples = salesExamples.length > 0;
  const hasPathways     = pathways.length > 0;
  const hasFinalStatement = finalStatement;

  return (
    <div className="pdr-preview">
      <style>{`
        .pdr-preview {
          --primary: #2c3e50;
          --primary-2: #22313f;
          --text: #1f2933;
          --muted: #6b7280;
          --line: #d9e0e7;
          --soft: #f4f6f8;
          --white: #ffffff;
          --shadow: 0 10px 30px rgba(20, 31, 43, 0.08);
          color: var(--text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          line-height: 1.45;
        }

        .pdr-report {
          max-width: 1100px;
          margin: 0 auto;
          background: var(--white);
          border-radius: 28px;
          overflow: hidden;
          box-shadow: var(--shadow);
          border: 1px solid #e5ebf0;
        }

        .pdr-hero {
          background: linear-gradient(180deg, var(--primary) 0%, var(--primary-2) 100%);
          color: var(--white);
          padding: 40px 44px 48px;
        }

        .pdr-hero-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 36px;
        }

        .pdr-logo {
          height: 42px;
          width: auto;
          display: block;
          object-fit: contain;
        }

        .pdr-hero-grid {
          display: grid;
          grid-template-columns: 1.4fr 0.8fr;
          gap: 32px;
          align-items: end;
        }

        .pdr-kicker {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          opacity: 0.78;
          margin-bottom: 18px;
        }

        .pdr-hero h1 {
          margin: 0 0 14px;
          font-size: clamp(34px, 5vw, 54px);
          line-height: 0.98;
          letter-spacing: -0.04em;
        }

        .pdr-hero-sub {
          margin: 0;
          font-size: 15px;
          color: rgba(255,255,255,0.82);
          max-width: 680px;
        }

        .pdr-hero-meta {
          display: grid;
          gap: 12px;
          justify-self: end;
          width: min(100%, 320px);
        }

        .pdr-meta-card {
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 18px;
          padding: 16px 18px;
          background: rgba(255,255,255,0.05);
        }

        .pdr-meta-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          opacity: 0.7;
          margin-bottom: 6px;
        }

        .pdr-meta-value {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .pdr-section {
          padding: 34px 44px;
          border-top: 1px solid #edf1f4;
        }

        .pdr-section-soft {
          background: var(--soft);
        }

        .pdr-section-dark {
          background: var(--primary);
          color: var(--white);
          border-top: 0;
        }

        .pdr-eyebrow {
          display: inline-block;
          margin-bottom: 12px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--primary);
        }

        .pdr-section-dark .pdr-eyebrow {
          color: rgba(255,255,255,0.72);
        }

        .pdr-title {
          margin: 0 0 8px;
          font-size: 30px;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }

        .pdr-intro {
          margin: 0;
          max-width: 760px;
          font-size: 16px;
          color: var(--muted);
        }

        .pdr-section-dark .pdr-intro,
        .pdr-section-dark p,
        .pdr-section-dark li {
          color: rgba(255,255,255,0.86);
        }

        .pdr-statement-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 30px;
          align-items: stretch;
        }

        .pdr-card,
        .pdr-brief,
        .pdr-stat,
        .pdr-sale,
        .pdr-pathway,
        .pdr-final {
          background: var(--white);
          border: 1px solid var(--line);
          border-radius: 24px;
        }

        .pdr-card {
          padding: 28px;
        }

        .pdr-card h2 {
          margin: 0 0 14px;
          font-size: clamp(26px, 3vw, 38px);
          line-height: 1.04;
          letter-spacing: -0.03em;
          color: var(--primary);
        }

        .pdr-card p {
          margin: 0;
          color: var(--muted);
          font-size: 16px;
        }

        .pdr-brief {
          background: #f8fafb;
          padding: 24px;
        }

        .pdr-brief-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px 22px;
          margin-top: 12px;
        }

        .pdr-brief-label {
          display: block;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 6px;
          font-weight: 700;
        }

        .pdr-brief-value {
          font-size: 17px;
          font-weight: 700;
          color: var(--primary);
          letter-spacing: -0.02em;
        }

        .pdr-bar-wrap {
          margin-top: 28px;
          padding: 30px 28px 26px;
          border-radius: 24px;
          background: linear-gradient(180deg, #ffffff 0%, #f7f9fb 100%);
          border: 1px solid var(--line);
        }

        .pdr-bar-scale {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          font-size: 14px;
          font-weight: 700;
          color: var(--primary);
          margin-bottom: 16px;
        }

        .pdr-bar {
          position: relative;
          height: 10px;
          border-radius: 999px;
          background: #d9e2ea;
          overflow: visible;
        }

        .pdr-bar-fill {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #93a5b4 0%, var(--primary) 72%, #1c2936 100%);
          opacity: 0.95;
        }

        .pdr-marker {
          position: absolute;
          left: 57%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--white);
          border: 5px solid var(--primary);
          box-shadow: 0 0 0 6px rgba(44, 62, 80, 0.12);
        }

        .pdr-bar-legend {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-top: 16px;
          flex-wrap: wrap;
        }

        .pdr-legend-note {
          font-size: 14px;
          color: var(--muted);
        }

        .pdr-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(44, 62, 80, 0.08);
          color: var(--primary);
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .pdr-stats,
        .pdr-sales-grid,
        .pdr-pathways,
        .pdr-strategy-metrics {
          display: grid;
          gap: 18px;
        }

        .pdr-stats {
          grid-template-columns: repeat(3, 1fr);
          margin-top: 28px;
        }

        .pdr-stat {
          padding: 22px;
        }

        .pdr-stat-label {
          font-size: 11px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 700;
          margin-bottom: 10px;
        }

        .pdr-stat-value {
          font-size: clamp(26px, 4vw, 40px);
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--primary);
          line-height: 1;
          margin-bottom: 8px;
        }

        .pdr-stat-desc {
          color: var(--muted);
          font-size: 14px;
        }

        .pdr-sales-grid {
          grid-template-columns: repeat(3, 1fr);
          margin-top: 28px;
        }

        .pdr-sale {
          padding: 22px;
          min-height: 188px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .pdr-sale-address {
          font-size: 22px;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: var(--primary);
          margin: 0 0 12px;
        }

        .pdr-sale-meta {
          margin: 0 0 18px;
          color: var(--muted);
          font-size: 15px;
        }

        .pdr-sale-price {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--primary);
        }

        .pdr-strategy-grid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 24px;
          margin-top: 28px;
          align-items: start;
        }

        .pdr-strategy-callout {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 24px;
          padding: 24px;
        }

        .pdr-strategy-callout h3 {
          margin: 0 0 12px;
          font-size: 28px;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: var(--white);
        }

        .pdr-strategy-callout p {
          margin: 0;
          font-size: 16px;
        }

        .pdr-strategy-metrics {
          grid-template-columns: repeat(3, 1fr);
        }

        .pdr-metric {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 22px;
          padding: 20px;
        }

        .pdr-metric-label {
          font-size: 11px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.7);
          font-weight: 700;
          margin-bottom: 10px;
        }

        .pdr-metric-value {
          font-size: clamp(24px, 4vw, 38px);
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--white);
          line-height: 1.02;
          margin-bottom: 8px;
        }

        .pdr-metric-desc {
          font-size: 14px;
          color: rgba(255,255,255,0.8);
        }

        .pdr-bullets {
          margin: 20px 0 0;
          padding-left: 18px;
        }

        .pdr-bullets li + li {
          margin-top: 10px;
        }

        .pdr-pathways {
          grid-template-columns: repeat(3, 1fr);
          margin-top: 26px;
        }

        .pdr-pathway {
          padding: 22px;
        }

        .pdr-pathway h3 {
          margin: 0 0 14px;
          font-size: 24px;
          line-height: 1.06;
          letter-spacing: -0.03em;
          color: var(--primary);
        }

        .pdr-pathway ul {
          margin: 0;
          padding-left: 18px;
          color: var(--muted);
        }

        .pdr-pathway li + li {
          margin-top: 8px;
        }

        .pdr-table-wrap {
          margin-top: 24px;
          overflow-x: auto;
          border: 1px solid var(--line);
          border-radius: 20px;
          background: var(--white);
        }

        .pdr-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 720px;
        }

        .pdr-table thead th {
          background: var(--primary);
          color: var(--white);
          text-align: left;
          padding: 16px 18px;
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 700;
          white-space: nowrap;
        }

        .pdr-table tbody td {
          padding: 16px 18px;
          border-top: 1px solid #edf1f4;
          font-size: 15px;
          color: var(--text);
          vertical-align: middle;
          white-space: nowrap;
        }

        .pdr-table tbody tr:nth-child(even) {
          background: #fafcfd;
        }

        .pdr-final {
          padding: 28px;
          margin-top: 14px;
          background: #f8fafb;
        }

        .pdr-final p {
          margin: 0;
          font-size: clamp(24px, 3vw, 36px);
          line-height: 1.08;
          letter-spacing: -0.03em;
          color: var(--primary);
          font-weight: 800;
        }

        .pdr-note {
          margin-top: 14px;
          font-size: 13px;
          color: var(--muted);
        }

        @media (max-width: 960px) {
          .pdr-hero-grid,
          .pdr-statement-grid,
          .pdr-strategy-grid,
          .pdr-stats,
          .pdr-sales-grid,
          .pdr-pathways,
          .pdr-strategy-metrics {
            grid-template-columns: 1fr;
          }

          .pdr-hero-meta {
            justify-self: stretch;
            width: 100%;
          }

          .pdr-brief-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="pdr-report">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="pdr-hero">
          <div className="pdr-hero-top">
            <img className="pdr-logo" src="/No BG, Light Text.png" alt="Fulcrum Australia logo" />
          </div>

          <div className="pdr-hero-grid">
            <div>
              <div className="pdr-kicker">Price Discovery Report</div>
              <h1>{valOrDash(clientName)}</h1>
              <p className="pdr-hero-sub">
                {valOrDash(suburbSummary)} · {valOrDash(propertyTypeSummary)} · {valOrDash(bedroomSummary)} · {valOrDash(livingSummary)}
              </p>
            </div>

            <div className="pdr-hero-meta">
              <div className="pdr-meta-card">
                <div className="pdr-meta-label">Budget</div>
                <div className="pdr-meta-value">{valOrDash(budgetDisplay)}</div>
              </div>
              <div className="pdr-meta-card">
                <div className="pdr-meta-label">Report Outcome</div>
                <div className="pdr-meta-value">{valOrDash(outcomeSummary)}</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Position Summary + Submitted Brief ──────────────────────────── */}
        <section className="pdr-section">
          <div className="pdr-statement-grid">
            <div className="pdr-card">
              <span className="pdr-eyebrow">Position Summary</span>
              <h2>{valOrDash(heroStatement)}</h2>
              <p>{valOrDash(viabilitySummary)}</p>
            </div>

            <div className="pdr-brief">
              <span className="pdr-eyebrow">Submitted Brief</span>
              <div className="pdr-brief-grid">
                <div>
                  <span className="pdr-brief-label">Location</span>
                  <span className="pdr-brief-value">{valOrDash(locations)}</span>
                </div>
                <div>
                  <span className="pdr-brief-label">Property Type</span>
                  <span className="pdr-brief-value">{valOrDash(propertyTypes)}</span>
                </div>
                <div>
                  <span className="pdr-brief-label">Bedrooms</span>
                  <span className="pdr-brief-value">{valOrDash(bedrooms)}</span>
                </div>
                <div>
                  <span className="pdr-brief-label">Bathrooms</span>
                  <span className="pdr-brief-value">{valOrDash(bathrooms)}</span>
                </div>
                <div>
                  <span className="pdr-brief-label">Purpose</span>
                  <span className="pdr-brief-value">{valOrDash(purpose)}</span>
                </div>
                <div>
                  <span className="pdr-brief-label">Rental Yield</span>
                  <span className="pdr-brief-value">{valOrDash(rentalYield)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Market Positioning — only when narrative fields are present ─── */}
        {hasPositioning && (
          <section className="pdr-section pdr-section-soft">
            <span className="pdr-eyebrow">Market Positioning</span>
            <h2 className="pdr-title">Where your budget sits</h2>
            <p className="pdr-intro">{valOrDash(positioningIntro)}</p>

            <div className="pdr-bar-wrap">
              <div className="pdr-bar-scale">
                <span>{valOrDash(entryPoint)}</span>
                <span>{valOrDash(budgetMarker)}</span>
                <span>{valOrDash(premiumPoint)}</span>
              </div>
              <div className="pdr-bar">
                <div className="pdr-bar-fill"></div>
                <div className="pdr-marker"></div>
              </div>
              <div className="pdr-bar-legend">
                <div className="pdr-legend-note">{valOrDash(positioningLegend)}</div>
                <div className="pdr-pill">You are here</div>
              </div>
            </div>

            <div className="pdr-stats">
              <div className="pdr-stat">
                <div className="pdr-stat-label">Entry Point</div>
                <div className="pdr-stat-value">{valOrDash(entryPoint)}</div>
                <div className="pdr-stat-desc">{valOrDash(entryDescription)}</div>
              </div>
              <div className="pdr-stat">
                <div className="pdr-stat-label">Core Market</div>
                <div className="pdr-stat-value">{valOrDash(coreRange)}</div>
                <div className="pdr-stat-desc">{valOrDash(coreDescription)}</div>
              </div>
              <div className="pdr-stat">
                <div className="pdr-stat-label">Premium</div>
                <div className="pdr-stat-value">{valOrDash(premiumPoint)}</div>
                <div className="pdr-stat-desc">{valOrDash(premiumDescription)}</div>
              </div>
            </div>
          </section>
        )}

        {/* ── Market Examples — only when salesExamples are present ─────── */}
        {hasSalesExamples && (
          <section className="pdr-section">
            <span className="pdr-eyebrow">Market Examples</span>
            <h2 className="pdr-title">Recent sales shaping this report</h2>
            <p className="pdr-intro">{valOrDash(salesIntro)}</p>

            <div className="pdr-sales-grid">
              {salesExamples.slice(0, 3).map((sale, idx) => (
                <article className="pdr-sale" key={idx}>
                  <div>
                    <h3 className="pdr-sale-address">{valOrDash(sale.address)}</h3>
                    <p className="pdr-sale-meta">{valOrDash(sale.meta)}</p>
                  </div>
                  <p className="pdr-sale-price">{valOrDash(sale.price)}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── Strategy modules — one dark section per strategy ─────────── */}
        {strategies.map((strategy, idx) => (
          <section className="pdr-section pdr-section-dark" key={strategy.id || idx}>
            <span className="pdr-eyebrow">
              {strategyLabels[strategy.strategyType] || strategy.strategyType || "Strategic Pathway"}
            </span>
            <h2 className="pdr-title">{valOrDash(strategy.headline)}</h2>
            <p className="pdr-intro">{valOrDash(strategy.summary)}</p>

            <div className="pdr-strategy-grid">
              <div className="pdr-strategy-callout">
                <h3>{valOrDash(strategy.headline)}</h3>
                <p>{valOrDash(strategy.summary)}</p>

                {Array.isArray(strategy.bullets) && strategy.bullets.length > 0 && (
                  <ul className="pdr-bullets">
                    {strategy.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pdr-strategy-metrics">
                <div className="pdr-metric">
                  <div className="pdr-metric-label">Target Purchase</div>
                  <div className="pdr-metric-value">{fmtMoney(strategy.targetPurchasePrice)}</div>
                </div>
                <div className="pdr-metric">
                  <div className="pdr-metric-label">Capital / Works</div>
                  <div className="pdr-metric-value">{fmtMoney(strategy.budgetAmount)}</div>
                </div>
                <div className="pdr-metric">
                  <div className="pdr-metric-label">Projected End Value</div>
                  <div className="pdr-metric-value">{fmtMoney(strategy.projectedEndValue)}</div>
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* ── Strategic Pathways narrative — only when present ──────────── */}
        {hasPathways && (
          <section className="pdr-section pdr-section-soft">
            <span className="pdr-eyebrow">Strategic Pathways</span>
            <h2 className="pdr-title">The available ways forward</h2>
            <p className="pdr-intro">{valOrDash(pathwaysIntro)}</p>

            <div className="pdr-pathways">
              {pathways.slice(0, 3).map((pathway, idx) => (
                <article className="pdr-pathway" key={idx}>
                  <h3>{valOrDash(pathway.title)}</h3>
                  <ul>
                    {(pathway.points || []).map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── Underlying Sales Data ─────────────────────────────────────── */}
        <section className="pdr-section">
          <span className="pdr-eyebrow">Underlying Sales Data</span>
          <h2 className="pdr-title">Supporting market evidence</h2>
          <p className="pdr-intro">
            The following rows appear in the order provided and reflect the underlying sales data used to support this report.
          </p>

          <div className="pdr-table-wrap">
            <table className="pdr-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Sale Price</th>
                  <th>Sale Date</th>
                  <th>Bedrooms</th>
                  <th>Bathrooms</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.length > 0 ? (
                  salesRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{valOrDash(row.address)}</td>
                      <td>{valOrDash(row.salePrice)}</td>
                      <td>{valOrDash(row.saleDate)}</td>
                      <td>{valOrDash(row.bedrooms)}</td>
                      <td>{valOrDash(row.bathrooms)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ color: "#aaa", fontStyle: "italic" }}>
                      No sales data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {salesNote && <p className="pdr-note">{salesNote}</p>}
        </section>

        {/* ── Final Position — only when present ───────────────────────── */}
        {hasFinalStatement && (
          <section className="pdr-section">
            <span className="pdr-eyebrow">Final Position</span>
            <div className="pdr-final">
              <p>{finalStatement}</p>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
