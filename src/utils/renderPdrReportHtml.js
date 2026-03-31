// ── renderPdrReportHtml ───────────────────────────────────────────────────────
// Converts a buildPdrReportData() output object into a complete standalone HTML
// document string. Export-safe: no React, no app CSS, no runtime JS required.
// All user/staff content is HTML-escaped before interpolation.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function v(value) {
  return (value == null || value === '') ? '—' : esc(String(value));
}

function fmtMoney(value) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return esc(String(value));
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(num);
}

const STRATEGY_LABELS = {
  value_creation:         'Value Creation Strategy',
  capital_adjustment:     'Capital Adjustment Strategy',
  location_expansion:     'Location Expansion Strategy',
  property_configuration: 'Property Configuration Strategy',
  subdivision:            'Subdivision Strategy',
  ancillary_dwelling:     'Ancillary Dwelling Strategy',
};

// ---------------------------------------------------------------------------
// CSS — export-safe, print-oriented, no app shell dependencies
// ---------------------------------------------------------------------------
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --primary: #2c3e50;
    --primary-2: #22313f;
    --text: #1f2933;
    --muted: #6b7280;
    --line: #d9e0e7;
    --soft: #f4f6f8;
    --white: #ffffff;
  }

  body {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.45;
    color: var(--text);
    background: #f0f2f5;
  }

  .report {
    max-width: 1100px;
    margin: 0 auto;
    background: var(--white);
    border-radius: 28px;
    overflow: hidden;
    border: 1px solid #e5ebf0;
  }

  /* ── Hero ── */
  .hero {
    background: linear-gradient(180deg, var(--primary) 0%, var(--primary-2) 100%);
    color: var(--white);
    padding: 40px 44px 48px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .hero-top {
    margin-bottom: 36px;
  }

  .logo {
    height: 40px;
    width: auto;
    display: block;
    object-fit: contain;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: 1.4fr 0.8fr;
    gap: 32px;
    align-items: end;
  }

  .kicker {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.78;
    margin-bottom: 18px;
  }

  .hero h1 {
    font-size: 48px;
    line-height: 0.98;
    letter-spacing: -0.04em;
    margin-bottom: 14px;
    color: var(--white);
  }

  .hero-sub {
    font-size: 15px;
    color: rgba(255,255,255,0.82);
    max-width: 680px;
  }

  .hero-meta {
    display: grid;
    gap: 12px;
  }

  .meta-card {
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 18px;
    padding: 16px 18px;
    background: rgba(255,255,255,0.05);
  }

  .meta-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    opacity: 0.7;
    margin-bottom: 6px;
    color: var(--white);
  }

  .meta-value {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--white);
  }

  /* ── Sections ── */
  .section {
    padding: 34px 44px;
    border-top: 1px solid #edf1f4;
  }

  .section-soft {
    background: var(--soft);
  }

  .section-dark {
    background: var(--primary);
    color: var(--white);
    border-top: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .eyebrow {
    display: inline-block;
    margin-bottom: 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--primary);
  }

  .section-dark .eyebrow {
    color: rgba(255,255,255,0.72);
  }

  .section-title {
    font-size: 30px;
    line-height: 1.05;
    letter-spacing: -0.03em;
    margin-bottom: 8px;
  }

  .intro {
    max-width: 760px;
    font-size: 16px;
    color: var(--muted);
  }

  .section-dark .intro,
  .section-dark p,
  .section-dark li {
    color: rgba(255,255,255,0.86);
  }

  /* ── Position summary + brief ── */
  .statement-grid {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 30px;
    align-items: stretch;
  }

  .card {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 24px;
    padding: 28px;
  }

  .card h2 {
    font-size: 34px;
    line-height: 1.04;
    letter-spacing: -0.03em;
    color: var(--primary);
    margin-bottom: 14px;
  }

  .card p {
    color: var(--muted);
    font-size: 16px;
  }

  .brief {
    background: #f8fafb;
    border: 1px solid var(--line);
    border-radius: 24px;
    padding: 24px;
  }

  .brief-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px 22px;
    margin-top: 12px;
  }

  .brief-label {
    display: block;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
    font-weight: 700;
  }

  .brief-value {
    font-size: 17px;
    font-weight: 700;
    color: var(--primary);
    letter-spacing: -0.02em;
  }

  /* ── Strategy ── */
  .strategy-grid {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 24px;
    margin-top: 28px;
    align-items: start;
  }

  .strategy-callout {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 24px;
    padding: 24px;
  }

  .strategy-callout h3 {
    font-size: 26px;
    line-height: 1.05;
    letter-spacing: -0.03em;
    color: var(--white);
    margin-bottom: 12px;
  }

  .strategy-metrics {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .metric {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 22px;
    padding: 20px;
  }

  .metric-label {
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.7);
    font-weight: 700;
    margin-bottom: 10px;
  }

  .metric-value {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: var(--white);
    line-height: 1.02;
    margin-bottom: 8px;
  }

  /* ── Sales table ── */
  .table-wrap {
    margin-top: 24px;
    border: 1px solid var(--line);
    border-radius: 20px;
    overflow: hidden;
    background: var(--white);
  }

  .sales-table {
    width: 100%;
    border-collapse: collapse;
  }

  .sales-table thead th {
    background: var(--primary);
    color: var(--white);
    text-align: left;
    padding: 14px 18px;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 700;
    white-space: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sales-table tbody td {
    padding: 14px 18px;
    border-top: 1px solid #edf1f4;
    font-size: 15px;
    color: var(--text);
    vertical-align: middle;
  }

  .sales-table tbody tr:nth-child(even) {
    background: #fafcfd;
  }

  .empty-cell {
    color: #aaa;
    font-style: italic;
  }

  /* ── Final statement ── */
  .final-box {
    background: #f8fafb;
    border: 1px solid var(--line);
    border-radius: 24px;
    padding: 28px;
    margin-top: 14px;
  }

  .final-box p {
    font-size: 32px;
    line-height: 1.08;
    letter-spacing: -0.03em;
    color: var(--primary);
    font-weight: 800;
  }

  .note {
    margin-top: 14px;
    font-size: 13px;
    color: var(--muted);
  }

  @media print {
    body { margin: 0; background: var(--white); }
    .report { border-radius: 0; border: none; box-shadow: none; }
    .hero, .section-dark, .sales-table thead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export default function renderPdrReportHtml(report, { logoUrl } = {}) {
  if (!report) return '';

  const {
    clientName       = '',
    suburbSummary    = '',
    propertyTypeSummary = '',
    bedroomSummary   = '',
    livingSummary    = '',
    budgetDisplay    = '',
    outcomeSummary   = '',

    locations        = '',
    propertyTypes    = '',
    bedrooms         = '',
    bathrooms        = '',
    purpose          = '',
    rentalYield      = '',

    heroStatement    = '',
    viabilitySummary = '',

    entryPoint       = '',
    premiumPoint     = '',

    salesExamples    = [],
    strategies       = [],
    pathways         = [],
    salesRows        = [],
    salesNote        = '',
    finalStatement   = '',
  } = report;

  const hasPositioning   = entryPoint || premiumPoint;
  const hasSalesExamples = salesExamples.length > 0;
  const hasPathways      = pathways.length > 0;
  const hasFinalStatement = !!finalStatement;

  // ── Logo ─────────────────────────────────────────────────────────────────
  const logoHtml = (logoUrl && logoUrl.trim())
    ? `<img class="logo" src="${esc(logoUrl)}" alt="Fulcrum Australia" />`
    : '';

  // ── Hero sub-line ─────────────────────────────────────────────────────────
  const heroSubParts = [suburbSummary, propertyTypeSummary, bedroomSummary, livingSummary]
    .filter(Boolean)
    .map(esc)
    .join(' · ');

  // ── Strategies ───────────────────────────────────────────────────────────
  const strategiesHtml = strategies.map(s => {
    const label = esc(STRATEGY_LABELS[s.strategyType] || s.strategyType || 'Strategic Pathway');
    return `
    <section class="section section-dark">
      <span class="eyebrow">${label}</span>
      <h2 class="section-title">${v(s.headline)}</h2>
      <p class="intro">${v(s.summary)}</p>
      <div class="strategy-grid">
        <div class="strategy-callout">
          <h3>${v(s.headline)}</h3>
          <p>${v(s.summary)}</p>
        </div>
        <div class="strategy-metrics">
          <div class="metric">
            <div class="metric-label">Target Purchase</div>
            <div class="metric-value">${fmtMoney(s.targetPurchasePrice)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Capital / Works</div>
            <div class="metric-value">${fmtMoney(s.budgetAmount)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Projected End Value</div>
            <div class="metric-value">${fmtMoney(s.projectedEndValue)}</div>
          </div>
        </div>
      </div>
    </section>`;
  }).join('');

  // ── Sales table rows ──────────────────────────────────────────────────────
  const salesTableBody = salesRows.length > 0
    ? salesRows.map(row => `
        <tr>
          <td>${v(row.address)}</td>
          <td>${v(row.salePrice)}</td>
          <td>${v(row.saleDate)}</td>
          <td>${row.bedrooms != null ? esc(String(row.bedrooms)) : '—'}</td>
          <td>${row.bathrooms != null ? esc(String(row.bathrooms)) : '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty-cell">No sales data available yet.</td></tr>`;

  // ── Market Positioning ────────────────────────────────────────────────────
  const positioningHtml = hasPositioning ? `
    <section class="section section-soft">
      <span class="eyebrow">Market Positioning</span>
      <h2 class="section-title">Where your budget sits</h2>
    </section>` : '';

  // ── Market Examples ───────────────────────────────────────────────────────
  const salesExamplesHtml = hasSalesExamples ? `
    <section class="section">
      <span class="eyebrow">Market Examples</span>
      <h2 class="section-title">Recent sales shaping this report</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:24px;">
        ${salesExamples.slice(0, 3).map(sale => `
          <div class="card" style="min-height:180px;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <p style="font-size:20px;font-weight:800;letter-spacing:-0.03em;color:var(--primary);margin-bottom:10px;">${v(sale.address)}</p>
              <p style="color:var(--muted);font-size:14px;margin-bottom:16px;">${v(sale.meta)}</p>
            </div>
            <p style="font-size:24px;font-weight:800;letter-spacing:-0.03em;color:var(--primary);">${v(sale.price)}</p>
          </div>`).join('')}
      </div>
    </section>` : '';

  // ── Strategic Pathways ────────────────────────────────────────────────────
  const pathwaysHtml = hasPathways ? `
    <section class="section section-soft">
      <span class="eyebrow">Strategic Pathways</span>
      <h2 class="section-title">The available ways forward</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:24px;">
        ${pathways.slice(0, 3).map(pw => `
          <div class="card">
            <h3 style="font-size:22px;letter-spacing:-0.03em;color:var(--primary);margin-bottom:12px;">${v(pw.title)}</h3>
            <ul style="padding-left:18px;color:var(--muted);">
              ${(pw.points || []).map(pt => `<li style="margin-bottom:8px;">${v(pt)}</li>`).join('')}
            </ul>
          </div>`).join('')}
      </div>
    </section>` : '';

  // ── Final Statement ───────────────────────────────────────────────────────
  const finalHtml = hasFinalStatement ? `
    <section class="section">
      <span class="eyebrow">Final Position</span>
      <div class="final-box">
        <p>${v(finalStatement)}</p>
      </div>
    </section>` : '';

  // ── Assemble ──────────────────────────────────────────────────────────────
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDR — ${esc(clientName)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="report">

    <section class="hero">
      <div class="hero-top">${logoHtml}</div>
      <div class="hero-grid">
        <div>
          <div class="kicker">Price Discovery Report</div>
          <h1>${v(clientName)}</h1>
          <p class="hero-sub">${heroSubParts || '—'}</p>
        </div>
        <div class="hero-meta">
          <div class="meta-card">
            <div class="meta-label">Budget</div>
            <div class="meta-value">${v(budgetDisplay)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Report Outcome</div>
            <div class="meta-value">${v(outcomeSummary)}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="statement-grid">
        <div class="card">
          <span class="eyebrow">Position Summary</span>
          <h2>${v(heroStatement)}</h2>
          <p>${v(viabilitySummary)}</p>
        </div>
        <div class="brief">
          <span class="eyebrow">Submitted Brief</span>
          <div class="brief-grid">
            <div><span class="brief-label">Location</span><span class="brief-value">${v(locations)}</span></div>
            <div><span class="brief-label">Property Type</span><span class="brief-value">${v(propertyTypes)}</span></div>
            <div><span class="brief-label">Bedrooms</span><span class="brief-value">${v(bedrooms)}</span></div>
            <div><span class="brief-label">Bathrooms</span><span class="brief-value">${v(bathrooms)}</span></div>
            <div><span class="brief-label">Purpose</span><span class="brief-value">${v(purpose)}</span></div>
            <div><span class="brief-label">Rental Yield</span><span class="brief-value">${v(rentalYield)}</span></div>
          </div>
        </div>
      </div>
    </section>

    ${positioningHtml}
    ${salesExamplesHtml}
    ${strategiesHtml}
    ${pathwaysHtml}

    <section class="section">
      <span class="eyebrow">Underlying Sales Data</span>
      <h2 class="section-title">Supporting market evidence</h2>
      <p class="intro" style="margin-bottom:0;">The following rows reflect the underlying sales data used to support this report.</p>
      <div class="table-wrap">
        <table class="sales-table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Sale Price</th>
              <th>Sale Date</th>
              <th>Bedrooms</th>
              <th>Bathrooms</th>
            </tr>
          </thead>
          <tbody>${salesTableBody}</tbody>
        </table>
      </div>
      ${salesNote ? `<p class="note">${v(salesNote)}</p>` : ''}
    </section>

    ${finalHtml}

  </div>
</body>
</html>`;
}
