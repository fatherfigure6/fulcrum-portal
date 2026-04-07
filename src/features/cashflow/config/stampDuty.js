// =============================================================================
// stampDuty.js — WA OSR stamp duty auto-calculation (client-side)
//
// Used by the staff form to pre-fill the stamp_duty field on load.
// Staff may override the calculated figure.
//
// Source: WA State Revenue Office — update brackets when OSR rates change.
// Rates valid as at April 2026.
// =============================================================================

const WA_STAMP_DUTY_BRACKETS = [
  { min: 0,       max: 120000,   base: 0,      rate: 0.019  },
  { min: 120001,  max: 150000,   base: 2280,   rate: 0.0285 },
  { min: 150001,  max: 360000,   base: 3135,   rate: 0.038  },
  { min: 360001,  max: 725000,   base: 11115,  rate: 0.045  },
  { min: 725001,  max: Infinity, base: 27540,  rate: 0.051  },
];

const WA_TRANSFER_FEE_BRACKETS = [
  { min: 0,        max: 85000,   fee: 172.50 },
  { min: 85001,    max: 120000,  fee: 209.00 },
  { min: 120001,   max: 200000,  fee: 241.00 },
  { min: 200001,   max: 300000,  fee: 306.50 },
  { min: 300001,   max: 400000,  fee: 371.00 },
  { min: 400001,   max: 500000,  fee: 435.50 },
  { min: 500001,   max: 600000,  fee: 500.00 },
  { min: 600001,   max: 700000,  fee: 564.50 },
  { min: 700001,   max: 800000,  fee: 629.00 },
  { min: 800001,   max: 1000000, fee: 693.50 },
  { min: 1000001,  max: Infinity, fee: 758.00 },
];

/**
 * Calculates WA stamp duty + transfer fee for a given purchase price.
 * Returns the total rounded to the nearest dollar.
 */
export function calculateWAStampDuty(purchasePrice) {
  if (!purchasePrice || purchasePrice <= 0) return 0;

  const dutyBracket = WA_STAMP_DUTY_BRACKETS.find(
    b => purchasePrice >= b.min && purchasePrice <= b.max
  );
  if (!dutyBracket) return 0;

  const duty = dutyBracket.base + (purchasePrice - dutyBracket.min) * dutyBracket.rate;

  const feeBracket = WA_TRANSFER_FEE_BRACKETS.find(
    b => purchasePrice >= b.min && purchasePrice <= b.max
  );
  const transferFee = feeBracket ? feeBracket.fee : 758;

  return Math.round(duty + transferFee);
}
