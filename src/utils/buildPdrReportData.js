// ── PDR Report Data Assembly ──────────────────────────────────────────────────
// Takes a normalised PDR request object and returns a stable report-ready object
// for rendering in PdrReportPreview. All field names are camelCase.

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

// Strip currency symbols and commas before parsing — handles "$850,000" etc.
function parsePrice(raw) {
  if (raw == null) return NaN;
  const cleaned = String(raw).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? NaN : n;
}

export default function buildPdrReportData(request, salesRows = []) {
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

  // ── Computed market stats (derived from salesRows) ────────────────────────
  const numericPrices = salesRows
    .map(r => parsePrice(r.salePrice))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  const medianPrice = numericPrices.length > 0
    ? numericPrices[Math.floor(numericPrices.length / 2)]
    : null;

  const budgetNum = request.budgetMax != null ? Number(request.budgetMax) : null;

  // Positive = budget above median, negative = budget below median
  const budgetVsMedian = (budgetNum != null && medianPrice != null)
    ? budgetNum - medianPrice
    : null;

  const budgetVsMedianPct = (budgetNum != null && medianPrice != null && medianPrice !== 0)
    ? Math.round(((budgetNum - medianPrice) / medianPrice) * 100)
    : null;

  // Three-state alignment: above ≥ 1.02×median, near ≥ 0.93×median, below < 0.93×median
  let medianAlignmentStatus = null;
  let medianAlignmentLabel  = null;
  if (budgetNum != null && medianPrice != null) {
    if (budgetNum >= medianPrice * 1.02) {
      medianAlignmentStatus = 'above';
      medianAlignmentLabel  = 'Budget above median';
    } else if (budgetNum >= medianPrice * 0.93) {
      medianAlignmentStatus = 'near';
      medianAlignmentLabel  = 'Budget near median';
    } else {
      medianAlignmentStatus = 'below';
      medianAlignmentLabel  = 'Budget below median';
    }
  }

  const affordableSales = budgetNum != null
    ? numericPrices.filter(p => p <= budgetNum)
    : [];
  const affordableCount = affordableSales.length;
  const affordablePct   = numericPrices.length > 0
    ? Math.round((affordableCount / numericPrices.length) * 100)
    : null;

  const priceMin = numericPrices.length > 0 ? numericPrices[0]                          : null;
  const priceMax = numericPrices.length > 0 ? numericPrices[numericPrices.length - 1]   : null;
  const allSalePrices = numericPrices; // sorted ascending, raw numbers for spark chart

  // Best-fit: highest-priced sale at or below budgetMax, after filtering invalid prices
  let bestFitProperty = null;
  if (budgetNum != null) {
    const affordable = salesRows
      .filter(r => {
        const p = parsePrice(r.salePrice);
        return !isNaN(p) && p > 0 && p <= budgetNum;
      })
      .sort((a, b) => parsePrice(b.salePrice) - parsePrice(a.salePrice));

    if (affordable.length > 0) {
      const best = affordable[0];
      // Image sourcing priority:
      //   1. best._embeddedImage — base64/blob URL extracted from spreadsheet row
      //   2. best.imageUrl — explicit URL from CSV/row data
      //   3. null — renderer shows grey "No image" placeholder
      const imageUrl = best._embeddedImage || best.imageUrl || null;
      bestFitProperty = {
        address:   best.address   || null,
        suburb:    best.suburb    || null,
        state:     best.state     || null,
        postcode:  best.postcode  || null,
        salePrice: best.salePrice || null,
        beds:      best.bedrooms  ?? best.beds   ?? null,
        baths:     best.bathrooms ?? best.baths  ?? null,
        cars:      best.cars      ?? null,
        landSize:  best.landSize  || null,
        floorSize: best.floorSize || null,
        yearBuilt: best.yearBuilt || null,
        imageUrl,
      };
    }
  }

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

    // ── Strategy modules (from pdr_strategies, sort_order preserved) ──────
    strategies,

    // ── Strategic pathways narrative ──────────────────────────────────────
    pathways: [],

    // ── Underlying sales table (populated from parseSalesCsv) ────────────
    salesRows,
    salesRowCount: salesRows.length,
    salesNote: null,

    // ── Final statement ───────────────────────────────────────────────────
    finalStatement: null,

    // ── Computed market stats ─────────────────────────────────────────────
    budgetMax:            budgetNum,
    medianPrice,
    budgetVsMedian,
    budgetVsMedianPct,
    medianAlignmentStatus,
    medianAlignmentLabel,
    affordableCount,
    affordablePct,
    priceMin,
    priceMax,
    allSalePrices,
    bestFitProperty,
  };
}
