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

  body {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.45;
    color: #1f2933;
    background: #f0f2f5;
  }

  .report {
    max-width: 1100px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 28px;
    overflow: hidden;
    border: 1px solid #e5ebf0;
  }

  /* ── Hero ── */
  .hero {
    background: linear-gradient(180deg, #2c3e50 0%, #22313f 100%);
    color: #ffffff;
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
    color: #ffffff;
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
    color: #ffffff;
  }

  .meta-value {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #ffffff;
  }

  /* ── Sections ── */
  .section {
    padding: 34px 44px;
    border-top: 1px solid #edf1f4;
  }

  .section-soft {
    background: #f4f6f8;
  }

  .section-dark {
    background: #2c3e50;
    color: #ffffff;
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
    color: #2c3e50;
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
    color: #6b7280;
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
    background: #ffffff;
    border: 1px solid #d9e0e7;
    border-radius: 24px;
    padding: 28px;
  }

  .card h2 {
    font-size: 34px;
    line-height: 1.04;
    letter-spacing: -0.03em;
    color: #2c3e50;
    margin-bottom: 14px;
  }

  .card p {
    color: #6b7280;
    font-size: 16px;
  }

  .brief {
    background: #f8fafb;
    border: 1px solid #d9e0e7;
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
    color: #6b7280;
    margin-bottom: 6px;
    font-weight: 700;
  }

  .brief-value {
    font-size: 17px;
    font-weight: 700;
    color: #2c3e50;
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
    color: #ffffff;
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
    color: #ffffff;
    line-height: 1.02;
    margin-bottom: 8px;
  }

  /* ── Sales table ── */
  .table-wrap {
    margin-top: 24px;
    border: 1px solid #d9e0e7;
    border-radius: 20px;
    overflow: hidden;
    background: #ffffff;
  }

  .sales-table {
    width: 100%;
    border-collapse: collapse;
  }

  .sales-table thead th {
    background: #2c3e50;
    color: #ffffff;
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
    color: #1f2933;
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
    border: 1px solid #d9e0e7;
    border-radius: 24px;
    padding: 28px;
    margin-top: 14px;
  }

  .final-box p {
    font-size: 32px;
    line-height: 1.08;
    letter-spacing: -0.03em;
    color: #2c3e50;
    font-weight: 800;
  }

  .note {
    margin-top: 14px;
    font-size: 13px;
    color: #6b7280;
  }

  @media print {
    body { margin: 0; background: #ffffff; }
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
    ? `<img class="logo" src="${esc(logoUrl)}" alt="Fulcrum Australia" style="height:40px;width:auto;display:block;object-fit:contain;" />`
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
    <section class="section section-dark" style="background:#2c3e50;color:#ffffff;padding:34px 44px;border-top:0;">
      <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.72);">${label}</span>
      <h2 class="section-title" style="font-size:30px;line-height:1.05;letter-spacing:-0.03em;margin-bottom:8px;margin-top:0;color:#ffffff;font-weight:700;">${v(s.headline)}</h2>
      <p class="intro" style="max-width:760px;font-size:16px;color:rgba(255,255,255,0.86);margin:0;">${v(s.summary)}</p>
      <div class="strategy-grid" style="display:flex;gap:24px;margin-top:28px;align-items:flex-start;">
        <div class="strategy-callout" style="flex:1.1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:24px;padding:24px;">
          <h3 style="font-size:26px;line-height:1.05;letter-spacing:-0.03em;color:#ffffff;margin-bottom:12px;margin-top:0;font-weight:700;">${v(s.headline)}</h3>
          <p style="color:rgba(255,255,255,0.86);font-size:15px;margin:0;">${v(s.summary)}</p>
        </div>
        <div class="strategy-metrics" style="flex:0.9;min-width:0;display:flex;flex-direction:column;gap:12px;">
          <div class="metric" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:22px;padding:20px;">
            <div class="metric-label" style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:10px;margin-top:0;">Target Purchase</div>
            <div class="metric-value" style="font-size:34px;font-weight:800;letter-spacing:-0.04em;color:#ffffff;line-height:1.02;margin-bottom:8px;margin-top:0;">${fmtMoney(s.targetPurchasePrice)}</div>
          </div>
          <div class="metric" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:22px;padding:20px;">
            <div class="metric-label" style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:10px;margin-top:0;">Capital / Works</div>
            <div class="metric-value" style="font-size:34px;font-weight:800;letter-spacing:-0.04em;color:#ffffff;line-height:1.02;margin-bottom:8px;margin-top:0;">${fmtMoney(s.budgetAmount)}</div>
          </div>
          <div class="metric" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:22px;padding:20px;">
            <div class="metric-label" style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:10px;margin-top:0;">Projected End Value</div>
            <div class="metric-value" style="font-size:34px;font-weight:800;letter-spacing:-0.04em;color:#ffffff;line-height:1.02;margin-bottom:8px;margin-top:0;">${fmtMoney(s.projectedEndValue)}</div>
          </div>
        </div>
      </div>
    </section>`;
  }).join('');

  // ── Sales table rows ──────────────────────────────────────────────────────
  const TD = 'padding:14px 18px;border-top:1px solid #edf1f4;font-size:15px;color:#1f2933;vertical-align:middle;';
  const salesTableBody = salesRows.length > 0
    ? salesRows.map(row => `
        <tr>
          <td style="${TD}">${v(row.address)}</td>
          <td style="${TD}">${v(row.salePrice)}</td>
          <td style="${TD}">${v(row.saleDate)}</td>
          <td style="${TD}">${row.bedrooms != null ? esc(String(row.bedrooms)) : '—'}</td>
          <td style="${TD}">${row.bathrooms != null ? esc(String(row.bathrooms)) : '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" style="${TD}color:#aaa;font-style:italic;">No sales data available yet.</td></tr>`;

  // ── Market Positioning ────────────────────────────────────────────────────
  const positioningHtml = hasPositioning ? `
    <section class="section section-soft" style="padding:34px 44px;border-top:1px solid #edf1f4;background:#f4f6f8;">
      <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#2c3e50;">Market Positioning</span>
      <h2 class="section-title" style="font-size:30px;line-height:1.05;letter-spacing:-0.03em;margin-bottom:8px;margin-top:0;color:#1f2933;font-weight:700;">Where your budget sits</h2>
    </section>` : '';

  // ── Market Examples ───────────────────────────────────────────────────────
  const salesExamplesHtml = hasSalesExamples ? `
    <section class="section" style="padding:34px 44px;border-top:1px solid #edf1f4;background:#ffffff;">
      <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#2c3e50;">Market Examples</span>
      <h2 class="section-title" style="font-size:30px;line-height:1.05;letter-spacing:-0.03em;margin-bottom:8px;margin-top:0;color:#1f2933;font-weight:700;">Recent sales shaping this report</h2>
      <div style="display:flex;gap:18px;margin-top:24px;">
        ${salesExamples.slice(0, 3).map(sale => `
          <div class="card" style="flex:1;min-width:0;min-height:180px;display:flex;flex-direction:column;justify-content:space-between;background:#ffffff;border:1px solid #d9e0e7;border-radius:24px;padding:28px;">
            <div>
              <p style="font-size:20px;font-weight:800;letter-spacing:-0.03em;color:#2c3e50;margin-bottom:10px;margin-top:0;">${v(sale.address)}</p>
              <p style="color:#6b7280;font-size:14px;margin-bottom:16px;margin-top:0;">${v(sale.meta)}</p>
            </div>
            <p style="font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#2c3e50;margin:0;">${v(sale.price)}</p>
          </div>`).join('')}
      </div>
    </section>` : '';

  // ── Strategic Pathways ────────────────────────────────────────────────────
  const pathwaysHtml = hasPathways ? `
    <section class="section section-soft" style="padding:34px 44px;border-top:1px solid #edf1f4;background:#f4f6f8;">
      <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#2c3e50;">Strategic Pathways</span>
      <h2 class="section-title" style="font-size:30px;line-height:1.05;letter-spacing:-0.03em;margin-bottom:8px;margin-top:0;color:#1f2933;font-weight:700;">The available ways forward</h2>
      <div style="display:flex;gap:18px;margin-top:24px;">
        ${pathways.slice(0, 3).map(pw => `
          <div class="card" style="flex:1;min-width:0;background:#ffffff;border:1px solid #d9e0e7;border-radius:24px;padding:28px;">
            <h3 style="font-size:22px;letter-spacing:-0.03em;color:#2c3e50;margin-bottom:12px;margin-top:0;font-weight:700;">${v(pw.title)}</h3>
            <ul style="padding-left:18px;color:#6b7280;margin:0;">
              ${(pw.points || []).map(pt => `<li style="margin-bottom:8px;">${v(pt)}</li>`).join('')}
            </ul>
          </div>`).join('')}
      </div>
    </section>` : '';

  // ── Final Statement ───────────────────────────────────────────────────────
  const finalHtml = hasFinalStatement ? `
    <section class="section" style="padding:34px 44px;border-top:1px solid #edf1f4;background:#ffffff;">
      <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#2c3e50;">Final Position</span>
      <div class="final-box" style="background:#f8fafb;border:1px solid #d9e0e7;border-radius:24px;padding:28px;margin-top:14px;">
        <p style="font-size:32px;line-height:1.08;letter-spacing:-0.03em;color:#2c3e50;font-weight:800;margin:0;">${v(finalStatement)}</p>
      </div>
    </section>` : '';

  // ── Assemble ──────────────────────────────────────────────────────────────
  const TH = 'background:#2c3e50;color:#ffffff;text-align:left;padding:14px 18px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;white-space:nowrap;';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDR — ${esc(clientName)}</title>
  <style>${CSS}</style>
</head>
<body style="font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.45;color:#1f2933;background:#f0f2f5;margin:0;padding:0;">
  <div class="report" style="max-width:1100px;margin:0 auto;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #e5ebf0;">

    <section class="hero" style="background:linear-gradient(180deg,#2c3e50 0%,#22313f 100%);color:#ffffff;padding:40px 44px 48px;">
      <div class="hero-top" style="margin-bottom:36px;">${logoHtml}</div>
      <div class="hero-grid" style="display:flex;gap:32px;align-items:flex-end;">
        <div style="flex:1.4;min-width:0;">
          <div class="kicker" style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;opacity:0.78;margin-bottom:18px;margin-top:0;color:#ffffff;">Price Discovery Report</div>
          <h1 style="font-size:48px;line-height:0.98;letter-spacing:-0.04em;margin-bottom:14px;margin-top:0;color:#ffffff;font-weight:800;">${v(clientName)}</h1>
          <p class="hero-sub" style="font-size:15px;color:rgba(255,255,255,0.82);max-width:680px;margin:0;">${heroSubParts || '—'}</p>
        </div>
        <div class="hero-meta" style="flex:0.8;min-width:0;display:flex;flex-direction:column;gap:12px;">
          <div class="meta-card" style="border:1px solid rgba(255,255,255,0.16);border-radius:18px;padding:16px 18px;background:rgba(255,255,255,0.05);">
            <div class="meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;opacity:0.7;margin-bottom:6px;margin-top:0;color:#ffffff;">Budget</div>
            <div class="meta-value" style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;margin:0;">${v(budgetDisplay)}</div>
          </div>
          <div class="meta-card" style="border:1px solid rgba(255,255,255,0.16);border-radius:18px;padding:16px 18px;background:rgba(255,255,255,0.05);">
            <div class="meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;opacity:0.7;margin-bottom:6px;margin-top:0;color:#ffffff;">Report Outcome</div>
            <div class="meta-value" style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;margin:0;">${v(outcomeSummary)}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" style="padding:34px 44px;border-top:1px solid #edf1f4;background:#ffffff;">
      <div class="statement-grid" style="display:flex;gap:30px;align-items:stretch;">
        <div class="card" style="flex:1.15;min-width:0;background:#ffffff;border:1px solid #d9e0e7;border-radius:24px;padding:28px;">
          <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#2c3e50;">Position Summary</span>
          <h2 style="font-size:34px;line-height:1.04;letter-spacing:-0.03em;color:#2c3e50;margin-bottom:14px;margin-top:0;font-weight:800;">${v(heroStatement)}</h2>
          <p style="color:#6b7280;font-size:16px;margin:0;">${v(viabilitySummary)}</p>
        </div>
        <div class="brief" style="flex:0.85;min-width:0;background:#f8fafb;border:1px solid #d9e0e7;border-radius:24px;padding:24px;">
          <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#2c3e50;">Submitted Brief</span>
          <div class="brief-grid" style="display:flex;flex-wrap:wrap;gap:16px 22px;margin-top:12px;">
            <div style="flex:1 1 320px;min-width:240px;"><span class="brief-label" style="display:block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;font-weight:700;">Location</span><span class="brief-value" style="font-size:17px;font-weight:700;color:#2c3e50;letter-spacing:-0.02em;display:block;">${v(locations)}</span></div>
            <div style="flex:1 1 320px;min-width:240px;"><span class="brief-label" style="display:block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;font-weight:700;">Property Type</span><span class="brief-value" style="font-size:17px;font-weight:700;color:#2c3e50;letter-spacing:-0.02em;display:block;">${v(propertyTypes)}</span></div>
            <div style="flex:1 1 320px;min-width:240px;"><span class="brief-label" style="display:block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;font-weight:700;">Bedrooms</span><span class="brief-value" style="font-size:17px;font-weight:700;color:#2c3e50;letter-spacing:-0.02em;display:block;">${v(bedrooms)}</span></div>
            <div style="flex:1 1 320px;min-width:240px;"><span class="brief-label" style="display:block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;font-weight:700;">Bathrooms</span><span class="brief-value" style="font-size:17px;font-weight:700;color:#2c3e50;letter-spacing:-0.02em;display:block;">${v(bathrooms)}</span></div>
            <div style="flex:1 1 320px;min-width:240px;"><span class="brief-label" style="display:block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;font-weight:700;">Purpose</span><span class="brief-value" style="font-size:17px;font-weight:700;color:#2c3e50;letter-spacing:-0.02em;display:block;">${v(purpose)}</span></div>
            <div style="flex:1 1 320px;min-width:240px;"><span class="brief-label" style="display:block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;font-weight:700;">Rental Yield</span><span class="brief-value" style="font-size:17px;font-weight:700;color:#2c3e50;letter-spacing:-0.02em;display:block;">${v(rentalYield)}</span></div>
          </div>
        </div>
      </div>
    </section>

    ${positioningHtml}
    ${salesExamplesHtml}
    ${strategiesHtml}
    ${pathwaysHtml}

    <section class="section" style="padding:34px 44px;border-top:1px solid #edf1f4;background:#ffffff;">
      <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#2c3e50;">Underlying Sales Data</span>
      <h2 class="section-title" style="font-size:30px;line-height:1.05;letter-spacing:-0.03em;margin-bottom:8px;margin-top:0;color:#1f2933;font-weight:700;">Supporting market evidence</h2>
      <p class="intro" style="max-width:760px;font-size:16px;color:#6b7280;margin-bottom:0;margin-top:0;">The following rows reflect the underlying sales data used to support this report.</p>
      <div class="table-wrap" style="margin-top:24px;border:1px solid #d9e0e7;border-radius:20px;overflow:hidden;background:#ffffff;">
        <table class="sales-table" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="${TH}">Address</th>
              <th style="${TH}">Sale Price</th>
              <th style="${TH}">Sale Date</th>
              <th style="${TH}">Bedrooms</th>
              <th style="${TH}">Bathrooms</th>
            </tr>
          </thead>
          <tbody>${salesTableBody}</tbody>
        </table>
      </div>
      ${salesNote ? `<p class="note" style="margin-top:14px;font-size:13px;color:#6b7280;">${v(salesNote)}</p>` : ''}
    </section>

    ${finalHtml}

  </div>
</body>
</html>`;
}
