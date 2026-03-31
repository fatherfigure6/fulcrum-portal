// ── parseSalesCsv ─────────────────────────────────────────────────────────────
// Parses a raw CSV string of property sales into normalised row objects.
// Returns: { rows, rowCount, warnings }
// Throws for missing required columns or zero valid rows.

// ---------------------------------------------------------------------------
// Quoted-field state-machine splitter
// Handles: "value with, comma" and "value with ""escaped"" quotes"
// ---------------------------------------------------------------------------
function splitCsvLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead — "" is an escaped quote inside a quoted field
        if (i + 1 < line.length && line[i + 1] === '"') {
          field += '"';
          i++; // skip the second quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
  }
  fields.push(field);
  return fields;
}

// ---------------------------------------------------------------------------
// Normalise a header string for alias matching
// Lowercase + strip all non-alphanumeric characters
// ---------------------------------------------------------------------------
function normaliseKey(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Map a normalised header string to a canonical field name
// ---------------------------------------------------------------------------
const HEADER_ALIAS_MAP = {
  address:       'address',
  fulladdress:   'address',
  streetaddress: 'street',  // treated as 'street' unless 'address' already claimed
  street:        'street',
  suburb:        'suburb',
  state:         'state',
  postcode:      'postcode',
  postalcode:    'postcode',
  zip:           'postcode',
  saleprice:     'salePrice',
  price:         'salePrice',
  soldprice:     'salePrice',
  saledate:      'saleDate',
  date:          'saleDate',
  solddate:      'saleDate',
  contractdate:  'saleDate',
  bed:           'bedrooms',
  beds:          'bedrooms',
  bedrooms:      'bedrooms',
  br:            'bedrooms',
  bath:          'bathrooms',
  baths:         'bathrooms',
  bathrooms:     'bathrooms',
};

// ---------------------------------------------------------------------------
// Parse a date string into ISO YYYY-MM-DD
// Supports: d-Mon-YY (e.g. 5-Mar-26) and ISO YYYY-MM-DD
// 2-digit year: 00–49 → 2000s, 50–99 → 1900s
// ---------------------------------------------------------------------------
const MONTH_MAP = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

function parseDateIso(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // d-Mon-YY or dd-Mon-YY or d-Mon-YYYY
  const dmy = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmy) {
    const day   = parseInt(dmy[1], 10);
    const mon   = MONTH_MAP[dmy[2].toLowerCase()];
    if (!mon) return null;
    let year = parseInt(dmy[3], 10);
    if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
    return `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export default function parseSalesCsv(csvText) {
  if (!csvText) throw new Error('No valid sales rows found');

  // Strip UTF-8 BOM
  const text = csvText.replace(/^\uFEFF/, '');

  // Split lines; trim \r; skip blank
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '');

  if (lines.length < 2) throw new Error('No valid sales rows found');

  // Parse header row
  const rawHeaders = splitCsvLine(lines[0]);

  // Build column-index → canonical-key map
  // 'address' takes priority over 'street' if both appear
  const colMap = {}; // canonicalKey → column index
  let hasAddressCol = false;

  rawHeaders.forEach((h, idx) => {
    const norm = normaliseKey(h);
    const canonical = HEADER_ALIAS_MAP[norm];
    if (!canonical) return;

    // 'streetaddress' normalised → 'street'; only claim 'address' slot if 'address' proper
    // If 'address' canonical already claimed, skip any further 'address' alias
    if (canonical === 'address') {
      hasAddressCol = true;
      if (!('address' in colMap)) colMap.address = idx;
    } else if (canonical === 'street') {
      // Only use as 'street' if no 'address' column already claimed from a real 'address' alias
      // We delay this decision — mark it for now and resolve after full scan
      if (!('street' in colMap)) colMap.street = idx;
    } else {
      if (!(canonical in colMap)) colMap[canonical] = idx;
    }
  });

  // If a real 'address' column exists, drop 'street' from colMap
  // (address wins; street becomes redundant for assembly but keep suburb/state/postcode)
  // hasAddressCol is set above only when canonical === 'address' matched

  // Validate required columns
  if (!('salePrice' in colMap)) throw new Error('Missing required column: Sale Price');
  if (!('saleDate' in colMap))  throw new Error('Missing required column: Sale Date');
  if (!hasAddressCol && !('street' in colMap)) {
    throw new Error('Missing required address column: provide Address or Street Address');
  }

  // Collect non-fatal warnings for missing optional columns
  const warnings = [];
  if (!('bedrooms' in colMap))  warnings.push('Bedrooms column not found');
  if (!('bathrooms' in colMap)) warnings.push('Bathrooms column not found');

  // Helper: get field value by canonical key (or '' if column absent)
  function getField(rowFields, key) {
    const idx = colMap[key];
    if (idx === undefined || idx >= rowFields.length) return '';
    return (rowFields[idx] ?? '').trim();
  }

  // Parse data rows
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);

    // Build address
    let address = '';
    if (hasAddressCol) {
      address = getField(fields, 'address');
    }
    if (!address && 'street' in colMap) {
      const street   = getField(fields, 'street');
      const suburb   = getField(fields, 'suburb');
      const state    = getField(fields, 'state').toUpperCase();
      const postcode = getField(fields, 'postcode');

      if (street) {
        // Assemble: "Street, Suburb STATE Postcode" — omit blank parts
        const parts = [street];
        const locality = [suburb, state, postcode].filter(Boolean).join(' ');
        if (locality) parts.push(locality);
        address = parts.join(', ');
      }
    }

    // Skip row if no usable address
    if (!address) continue;

    // Sale price
    const salePriceRaw = getField(fields, 'salePrice');
    const salePriceStripped = salePriceRaw.replace(/[$,\s]/g, '');
    const salePriceNumber = salePriceStripped ? parseFloat(salePriceStripped) || null : null;

    // Sale date
    const saleDateRaw = getField(fields, 'saleDate');
    const saleDateIso = parseDateIso(saleDateRaw);

    // Optional numeric fields
    const bedroomsRaw  = 'bedrooms'  in colMap ? getField(fields, 'bedrooms')  : '';
    const bathroomsRaw = 'bathrooms' in colMap ? getField(fields, 'bathrooms') : '';
    const bedrooms     = bedroomsRaw  ? parseInt(bedroomsRaw,  10) || null : null;
    const bathrooms    = bathroomsRaw ? parseInt(bathroomsRaw, 10) || null : null;

    // Ancillary address parts (for downstream use)
    const suburb   = getField(fields, 'suburb');
    const state    = getField(fields, 'state').toUpperCase();
    const postcode = getField(fields, 'postcode');

    rows.push({
      address,
      salePrice:       salePriceRaw,
      salePriceNumber,
      saleDate:        saleDateRaw,
      saleDateIso,
      bedrooms,
      bathrooms,
      suburb,
      state,
      postcode,
    });
  }

  if (rows.length === 0) throw new Error('No valid sales rows found');

  return { rows, rowCount: rows.length, warnings };
}
