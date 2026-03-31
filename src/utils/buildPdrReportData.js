// ── PDR Report Data Assembly ──────────────────────────────────────────────────
// Takes a normalised PDR request object and returns a stable report-ready object
// for rendering in PdrReportPreview. All field names are camelCase.
// Future-proof: narrative fields (positioningIntro, salesRows, etc.) are null/[]
// for now and will be populated in Phase 4 (CSV parsing, staff narrative inputs).

function fmtMoney(n) {
  if (n == null) return null;
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(num);
}

export default function buildPdrReportData(request) {
  // request.type is the alias set in normaliseRequest: type = row.request_type
  if (!request || request.type !== 'pdr') return null;

  // ── Derived header fields ────────────────────────────────────────────────
  const propertyTypeSummary = (request.propertyTypes || []).join(' / ') || null;
  const suburbSummary       = request.locations || null;
  const bedroomSummary      = request.bedrooms  ? `${request.bedrooms} Bed`  : null;
  const livingSummary       = request.bathrooms ? `${request.bathrooms} Bath` : null;

  let budgetDisplay = null;
  if (request.budgetMax != null) {
    budgetDisplay = request.budgetMin != null
      ? `${fmtMoney(request.budgetMin)} – ${fmtMoney(request.budgetMax)}`
      : fmtMoney(request.budgetMax);
  }

  const strategyCount  = (request.strategies || []).length;
  const outcomeSummary = strategyCount > 0
    ? `${strategyCount} Strategic Pathway${strategyCount > 1 ? 's' : ''}`
    : null;

  // ── Display-formatted brief fields ───────────────────────────────────────
  let purposeDisplay = null;
  if (request.purpose === 'investor') purposeDisplay = 'Investor';
  else if (request.purpose === 'owner') purposeDisplay = 'Owner Occupier';

  const rentalYieldDisplay = request.rentalYield != null ? `${request.rentalYield}%` : null;

  // ── Strategy modules — snake_case DB fields → camelCase report fields ────
  const strategies = (request.strategies || []).map(s => ({
    id:                   s.id,
    strategyType:         s.strategy_type,
    headline:             s.headline             || null,
    summary:              s.summary              || null,
    targetPurchasePrice:  s.target_purchase_price,
    budgetAmount:         s.budget_amount,
    projectedEndValue:    s.projected_end_value,
  }));

  return {
    // ── Hero / header ──────────────────────────────────────────────────────
    clientName:          request.clientName,
    suburbSummary,
    propertyTypeSummary,
    bedroomSummary,
    livingSummary,
    budgetDisplay,
    outcomeSummary,

    // ── Submitted brief (display-formatted) ───────────────────────────────
    locations:     request.locations,
    propertyTypes: propertyTypeSummary,
    bedrooms:      request.bedrooms,
    bathrooms:     request.bathrooms,
    purpose:       purposeDisplay,
    rentalYield:   rentalYieldDisplay,

    // ── Staff positioning (from request_pdr_details) ───────────────────────
    heroStatement:    request.heroStatement,
    viabilitySummary: request.viabilitySummary,
    supportingNotes:  request.supportingNotes,

    // ── Market positioning — narrative (Phase 4 staff input fields) ────────
    positioningIntro:   null,
    entryPoint:         null,
    budgetMarker:       budgetDisplay,
    premiumPoint:       null,
    positioningLegend:  null,
    entryDescription:   null,
    coreRange:          null,
    coreDescription:    null,
    premiumDescription: null,

    // ── Featured sales examples (Phase 4 — manual or CSV pick) ───────────
    salesIntro:    null,
    salesExamples: [],   // { address, meta, price }

    // ── Strategy modules (from pdr_strategies, sort_order preserved) ──────
    strategies,

    // ── Strategic pathways narrative (Phase 4) ────────────────────────────
    pathwaysIntro: null,
    pathways:      [],   // { title, points[] }

    // ── Underlying sales table (Phase 4 — CSV parsing) ────────────────────
    salesRows: [],       // { address, salePrice, saleDate, bedrooms, bathrooms }
    salesNote: null,

    // ── Final statement (Phase 4 — staff narrative input) ─────────────────
    finalStatement: null,
  };
}
