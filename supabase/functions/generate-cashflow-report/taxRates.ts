// =============================================================================
// taxRates.ts — Australian tax rate constants
//
// This is the ONLY place tax brackets, rates, or thresholds may be defined.
// Never hardcode any of these values inline in calculator.ts or taxEngine.ts.
//
// Update TAX_TABLE_VERSION and the bracket data when ATO rates change.
// Source: https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents
// =============================================================================

export const TAX_TABLE_VERSION = '2024-25';

// ── Individual marginal tax rates (2024–25) ────────────────────────────────────
interface TaxBracket {
  min:  number;
  max:  number;
  base: number;
  rate: number;
}

export const INDIVIDUAL_TAX_BRACKETS: TaxBracket[] = [
  { min: 0,       max: 18200,    base: 0,      rate: 0.00  },
  { min: 18201,   max: 45000,    base: 0,      rate: 0.19  },
  { min: 45001,   max: 135000,   base: 5092,   rate: 0.325 },
  { min: 135001,  max: 190000,   base: 34260,  rate: 0.37  },
  { min: 190001,  max: Infinity, base: 54660,  rate: 0.45  },
];

export const MEDICARE_LEVY_RATE         = 0.02;
export const MEDICARE_LEVY_LOWER        = 23365;   // no levy below this
export const MEDICARE_LEVY_SHADE_UPPER  = 26000;   // full levy above this
export const MEDICARE_LEVY_SHADE_RATE   = 0.10;    // phase-in rate

// ── SMSF accumulation phase ────────────────────────────────────────────────────
export const SMSF_TAX_RATE         = 0.15;  // 15% on rental income / fund income
export const SMSF_CGT_EFFECTIVE    = 0.10;  // 10% effective on assets held > 12 months

// ── CGT discount (individuals) ─────────────────────────────────────────────────
export const INDIVIDUAL_CGT_DISCOUNT = 0.50;  // 50% discount for assets held > 12 months

// ── Helper functions ───────────────────────────────────────────────────────────

/**
 * Calculates Australian individual income tax for a given taxable income.
 * Uses 2024-25 ATO brackets defined above.
 */
export function calculateIndividualTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  const bracket = INDIVIDUAL_TAX_BRACKETS.find(
    b => taxableIncome >= b.min && taxableIncome <= b.max
  )!;
  return bracket.base + (taxableIncome - bracket.min) * bracket.rate;
}

/**
 * Calculates Medicare levy for a given taxable income.
 * Includes phase-in for low-income earners.
 */
export function calculateMedicareLevy(taxableIncome: number): number {
  if (taxableIncome <= MEDICARE_LEVY_LOWER) return 0;
  if (taxableIncome <= MEDICARE_LEVY_SHADE_UPPER) {
    return (taxableIncome - MEDICARE_LEVY_LOWER) * MEDICARE_LEVY_SHADE_RATE;
  }
  return taxableIncome * MEDICARE_LEVY_RATE;
}

/**
 * Total tax liability (income tax + Medicare levy).
 */
export function totalTaxLiability(taxableIncome: number): number {
  return calculateIndividualTax(taxableIncome) + calculateMedicareLevy(taxableIncome);
}
