// =============================================================================
// taxEngine.ts — annual tax benefit calculation per entity type
//
// Reads tax rates exclusively from taxRates.ts — no inline rate values.
// Returns the annual tax SAVING (positive = saves tax, negative = extra tax).
//
// Supported entity types: individual, joint, tenants_in_common, smsf
// =============================================================================

import {
  totalTaxLiability,
  SMSF_TAX_RATE,
} from './taxRates.ts';

import {
  ESTABLISHMENT_FEE_AMORT_YEARS,
  LMI_FULL_DEDUCTION_THRESHOLD,
} from './defaults.ts';

export interface TaxEngineInputs {
  entityType:       'individual' | 'joint' | 'tenants_in_common' | 'smsf';
  year:             number;        // 1-based projection year
  // Buyers
  buyer1Income?:    number;
  buyer2Income?:    number;
  ownershipSplit?:  { buyer_1: number; buyer_2: number };   // percentages
  smsfContributions?: number;
  // Rental
  annualRentGross:  number;        // vacancy-adjusted annual rent
  // Deductible ongoing costs (annual, already inflation-adjusted for this year)
  annualInterestPI?: number;       // from PI schedule for this year
  annualInterestIO?: number;       // from IO schedule for this year (if both)
  piAnnualFee?:     number;
  ioAnnualFee?:     number;
  annualPropertyMgmt: number;      // management fee + letting fee (combined annual)
  annualCouncilRates: number;
  annualWaterRates:   number;
  annualInsurance:    number;
  annualStrata:       number;
  annualMaintenance:  number;
  annualLandTax:      number;
  annualDepreciation: number;
  // Borrowing cost amortisation (year-specific)
  establishmentFeeDeductible: number;  // establishment_fee / 5 for years 1-5, else 0
  lmiDeductibleThisYear:      number;  // LMI / loan_term for years 1–term, or full amount year 1
  // Loan type (determines which interest to use)
  loanType: 'pi' | 'io' | 'both';
}

export interface TaxBenefitResult {
  annualTaxBenefit:    number;   // combined household saving (positive = tax saved)
  perBuyer?: Array<{ name: string; annualSaving: number }>;
  buyerNames?: string[];
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function totalDeductibles(inputs: TaxEngineInputs, interestToUse: number): number {
  return (
    interestToUse +
    (inputs.piAnnualFee  || 0) +
    (inputs.ioAnnualFee  || 0) +
    inputs.annualPropertyMgmt +
    inputs.annualCouncilRates +
    inputs.annualWaterRates +
    inputs.annualInsurance +
    inputs.annualStrata +
    inputs.annualMaintenance +
    inputs.annualLandTax +
    inputs.annualDepreciation +
    inputs.establishmentFeeDeductible +
    inputs.lmiDeductibleThisYear
  );
}

function individualTaxSaving(
  preTaxIncome:   number,
  annualRent:     number,
  deductibles:    number,
  ownershipPct:   number,   // 0–100
): number {
  const rentShare       = annualRent * (ownershipPct / 100);
  const deductibleShare = deductibles * (ownershipPct / 100);
  const preTax          = totalTaxLiability(preTaxIncome);
  const postTaxableIncome = preTaxIncome + rentShare - deductibleShare;
  const postTax         = totalTaxLiability(Math.max(0, postTaxableIncome));
  return preTax - postTax;   // positive = tax saved (negative gearing benefit)
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Calculate the annual tax benefit for the given year and entity type.
 * All rates must come from taxRates.ts — no inline values.
 */
export function calculateAnnualTaxBenefit(inputs: TaxEngineInputs): TaxBenefitResult {
  // Determine which interest expense to use based on loan type
  // For "both": use PI interest (IO comparison uses IO tax separately)
  const primaryInterest =
    inputs.loanType === 'io'
      ? (inputs.annualInterestIO || 0)
      : (inputs.annualInterestPI || 0);

  const deductibles = totalDeductibles(inputs, primaryInterest);

  switch (inputs.entityType) {

    // ── Individual ────────────────────────────────────────────────────────────
    case 'individual': {
      const saving = individualTaxSaving(
        inputs.buyer1Income || 0,
        inputs.annualRentGross,
        deductibles,
        100,
      );
      return { annualTaxBenefit: saving };
    }

    // ── Joint tenants / Tenants in common ─────────────────────────────────────
    case 'joint':
    case 'tenants_in_common': {
      const split = inputs.ownershipSplit ?? { buyer_1: 50, buyer_2: 50 };
      const saving1 = individualTaxSaving(
        inputs.buyer1Income || 0,
        inputs.annualRentGross,
        deductibles,
        split.buyer_1,
      );
      const saving2 = individualTaxSaving(
        inputs.buyer2Income || 0,
        inputs.annualRentGross,
        deductibles,
        split.buyer_2,
      );
      return {
        annualTaxBenefit: saving1 + saving2,
        perBuyer: [
          { name: 'Buyer 1', annualSaving: saving1 },
          { name: 'Buyer 2', annualSaving: saving2 },
        ],
      };
    }

    // ── SMSF ──────────────────────────────────────────────────────────────────
    case 'smsf': {
      // SMSF accumulation: 15% flat tax on net income
      // Rental income and deductible costs are subject to 15% fund tax rate.
      // Net rental income for fund tax purposes:
      const netRentalForTax = inputs.annualRentGross - deductibles;
      // Positive net = fund pays 15% additional tax (a cost, not a saving)
      // Negative net = fund can offset against contributions tax at 15% (a saving)
      const annualTaxBenefit = -(netRentalForTax * SMSF_TAX_RATE);
      // Negative netRental → benefit = positive saving
      // Positive netRental → benefit = negative (extra tax)
      return { annualTaxBenefit };
    }

    default:
      return { annualTaxBenefit: 0 };
  }
}

/**
 * Same as calculateAnnualTaxBenefit but uses IO interest.
 * Used to compute the IO-specific tax benefit for "both" loan type comparisons.
 */
export function calculateAnnualTaxBenefitIO(inputs: TaxEngineInputs): number {
  const inputsIO = { ...inputs, loanType: 'io' as const };
  return calculateAnnualTaxBenefit(inputsIO).annualTaxBenefit;
}

/**
 * Returns the deductible establishment fee for a given year.
 * Amortised over ESTABLISHMENT_FEE_AMORT_YEARS years.
 */
export function establishmentFeeDeductibleYear(
  establishmentFee: number,
  year: number,
): number {
  if (year < 1 || year > ESTABLISHMENT_FEE_AMORT_YEARS) return 0;
  return establishmentFee / ESTABLISHMENT_FEE_AMORT_YEARS;
}

/**
 * Returns the deductible LMI amount for a given year.
 * <= $100: full deduction in year 1.
 * > $100: amortised over loan term years.
 */
export function lmiDeductibleYear(
  lmi: number,
  year: number,
  loanTermYears: number,
): number {
  if (!lmi || lmi <= 0) return 0;
  if (lmi <= LMI_FULL_DEDUCTION_THRESHOLD) {
    return year === 1 ? lmi : 0;
  }
  // Amortise over the loan term
  if (year >= 1 && year <= loanTermYears) {
    return lmi / loanTermYears;
  }
  return 0;
}
