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
// Legacy hero/cover rules removed. box-shadow suppressed for PDF output.
// ---------------------------------------------------------------------------
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.45;
    color: #1f2933;
    background: #ffffff;
  }

  /* Prevent Playwright from splitting major Page 1 blocks across PDF page boundaries.
     Must be in screen-media CSS — PDF is generated with emulateMedia('screen'). */
  .brief-position-row,
  .kpi-row,
  .snapshot-block,
  .affordability-block,
  .best-fit-block {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report {
    max-width: 1100px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid #e5ebf0;
  }

  /* ── Shared section styles (used by downstream strategy/table sections) ── */
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

  .section-dark .eyebrow { color: rgba(255,255,255,0.72); }

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
  .section-dark li { color: rgba(255,255,255,0.86); }

  /* ── Card (used by pathways) ── */
  .card {
    background: #ffffff;
    border: 1px solid #d9e0e7;
    border-radius: 24px;
    padding: 28px;
  }

  /* ── Strategy sections ── */
  .strategy-callout {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 24px;
    padding: 24px;
  }

  .metric {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 22px;
    padding: 20px;
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

  .sales-table tbody tr:nth-child(even) { background: #fafcfd; }

  .empty-cell { color: #aaa; font-style: italic; }

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

  .note { margin-top: 14px; font-size: 13px; color: #6b7280; }

  @media print {
    * { box-shadow: none !important; }
    body { margin: 0; padding: 0; background: #ffffff; }
    .report { border-radius: 0; border: none; max-width: 100%; }
    .section-dark, .sales-table thead {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export default function renderPdrReportHtml(report, { logoUrl } = {}) {
  if (!report) return '';

  const {
    clientName            = '',
    suburbSummary         = '',
    propertyTypeSummary   = '',
    bedroomSummary        = '',
    livingSummary         = '',
    budgetDisplay         = '',
    locations             = '',
    propertyTypes         = '',
    bedrooms              = '',
    bathrooms             = '',
    purpose               = '',
    rentalYield           = '',
    heroStatement         = '',
    viabilitySummary      = '',
    salesRows             = [],
    salesNote             = '',
    finalStatement        = '',
    strategies            = [],
    pathways              = [],

    // Computed market stats
    budgetMax             = null,
    medianPrice           = null,
    budgetVsMedian        = null,
    budgetVsMedianPct     = null,
    medianAlignmentStatus = null,
    medianAlignmentLabel  = null,
    affordableCount       = 0,
    affordablePct         = null,
    priceMin              = null,
    priceMax              = null,
    allSalePrices         = [],
    bestFitProperty       = null,
  } = report;

  const hasPathways       = pathways.length > 0;
  const hasFinalStatement = !!finalStatement;

  // ── Logo ─────────────────────────────────────────────────────────────────
  const logoHtml = (logoUrl && logoUrl.trim())
    ? `<img src="${esc(logoUrl)}" alt="Fulcrum Australia" style="height:32px;width:auto;display:block;object-fit:contain;flex-shrink:0;" />`
    : '';

  // ── Compact header sub-line ───────────────────────────────────────────────
  const heroSubParts = [suburbSummary, propertyTypeSummary, bedroomSummary, livingSummary]
    .filter(Boolean)
    .map(esc)
    .join(' · ');

  // ── Intro strip sentence ──────────────────────────────────────────────────
  const salesCount = salesRows.length;
  const introSentence = (salesCount > 0 && locations)
    ? `Based on ${salesCount} comparable sale${salesCount !== 1 ? 's' : ''} across ${esc(locations)}, here is where your budget of ${esc(budgetDisplay || '—')} sits in the current market.`
    : `This report presents current market evidence to help position your property search in context of recent comparable sales.`;

  // ── KPI colour: three-state green / amber / red ───────────────────────────
  const medianColour = medianAlignmentStatus === 'above' ? '#16a34a'
    : medianAlignmentStatus === 'near'  ? '#d97706'
    : medianAlignmentStatus === 'below' ? '#dc2626'
    : '#0b2545';

  // "above" and "near" both display as "above"; "below" as "below"
  const budgetVsDirection = medianAlignmentStatus === 'below' ? 'below' : 'above';

  // ── Range bar ─────────────────────────────────────────────────────────────
  const hasRangeBar = priceMin != null && priceMax != null && priceMin !== priceMax;
  let rangeBarHtml;

  if (hasRangeBar) {
    const span = priceMax - priceMin;
    function markerPct(val) {
      return Math.min(100, Math.max(0, ((val - priceMin) / span) * 100));
    }
    const markerDefs = [
      { pct: 0,                       label: fmtMoney(priceMin),   color: '#9ca3af', title: 'Min'    },
      ...(budgetMax   != null ? [{ pct: markerPct(budgetMax),   label: fmtMoney(budgetMax),   color: '#2563eb', title: 'Budget' }] : []),
      ...(medianPrice != null ? [{ pct: markerPct(medianPrice), label: fmtMoney(medianPrice), color: '#f59e0b', title: 'Median' }] : []),
      { pct: 100,                      label: fmtMoney(priceMax),   color: '#9ca3af', title: 'Max'    },
    ];

    const markersHtml = markerDefs.map(m => `
      <div style="position:absolute;left:${m.pct.toFixed(1)}%;top:0;transform:translateX(-50%);">
        <div style="width:16px;height:16px;border-radius:50%;background:${m.color};margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>
        <div style="font-size:9px;font-weight:600;color:${m.color};text-align:center;white-space:nowrap;margin-top:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${m.label}</div>
        <div style="font-size:9px;color:#9ca3af;text-align:center;white-space:nowrap;">${m.title}</div>
      </div>`).join('');

    rangeBarHtml = `
      <div style="position:relative;height:72px;margin-bottom:4px;">
        <div style="position:absolute;left:0;right:0;top:4px;height:8px;background:#e5e7eb;border-radius:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>
        ${markersHtml}
      </div>`;
  } else {
    rangeBarHtml = `<p style="font-size:13px;color:#9ca3af;margin:0;">—</p>`;
  }

  // ── Spark chart (sorted bars, green ≤ budget / red > budget) ─────────────
  let sparkHtml = '';
  if (allSalePrices.length > 0 && priceMax != null && priceMax > 0) {
    const bars = allSalePrices.map(p => {
      const h   = Math.max(4, Math.round((p / priceMax) * 100));
      const col = (budgetMax != null && p <= budgetMax) ? '#16a34a' : '#dc2626';
      return `<div style="flex:1;min-width:4px;border-radius:2px 2px 0 0;height:${h}%;background:${col};-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>`;
    }).join('');
    sparkHtml = `<div style="display:flex;align-items:flex-end;gap:3px;height:60px;margin-top:20px;">${bars}</div>`;
  }

  // ── Affordability stacked bar ─────────────────────────────────────────────
  const nonAffordableCount = allSalePrices.length - affordableCount;
  const afPct    = affordablePct != null ? affordablePct : 0;
  const nonAfPct = 100 - afPct;

  let affordBarHtml;
  if (affordablePct != null) {
    affordBarHtml = `
      <div style="height:24px;border-radius:6px;overflow:hidden;display:flex;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        ${afPct > 0    ? `<div style="width:${afPct}%;background:#16a34a;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>` : ''}
        ${nonAfPct > 0 ? `<div style="width:${nonAfPct}%;background:#dc2626;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#16a34a;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></span>
          ${affordableCount} sale${affordableCount !== 1 ? 's' : ''} within budget (${afPct}%)
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#dc2626;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></span>
          ${nonAffordableCount} sale${nonAffordableCount !== 1 ? 's' : ''} above budget
        </div>
      </div>`;
  } else {
    affordBarHtml = `
      <div style="height:24px;border-radius:6px;background:#e5e7eb;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>
      <p style="font-size:13px;color:#9ca3af;margin-top:8px;">No comparable sales data available.</p>`;
  }

  // ── Best-fit affordable property ──────────────────────────────────────────
  let bestFitHtml;
  if (bestFitProperty != null) {
    const addrParts  = [bestFitProperty.address, bestFitProperty.suburb, bestFitProperty.state, bestFitProperty.postcode].filter(Boolean);
    const addressLine = addrParts.map(p => esc(String(p))).join(', ');

    const pills = [];
    if (bestFitProperty.beds      != null) pills.push(`${esc(String(bestFitProperty.beds))} bed`);
    if (bestFitProperty.baths     != null) pills.push(`${esc(String(bestFitProperty.baths))} bath`);
    if (bestFitProperty.cars      != null) pills.push(`${esc(String(bestFitProperty.cars))} car`);
    if (bestFitProperty.landSize)          pills.push(esc(String(bestFitProperty.landSize)));
    if (bestFitProperty.floorSize)         pills.push(esc(String(bestFitProperty.floorSize)));
    if (bestFitProperty.yearBuilt)         pills.push(`Built ${esc(String(bestFitProperty.yearBuilt))}`);

    const pillsHtml = pills.map(p =>
      `<span style="background:#e0f2fe;color:#0369a1;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${p}</span>`
    ).join('');

    const propImageHtml = bestFitProperty.imageUrl
      ? `<img src="${esc(bestFitProperty.imageUrl)}" alt="" style="width:273px;height:182px;object-fit:cover;object-position:center;display:block;border-radius:10px 0 0 10px;flex-shrink:0;" />`
      : `<div style="width:273px;height:182px;min-width:273px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;border-radius:10px 0 0 10px;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;"><span style="font-size:12px;color:#9ca3af;">No image</span></div>`;

    bestFitHtml = `
      <div class="best-fit-block" style="padding:0 36px 28px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#6b7280;margin-bottom:12px;">Best-Fit Affordable Example</div>
        <div style="display:flex;align-items:stretch;background:#f8fafc;border:1px solid #dde2e8;border-radius:14px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
          ${propImageHtml}
          <div style="flex:1;min-width:0;padding:20px 22px;">
            <div style="font-size:17px;font-weight:700;color:#0b2545;margin-bottom:6px;">${addressLine || v(bestFitProperty.address)}</div>
            <div style="font-size:24px;font-weight:800;color:#16a34a;margin-bottom:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${fmtMoney(bestFitProperty.salePrice)}</div>
            ${pillsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${pillsHtml}</div>` : ''}
          </div>
        </div>
      </div>`;
  } else {
    bestFitHtml = `<p style="font-size:13px;color:#9ca3af;font-style:italic;padding:0 36px 20px;margin:0;">No sales within budget were identified in the uploaded data.</p>`;
  }

  // ── Strategies ────────────────────────────────────────────────────────────
  const strategiesHtml = strategies.map(s => {
    const label = esc(STRATEGY_LABELS[s.strategyType] || s.strategyType || 'Strategic Pathway');
    return `
    <section class="section section-dark" style="background:#2c3e50;color:#ffffff;padding:34px 44px;border-top:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <span class="eyebrow" style="display:inline-block;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.72);">${label}</span>
      <h2 class="section-title" style="font-size:30px;line-height:1.05;letter-spacing:-0.03em;margin-bottom:8px;margin-top:0;color:#ffffff;font-weight:700;">${v(s.headline)}</h2>
      <p class="intro" style="max-width:760px;font-size:16px;color:rgba(255,255,255,0.86);margin:0;">${v(s.summary)}</p>
      <div style="display:flex;gap:24px;margin-top:28px;align-items:flex-start;">
        <div class="strategy-callout" style="flex:1.1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:24px;padding:24px;">
          <h3 style="font-size:26px;line-height:1.05;letter-spacing:-0.03em;color:#ffffff;margin-bottom:12px;margin-top:0;font-weight:700;">${v(s.headline)}</h3>
          <p style="color:rgba(255,255,255,0.86);font-size:15px;margin:0;">${v(s.summary)}</p>
        </div>
        <div style="flex:0.9;min-width:0;display:flex;flex-direction:column;gap:12px;">
          <div class="metric" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:22px;padding:20px;">
            <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:10px;margin-top:0;">Target Purchase</div>
            <div style="font-size:34px;font-weight:800;letter-spacing:-0.04em;color:#ffffff;line-height:1.02;margin-bottom:8px;margin-top:0;">${fmtMoney(s.targetPurchasePrice)}</div>
          </div>
          <div class="metric" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:22px;padding:20px;">
            <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:10px;margin-top:0;">Capital / Works</div>
            <div style="font-size:34px;font-weight:800;letter-spacing:-0.04em;color:#ffffff;line-height:1.02;margin-bottom:8px;margin-top:0;">${fmtMoney(s.budgetAmount)}</div>
          </div>
          <div class="metric" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:22px;padding:20px;">
            <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:10px;margin-top:0;">Projected End Value</div>
            <div style="font-size:34px;font-weight:800;letter-spacing:-0.04em;color:#ffffff;line-height:1.02;margin-bottom:8px;margin-top:0;">${fmtMoney(s.projectedEndValue)}</div>
          </div>
        </div>
      </div>
    </section>`;
  }).join('');

  // ── Sales table rows ──────────────────────────────────────────────────────
  const TD  = 'padding:14px 18px;border-top:1px solid #edf1f4;font-size:15px;color:#1f2933;vertical-align:middle;';
  const TH  = 'background:#2c3e50;color:#ffffff;text-align:left;padding:14px 18px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact;';

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

  // ── Footer evidence note ──────────────────────────────────────────────────
  const footerNote = `This report is based on ${salesCount} comparable sale${salesCount !== 1 ? 's' : ''}. All figures are market evidence only and do not constitute financial or investment advice.`;

  // ── Assemble ──────────────────────────────────────────────────────────────
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDR — ${esc(clientName)}</title>
  <style>${CSS}</style>
</head>
<body style="font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.45;color:#1f2933;background:#ffffff;margin:0;padding:0;">
  <div class="report" style="max-width:1100px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5ebf0;">

    <!-- Block 1: Compact dark header -->
    <div style="background:#0b2545;padding:18px 36px;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <div style="display:flex;align-items:center;gap:14px;">
        ${logoHtml}
        <span style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.75);">Price Discovery Report</span>
      </div>
      <div style="text-align:right;">
        <div style="font-size:18px;font-weight:700;color:#ffffff;">${v(clientName)}</div>
        ${heroSubParts ? `<div style="font-size:13px;color:rgba(255,255,255,0.72);margin-top:3px;">${heroSubParts}</div>` : ''}
      </div>
    </div>

    <!-- Block 2: Intro strip -->
    <div style="background:#f3f5f7;padding:14px 36px;border-bottom:1px solid #dde2e8;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <p style="font-size:14px;color:#374151;margin:0;">${introSentence}</p>
    </div>

    <!-- Block 3: 2-column Submitted Brief + Position Summary -->
    <div class="brief-position-row" style="padding:28px 36px;display:flex;gap:24px;align-items:flex-start;">
      <div style="flex:0 0 340px;min-width:0;background:#f8fafc;border:1px solid #dde2e8;border-radius:14px;padding:20px 22px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Submitted Brief</div>
        <div style="margin-bottom:12px;"><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;font-weight:700;margin-bottom:3px;">Location</span><span style="font-size:15px;font-weight:700;color:#1e3a5f;display:block;">${v(locations)}</span></div>
        <div style="margin-bottom:12px;"><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;font-weight:700;margin-bottom:3px;">Property Type</span><span style="font-size:15px;font-weight:700;color:#1e3a5f;display:block;">${v(propertyTypes)}</span></div>
        <div style="margin-bottom:12px;"><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;font-weight:700;margin-bottom:3px;">Bedrooms</span><span style="font-size:15px;font-weight:700;color:#1e3a5f;display:block;">${v(bedrooms)}</span></div>
        <div style="margin-bottom:12px;"><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;font-weight:700;margin-bottom:3px;">Bathrooms</span><span style="font-size:15px;font-weight:700;color:#1e3a5f;display:block;">${v(bathrooms)}</span></div>
        <div style="margin-bottom:12px;"><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;font-weight:700;margin-bottom:3px;">Purpose</span><span style="font-size:15px;font-weight:700;color:#1e3a5f;display:block;">${v(purpose)}</span></div>
        <div><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;font-weight:700;margin-bottom:3px;">Rental Yield</span><span style="font-size:15px;font-weight:700;color:#1e3a5f;display:block;">${v(rentalYield)}</span></div>
      </div>
      <div style="flex:1;min-width:0;background:#ffffff;border:1px solid #dde2e8;border-radius:14px;padding:20px 24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;margin-bottom:12px;">Position Summary</div>
        <div style="font-size:14px;font-weight:700;color:#0b2545;line-height:1.6;margin-bottom:10px;">${v(heroStatement)}</div>
        <div style="font-size:14px;color:#6b7280;line-height:1.6;">${v(viabilitySummary)}</div>
      </div>
    </div>

    <!-- Block 4: 3 KPI cards -->
    <div class="kpi-row" style="padding:0 36px 24px;display:flex;gap:16px;">
      <div style="flex:1;background:#ffffff;border:1px solid #dde2e8;border-radius:14px;padding:18px 20px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#6b7280;margin-bottom:10px;">Median Sale Price</div>
        <div style="font-size:28px;font-weight:800;color:${medianColour};line-height:1.1;margin-bottom:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${medianPrice != null ? fmtMoney(medianPrice) : '—'}</div>
        <div style="font-size:12px;color:#9ca3af;">${esc(medianAlignmentLabel || 'Market midpoint')}</div>
      </div>
      <div style="flex:1;background:#ffffff;border:1px solid #dde2e8;border-radius:14px;padding:18px 20px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#6b7280;margin-bottom:10px;">Budget vs Median</div>
        <div style="font-size:28px;font-weight:800;color:${medianColour};line-height:1.1;margin-bottom:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${budgetVsMedian != null ? fmtMoney(Math.abs(budgetVsMedian)) : '—'}</div>
        <div style="font-size:12px;color:#9ca3af;">${budgetVsMedianPct != null ? Math.abs(budgetVsMedianPct) + '% ' + budgetVsDirection + ' median' : '—'}</div>
      </div>
      <div style="flex:1;background:#ffffff;border:1px solid #dde2e8;border-radius:14px;padding:18px 20px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#6b7280;margin-bottom:10px;">Affordable Sales</div>
        <div style="font-size:28px;font-weight:800;color:#0b2545;line-height:1.1;margin-bottom:6px;">${affordableCount}</div>
        <div style="font-size:12px;color:#9ca3af;">${affordablePct != null ? affordablePct + '% of comparable sales' : 'within budget'}</div>
      </div>
    </div>

    <!-- Block 5: Price Position Snapshot -->
    <div class="snapshot-block" style="padding:0 36px 28px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#6b7280;margin-bottom:14px;">Price Position Snapshot</div>
      ${rangeBarHtml}
      ${sparkHtml}
    </div>

    <!-- Block 6: Affordability Snapshot -->
    <div class="affordability-block" style="padding:0 36px 28px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#6b7280;margin-bottom:10px;">Affordability Snapshot</div>
      ${affordBarHtml}
    </div>

    <!-- Block 7: Best-Fit Affordable Property Example (omitted if null) -->
    ${bestFitHtml}

    <!-- Block 8: Footer evidence note -->
    <div style="padding:14px 36px 28px;border-top:1px solid #edf1f4;">
      <p style="font-size:12px;color:#9ca3af;font-style:italic;margin:0;">${footerNote}</p>
    </div>

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
