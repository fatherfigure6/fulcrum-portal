// =============================================================================
// mortgageSchedule.ts — P&I and IO amortisation schedule generator
//
// Generates a monthly amortisation schedule internally and returns only the
// annual snapshots (years 1–20). The full 360-row monthly schedule is
// computed locally and discarded — it is never stored or returned.
// =============================================================================

export interface AnnualSnapshot {
  year:                number;
  loan_balance:        number;   // outstanding balance at year-end
  annual_interest:     number;   // interest paid during this year (for tax deductions)
  total_interest_paid: number;   // cumulative interest from year 1 to this year
}

/**
 * Generates annual P&I snapshots for years 1–20.
 *
 * @param principal        - Loan amount (purchase_price + establishment_fee - deposit)
 * @param annualRatePct    - Annual interest rate as a percentage (e.g. 5.89)
 * @param termYears        - Loan term in years
 * @param projectionYears  - Number of years to snapshot (default 20)
 */
export function generatePISchedule(
  principal:       number,
  annualRatePct:   number,
  termYears:       number,
  projectionYears  = 20,
): AnnualSnapshot[] {
  const monthlyRate  = annualRatePct / 100 / 12;
  const totalMonths  = termYears * 12;

  // Monthly base payment (excluding fee)
  // M = P × [r(1+r)^n] / [(1+r)^n - 1]
  const factor    = Math.pow(1 + monthlyRate, totalMonths);
  const monthlyPmt = monthlyRate === 0
    ? principal / totalMonths
    : principal * (monthlyRate * factor) / (factor - 1);

  let balance          = principal;
  let totalInterest    = 0;
  const snapshots: AnnualSnapshot[] = [];

  for (let year = 1; year <= projectionYears; year++) {
    let yearInterest = 0;

    for (let m = 1; m <= 12; m++) {
      if (balance <= 0) break;
      const interest  = balance * monthlyRate;
      const principalPaid = Math.min(monthlyPmt - interest, balance);
      yearInterest += interest;
      balance      -= principalPaid;
      if (balance < 0.01) balance = 0;
    }

    totalInterest += yearInterest;

    snapshots.push({
      year,
      loan_balance:        Math.round(Math.max(0, balance) * 100) / 100,
      annual_interest:     Math.round(yearInterest * 100) / 100,
      total_interest_paid: Math.round(totalInterest * 100) / 100,
    });
  }

  return snapshots;
}

/**
 * Generates annual IO snapshots for years 1–20.
 *
 * IO loans: balance is unchanged throughout the term.
 * Monthly payment = balance × monthly_rate (interest only).
 * After the IO term ends, assume the loan converts to P&I — balance stays
 * constant for projection purposes (per PRD: reversion not modelled).
 *
 * @param principal      - Loan amount
 * @param annualRatePct  - Annual interest rate as a percentage
 * @param termYears      - IO term in years (used for monthly payment)
 * @param projectionYears
 */
export function generateIOSchedule(
  principal:      number,
  annualRatePct:  number,
  termYears:      number,
  projectionYears = 20,
): AnnualSnapshot[] {
  const monthlyRate  = annualRatePct / 100 / 12;
  const annualInterest = principal * annualRatePct / 100;

  let totalInterest = 0;
  const snapshots: AnnualSnapshot[] = [];

  for (let year = 1; year <= projectionYears; year++) {
    // IO: balance never reduces — interest is fixed each year
    const yearInterest = Math.round(annualInterest * 100) / 100;
    totalInterest += yearInterest;

    snapshots.push({
      year,
      loan_balance:        principal,  // IO balance is constant
      annual_interest:     yearInterest,
      total_interest_paid: Math.round(totalInterest * 100) / 100,
    });
  }

  return snapshots;
}

/**
 * Monthly P&I repayment (base payment — excluding annual fee).
 */
export function monthlyPIRepayment(
  principal:    number,
  annualRatePct: number,
  termYears:    number,
): number {
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return principal * (r * factor) / (factor - 1);
}

/**
 * Monthly IO repayment (base payment — excluding annual fee).
 */
export function monthlyIORepayment(
  principal:    number,
  annualRatePct: number,
): number {
  return principal * (annualRatePct / 100 / 12);
}
