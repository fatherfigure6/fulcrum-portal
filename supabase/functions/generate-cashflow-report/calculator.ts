// =============================================================================
// calculator.ts — pure cashflow calculation function
//
// This function is pure: no side effects, no network calls, no database access.
// Input: validated inputs_final payload.
// Output: complete report_data object ready to write to cashflow_reports.
//
// Rules:
//   - INFLATION_RATE sourced from defaults.ts (never hardcoded)
//   - PROPERTY_MGMT_RATE sourced from defaults.ts (never hardcoded)
//   - Tax rates sourced from taxRates.ts (never hardcoded inline)
//   - Full amortisation schedule is internal only — not included in return value
//   - Buyer incomes are not written into report_data (PII minimisation)
// =============================================================================

import {
  INFLATION_RATE,
  PROPERTY_MGMT_RATE,
  PROPERTY_MGMT_LETTING_FEE_WEEKS,
  PROPERTY_MGMT_LETTING_YEARS,
  DIVISION_43_RATE,
  DIVISION_43_LIFE_YEARS,
  DIVISION_40_RATE,
  PROJECTION_YEARS,
  SCHEMA_VERSION,
  ASSUMPTIONS_VERSION,
} from './defaults.ts';

import { TAX_TABLE_VERSION } from './taxRates.ts';

import {
  generatePISchedule,
  generateIOSchedule,
  monthlyPIRepayment,
  monthlyIORepayment,
  AnnualSnapshot,
} from './mortgageSchedule.ts';

import {
  calculateAnnualTaxBenefit,
  calculateAnnualTaxBenefitIO,
  establishmentFeeDeductibleYear,
  lmiDeductibleYear,
} from './taxEngine.ts';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InputsFinal {
  // Broker-submitted (carried into inputs_final)
  property_address:    { formatted_address: string; place_id?: string; lat?: number; lng?: number };
  purchase_price:      number;
  property_type:       'house' | 'unit_duplex' | 'villa_townhouse' | 'apartment';
  entity_type:         'individual' | 'joint' | 'tenants_in_common' | 'smsf';
  ownership_split?:    { buyer_1: number; buyer_2: number };
  buyer_1_name?:       string;
  buyer_1_income?:     number;
  buyer_2_name?:       string;
  buyer_2_income?:     number;
  smsf_fund_name?:     string;
  smsf_contributions?: number;
  loan_type:           'pi' | 'io' | 'both';
  pi_interest_rate?:   number;
  pi_loan_term?:       number;
  pi_annual_fee?:      number;
  io_interest_rate?:   number;
  io_loan_term?:       number;
  io_annual_fee?:      number;
  deposit:             number;
  lmi?:                number | null;
  establishment_fee?:  number;
  strata_fees_known?:  number | null;
  broker_notes?:       string | null;
  // Staff-completed
  weekly_rent:         number;
  build_cost?:         number | null;
  appliance_cost?:     number;
  build_year?:         number | null;
  depreciation_allowance?: number | null;
  assumptions_cap_growth:    number;   // e.g. 7.0
  assumptions_rental_growth: number;  // e.g. 3.5
  assumptions_vacancy:       number;  // weeks per year e.g. 4
  stamp_duty:          number;
  buyers_agent_fee?:   number;
  conveyancer?:        number;
  building_inspection?: number;
  pest_inspection?:    number;
  renovation_allowance?: number;
  other_cost_1_label?:  string | null;
  other_cost_1_amount?: number;
  other_cost_2_label?:  string | null;
  other_cost_2_amount?: number;
  council_rates:       number;
  water_rates:         number;
  insurance:           number;
  strata_fees?:        number;   // staff-entered (used if strata_fees_known is null)
  maintenance:         number;
  land_tax?:           number;
  ongoing_other_1_label?:  string | null;
  ongoing_other_1_amount?: number;
  ongoing_other_2_label?:  string | null;
  ongoing_other_2_amount?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function r2(n: number): number { return Math.round(n * 100) / 100; }
function r0(n: number): number { return Math.round(n); }

function inflate(base: number, year: number): number {
  // year 1 = base (no inflation yet), year 2 onward inflates
  return base * Math.pow(1 + INFLATION_RATE, year - 1);
}

function annualDepreciation(inputs: InputsFinal, currentYear: number): number {
  // Division 43 on renovation allowance applies to all property types (s43-10 ITAA 1997).
  // Capital improvements to an income-producing property: 2.5%/yr over 40 years.
  const renovationDep =
    inputs.renovation_allowance && inputs.renovation_allowance > 0 && currentYear <= DIVISION_43_LIFE_YEARS
      ? inputs.renovation_allowance * DIVISION_43_RATE
      : 0;

  if (inputs.property_type === 'house') {
    let dep = renovationDep;
    // Division 43 on build cost
    if (inputs.build_cost && inputs.build_year) {
      const yearsElapsed = (new Date().getFullYear() + currentYear - 1) - inputs.build_year;
      const remainingLife = DIVISION_43_LIFE_YEARS - yearsElapsed;
      if (remainingLife > 0) {
        dep += inputs.build_cost * DIVISION_43_RATE;
      }
    }
    // Division 40 on appliance cost (diminishing value, simplified as straight line)
    if (inputs.appliance_cost && inputs.appliance_cost > 0) {
      // Apply for first 10 years (1 / DIVISION_40_RATE = 10 years)
      const applianceLife = Math.round(1 / DIVISION_40_RATE);
      if (currentYear <= applianceLife) {
        dep += inputs.appliance_cost * DIVISION_40_RATE;
      }
    }
    return dep;
  }
  // Non-house: staff-entered depreciation allowance + renovation Division 43
  return (inputs.depreciation_allowance || 0) + renovationDep;
}

function resolvedStrataFees(inputs: InputsFinal): number {
  // Use broker-supplied strata_fees_known if provided, otherwise staff strata_fees
  if (inputs.strata_fees_known !== null && inputs.strata_fees_known !== undefined) {
    return inputs.strata_fees_known;
  }
  return inputs.strata_fees || 0;
}

// ── Main calculation function ──────────────────────────────────────────────────

export function calculate(inputs: InputsFinal, generatedAt: string): Record<string, unknown> {
  const hasPI = inputs.loan_type === 'pi' || inputs.loan_type === 'both';
  const hasIO = inputs.loan_type === 'io' || inputs.loan_type === 'both';

  const piRate    = inputs.pi_interest_rate  || 0;
  const piTerm    = inputs.pi_loan_term      || 30;
  const piAnnFee  = inputs.pi_annual_fee     || 0;
  const ioRate    = inputs.io_interest_rate  || 0;
  const ioTerm    = inputs.io_loan_term      || 30;
  const ioAnnFee  = inputs.io_annual_fee     || 0;

  // Loan principal = purchase_price + establishment_fee - deposit
  const estFee    = inputs.establishment_fee || 0;
  const deposit   = inputs.deposit           || 0;
  const lmi       = inputs.lmi              || 0;
  const principal = inputs.purchase_price + estFee - deposit;

  // Monthly loan repayments (base, excl. annual fee)
  const piMonthlyBase = hasPI ? monthlyPIRepayment(principal, piRate, piTerm) : 0;
  const ioMonthlyBase = hasIO ? monthlyIORepayment(principal, ioRate)         : 0;

  // Total monthly repayment incl. fee
  const piMonthlyTotal = hasPI ? piMonthlyBase + piAnnFee / 12 : 0;
  const ioMonthlyTotal = hasIO ? ioMonthlyBase + ioAnnFee / 12 : 0;

  // Amortisation schedules (annual snapshots, years 1–20)
  const piSchedule: AnnualSnapshot[] = hasPI
    ? generatePISchedule(principal, piRate, piTerm, PROJECTION_YEARS)
    : [];
  const ioSchedule: AnnualSnapshot[] = hasIO
    ? generateIOSchedule(principal, ioRate, ioTerm, PROJECTION_YEARS)
    : [];

  // ── Assumptions ─────────────────────────────────────────────────────────────
  const capGrowthRate    = inputs.assumptions_cap_growth    / 100;
  const rentalGrowthRate = inputs.assumptions_rental_growth / 100;
  const vacancyWeeks     = inputs.assumptions_vacancy;
  const vacancyRate      = vacancyWeeks / 52;

  // ── Strata fees (resolved) ────────────────────────────────────────────────
  const strataFees = resolvedStrataFees(inputs);

  // ── Ongoing costs (base values — inflated at INFLATION_RATE each year) ──────
  const baseOngoingCosts = {
    council_rates: inputs.council_rates     || 0,
    water_rates:   inputs.water_rates       || 0,
    insurance:     inputs.insurance         || 0,
    strata:        strataFees,
    maintenance:   inputs.maintenance       || 0,
    land_tax:      inputs.land_tax          || 0,
    other1:        inputs.ongoing_other_1_amount || 0,
    other2:        inputs.ongoing_other_2_amount || 0,
  };

  const totalBaseOngoing = Object.values(baseOngoingCosts).reduce((a, b) => a + b, 0);

  // ── Purchasing costs ───────────────────────────────────────────────────────
  const purchasingCosts = {
    deposit,
    stamp_duty:           inputs.stamp_duty        || 0,
    lmi,
    establishment_fee:    estFee,
    buyers_agent_fee:     inputs.buyers_agent_fee   || 0,
    conveyancer:          inputs.conveyancer         || 0,
    building_inspection:  inputs.building_inspection || 0,
    pest_inspection:      inputs.pest_inspection     || 0,
    renovation_allowance: inputs.renovation_allowance || 0,
    other_1:              inputs.other_cost_1_label
      ? { label: inputs.other_cost_1_label, amount: inputs.other_cost_1_amount || 0 }
      : undefined,
    other_2:              inputs.other_cost_2_label
      ? { label: inputs.other_cost_2_label, amount: inputs.other_cost_2_amount || 0 }
      : undefined,
  };
  const purchasingTotal = r0(
    purchasingCosts.deposit + purchasingCosts.stamp_duty + purchasingCosts.lmi +
    purchasingCosts.establishment_fee + purchasingCosts.buyers_agent_fee +
    purchasingCosts.conveyancer + purchasingCosts.building_inspection +
    purchasingCosts.pest_inspection + purchasingCosts.renovation_allowance +
    (purchasingCosts.other_1?.amount || 0) + (purchasingCosts.other_2?.amount || 0)
  );

  // ── Gross and net yield ────────────────────────────────────────────────────
  const annualRentYear1Gross  = inputs.weekly_rent * 52;
  const annualRentYear1Net    = annualRentYear1Gross * (1 - vacancyRate);
  const monthlyRentYear1Net   = annualRentYear1Net / 12;

  // Property management year 1
  const pmAnnualYear1  = annualRentYear1Gross * PROPERTY_MGMT_RATE;
  const pmLettingYear1 = PROPERTY_MGMT_LETTING_YEARS.includes(1)
    ? inputs.weekly_rent * PROPERTY_MGMT_LETTING_FEE_WEEKS
    : 0;
  const pmMonthlyYear1 = (pmAnnualYear1 + pmLettingYear1) / 12;

  const grossYieldPct = r2(annualRentYear1Gross / inputs.purchase_price * 100);
  const netYieldPct   = r2(
    (annualRentYear1Gross - totalBaseOngoing - pmAnnualYear1) /
    inputs.purchase_price * 100
  );

  // ── Monthly ongoing costs year 1 (non-mortgage, excl. property mgmt) ───────
  const monthlyOngoingYear1 = totalBaseOngoing / 12;

  // ── Day-one cashflow ────────────────────────────────────────────────────────
  // For day-one tax benefit we use year 1 calculations
  const dep1 = annualDepreciation(inputs, 1);
  const estFeeDeductY1 = establishmentFeeDeductibleYear(estFee, 1);
  const lmiDeductY1    = lmiDeductibleYear(lmi, 1, piTerm);

  const loanTermForDeductible = hasPI ? piTerm : ioTerm;

  const taxBenefitY1 = calculateAnnualTaxBenefit({
    entityType:       inputs.entity_type as any,
    year:             1,
    buyer1Income:     inputs.buyer_1_income,
    buyer2Income:     inputs.buyer_2_income,
    ownershipSplit:   inputs.ownership_split,
    smsfContributions: inputs.smsf_contributions,
    annualRentGross:  annualRentYear1Net,
    annualInterestPI: hasPI ? piSchedule[0].annual_interest : 0,
    annualInterestIO: hasIO ? ioSchedule[0].annual_interest : 0,
    piAnnualFee:      hasPI ? piAnnFee : 0,
    ioAnnualFee:      hasIO ? ioAnnFee : 0,
    annualPropertyMgmt: pmAnnualYear1 + pmLettingYear1,
    annualCouncilRates: baseOngoingCosts.council_rates,
    annualWaterRates:   baseOngoingCosts.water_rates,
    annualInsurance:    baseOngoingCosts.insurance,
    annualStrata:       baseOngoingCosts.strata,
    annualMaintenance:  baseOngoingCosts.maintenance,
    annualLandTax:      baseOngoingCosts.land_tax,
    annualDepreciation: dep1,
    establishmentFeeDeductible: estFeeDeductY1,
    lmiDeductibleThisYear:      lmiDeductY1,
    loanType: inputs.loan_type as any,
  });

  const piNetBeforeTaxY1 = hasPI
    ? r2(monthlyRentYear1Net - piMonthlyTotal - monthlyOngoingYear1 - pmMonthlyYear1)
    : undefined;
  const piTaxBenMonthlyY1 = hasPI ? r2(taxBenefitY1.annualTaxBenefit / 12) : undefined;
  const piNetAfterTaxY1   = hasPI && piNetBeforeTaxY1 !== undefined && piTaxBenMonthlyY1 !== undefined
    ? r2(piNetBeforeTaxY1 + piTaxBenMonthlyY1) : undefined;

  let ioNetBeforeTaxY1: number | undefined;
  let ioTaxBenMonthlyY1: number | undefined;
  let ioNetAfterTaxY1: number | undefined;

  if (hasIO) {
    const taxBenefitY1IO = calculateAnnualTaxBenefitIO({
      entityType:       inputs.entity_type as any,
      year:             1,
      buyer1Income:     inputs.buyer_1_income,
      buyer2Income:     inputs.buyer_2_income,
      ownershipSplit:   inputs.ownership_split,
      annualRentGross:  annualRentYear1Net,
      annualInterestPI: 0,
      annualInterestIO: ioSchedule[0].annual_interest,
      piAnnualFee:      0,
      ioAnnualFee:      ioAnnFee,
      annualPropertyMgmt: pmAnnualYear1 + pmLettingYear1,
      annualCouncilRates: baseOngoingCosts.council_rates,
      annualWaterRates:   baseOngoingCosts.water_rates,
      annualInsurance:    baseOngoingCosts.insurance,
      annualStrata:       baseOngoingCosts.strata,
      annualMaintenance:  baseOngoingCosts.maintenance,
      annualLandTax:      baseOngoingCosts.land_tax,
      annualDepreciation: dep1,
      establishmentFeeDeductible: estFeeDeductY1,
      lmiDeductibleThisYear:      lmiDeductY1,
      loanType: 'io',
    });
    ioNetBeforeTaxY1  = r2(monthlyRentYear1Net - ioMonthlyTotal - monthlyOngoingYear1 - pmMonthlyYear1);
    ioTaxBenMonthlyY1 = r2(taxBenefitY1IO / 12);
    ioNetAfterTaxY1   = r2(ioNetBeforeTaxY1 + ioTaxBenMonthlyY1);
  }

  // ── Annual schedule (years 1–20) ───────────────────────────────────────────
  const annualSchedule: Record<string, unknown>[] = [];
  let cumulativeTaxSaving     = 0;
  let cumulativeCashContribPI = 0;
  let cumulativeCashContribIO = 0;
  let crossoverYearPI: number | null = null;
  let crossoverYearIO: number | null = null;

  for (let year = 1; year <= PROJECTION_YEARS; year++) {
    // Rental growth
    const weeklyRentY      = inputs.weekly_rent * Math.pow(1 + rentalGrowthRate, year - 1);
    const monthlyRentGross = weeklyRentY * 52 / 12;
    const monthlyRentNet   = monthlyRentGross * (1 - vacancyRate);
    const annualRentNetY   = monthlyRentNet * 12;

    // Capital value
    const marketValue = r0(inputs.purchase_price * Math.pow(1 + capGrowthRate, year));

    // Loan balances
    const loanBalPI = hasPI ? (piSchedule[year - 1]?.loan_balance ?? 0) : undefined;
    const loanBalIO = hasIO ? (ioSchedule[year - 1]?.loan_balance ?? 0) : undefined;

    // Equity
    const equityPI = hasPI && loanBalPI !== undefined ? r0(marketValue - loanBalPI) : undefined;
    const equityIO = hasIO && loanBalIO !== undefined ? r0(marketValue - loanBalIO) : undefined;

    // Ongoing costs (inflation-adjusted at INFLATION_RATE).
    // Rental management fees grow separately with rent (percentage-based).
    const ongoingY = {
      council_rates: inflate(baseOngoingCosts.council_rates, year),
      water_rates:   inflate(baseOngoingCosts.water_rates,   year),
      insurance:     inflate(baseOngoingCosts.insurance,     year),
      strata:        inflate(baseOngoingCosts.strata,        year),
      maintenance:   inflate(baseOngoingCosts.maintenance,   year),
      land_tax:      inflate(baseOngoingCosts.land_tax,      year),
      other1:        inflate(baseOngoingCosts.other1,        year),
      other2:        inflate(baseOngoingCosts.other2,        year),
    };
    const totalOngoingY    = Object.values(ongoingY).reduce((a, b) => a + b, 0);
    const monthlyOngoingY  = totalOngoingY / 12;

    // Property management (inflated via rent growth, not inflation)
    const pmAnnualY  = weeklyRentY * 52 * PROPERTY_MGMT_RATE;
    const pmLettingY = PROPERTY_MGMT_LETTING_YEARS.includes(year)
      ? weeklyRentY * PROPERTY_MGMT_LETTING_FEE_WEEKS
      : 0;
    const pmMonthlyY = (pmAnnualY + pmLettingY) / 12;

    // Depreciation for this year
    const depY = annualDepreciation(inputs, year);

    // Borrowing cost deductibles
    const estFeeDeductY = establishmentFeeDeductibleYear(estFee, year);
    const lmiDeductY    = lmiDeductibleYear(lmi, year, loanTermForDeductible);

    // Tax benefit (PI path for individual/joint/TIC/SMSF)
    const taxInputsY = {
      entityType:         inputs.entity_type as any,
      year,
      buyer1Income:       inputs.buyer_1_income,
      buyer2Income:       inputs.buyer_2_income,
      ownershipSplit:     inputs.ownership_split,
      annualRentGross:    annualRentNetY,
      annualInterestPI:   hasPI ? (piSchedule[year - 1]?.annual_interest ?? 0) : 0,
      annualInterestIO:   hasIO ? (ioSchedule[year - 1]?.annual_interest ?? 0) : 0,
      piAnnualFee:        hasPI ? piAnnFee : 0,
      ioAnnualFee:        hasIO ? ioAnnFee : 0,
      annualPropertyMgmt: pmAnnualY + pmLettingY,
      annualCouncilRates: ongoingY.council_rates,
      annualWaterRates:   ongoingY.water_rates,
      annualInsurance:    ongoingY.insurance,
      annualStrata:       ongoingY.strata,
      annualMaintenance:  ongoingY.maintenance,
      annualLandTax:      ongoingY.land_tax,
      annualDepreciation: depY,
      establishmentFeeDeductible: estFeeDeductY,
      lmiDeductibleThisYear: lmiDeductY,
      loanType: inputs.loan_type as any,
    };

    const taxResultPI = calculateAnnualTaxBenefit(taxInputsY);
    const piTaxMonthly = hasPI ? r2(taxResultPI.annualTaxBenefit / 12) : undefined;
    const piNetBefore  = hasPI ? r2(monthlyRentNet - piMonthlyTotal - monthlyOngoingY - pmMonthlyY) : undefined;
    const piNetAfter   = hasPI && piNetBefore !== undefined && piTaxMonthly !== undefined
      ? r2(piNetBefore + piTaxMonthly) : undefined;

    let ioNetBefore: number | undefined;
    let ioTaxMonthly: number | undefined;
    let ioNetAfter: number | undefined;

    if (hasIO) {
      const taxResultIO = calculateAnnualTaxBenefitIO({ ...taxInputsY, loanType: 'io' });
      ioTaxMonthly = r2(taxResultIO / 12);
      ioNetBefore  = r2(monthlyRentNet - ioMonthlyTotal - monthlyOngoingY - pmMonthlyY);
      ioNetAfter   = r2(ioNetBefore + ioTaxMonthly);
    }

    // Crossover detection
    if (crossoverYearPI === null && piNetAfter !== undefined && piNetAfter >= 0) {
      crossoverYearPI = year;
    }
    if (crossoverYearIO === null && ioNetAfter !== undefined && ioNetAfter >= 0) {
      crossoverYearIO = year;
    }

    // Cumulative tracking
    const yearTaxSaving = taxResultPI.annualTaxBenefit;
    cumulativeTaxSaving += yearTaxSaving;

    if (hasPI && piNetAfter !== undefined) {
      cumulativeCashContribPI += piNetAfter < 0 ? Math.abs(piNetAfter) * 12 : 0;
    }
    if (hasIO && ioNetAfter !== undefined) {
      cumulativeCashContribIO += ioNetAfter < 0 ? Math.abs(ioNetAfter) * 12 : 0;
    }

    // Yields
    const yieldOnCost  = r2((weeklyRentY * 52) / inputs.purchase_price * 100);
    const yieldOnValue = r2((weeklyRentY * 52) / marketValue * 100);

    // ROI (based on PI equity)
    const equityUsed = equityPI !== undefined ? equityPI : (equityIO || 0);
    const roi = purchasingTotal > 0
      ? r2((equityUsed - purchasingTotal) / purchasingTotal * 100)
      : 0;

    annualSchedule.push({
      year,
      market_value:     marketValue,
      loan_balance_pi:  loanBalPI !== undefined ? r0(loanBalPI) : undefined,
      loan_balance_io:  loanBalIO !== undefined ? r0(loanBalIO) : undefined,
      equity_pi:        equityPI,
      equity_io:        equityIO,
      equity_pct_pi:    equityPI !== undefined ? r2(equityPI / marketValue * 100) : undefined,
      equity_pct_io:    equityIO !== undefined ? r2(equityIO / marketValue * 100) : undefined,
      weekly_rent:               r2(weeklyRentY),
      monthly_rent_gross:        r2(monthlyRentGross),
      monthly_rent_net:          r2(monthlyRentNet),
      monthly_ongoing_costs:     r2(monthlyOngoingY),
      property_mgmt_monthly:     r2(pmMonthlyY),
      pi_monthly_net_before_tax: piNetBefore,
      pi_monthly_tax_benefit:    piTaxMonthly,
      pi_monthly_net_after_tax:  piNetAfter,
      io_monthly_net_before_tax: ioNetBefore,
      io_monthly_tax_benefit:    ioTaxMonthly,
      io_monthly_net_after_tax:  ioNetAfter,
      yield_on_cost_pct:         yieldOnCost,
      yield_on_value_pct:        yieldOnValue,
      total_interest_paid_pi:    hasPI ? r0(piSchedule[year - 1]?.total_interest_paid ?? 0) : undefined,
      total_interest_paid_io:    hasIO ? r0(ioSchedule[year - 1]?.total_interest_paid ?? 0) : undefined,
      cumulative_tax_saving:     r0(cumulativeTaxSaving),
      cumulative_cash_contributed_pi: hasPI ? r0(cumulativeCashContribPI) : undefined,
      cumulative_cash_contributed_io: hasIO ? r0(cumulativeCashContribIO) : undefined,
      roi_pct: roi,
    });
  }

  // ── Milestones ─────────────────────────────────────────────────────────────
  function milestone(year: number) {
    const row = annualSchedule.find(r => r.year === year)!;
    return {
      year,
      market_value:              row.market_value,
      loan_balance_pi:           row.loan_balance_pi,
      loan_balance_io:           row.loan_balance_io,
      equity_pi:                 row.equity_pi,
      equity_io:                 row.equity_io,
      equity_pct_pi:             row.equity_pct_pi,
      equity_pct_io:             row.equity_pct_io,
      total_interest_paid_pi:    row.total_interest_paid_pi,
      total_interest_paid_io:    row.total_interest_paid_io,
      gross_yield_on_cost_pct:   row.yield_on_cost_pct,
      gross_yield_on_value_pct:  row.yield_on_value_pct,
      monthly_net_after_tax_pi:  row.pi_monthly_net_after_tax,
      monthly_net_after_tax_io:  row.io_monthly_net_after_tax,
      cumulative_tax_saving:     row.cumulative_tax_saving,
      roi_pct:                   row.roi_pct,
    };
  }

  // ── Entity summary (no raw incomes) ────────────────────────────────────────
  const entityObj: Record<string, unknown> = {
    type: inputs.entity_type,
  };
  if (inputs.entity_type === 'smsf') {
    entityObj.smsf_fund_name = inputs.smsf_fund_name;
  } else {
    const buyers: Array<{ name: string; ownership_pct: number }> = [];
    if (inputs.buyer_1_name) {
      const pct = inputs.ownership_split?.buyer_1 ?? 100;
      buyers.push({ name: inputs.buyer_1_name, ownership_pct: pct });
    }
    if (inputs.buyer_2_name && inputs.ownership_split) {
      buyers.push({ name: inputs.buyer_2_name, ownership_pct: inputs.ownership_split.buyer_2 });
    }
    entityObj.buyers = buyers;
  }

  // ── Assemble report_data ────────────────────────────────────────────────────
  return {
    meta: {
      generated_at:      generatedAt,
      schema_version:    SCHEMA_VERSION,
      assumptions_version: ASSUMPTIONS_VERSION,
      tax_table_version: TAX_TABLE_VERSION,
    },
    property: {
      address:        inputs.property_address.formatted_address,
      purchase_price: inputs.purchase_price,
      property_type:  inputs.property_type,
      weekly_rent:    inputs.weekly_rent,
    },
    entity: entityObj,
    loans: {
      ...(hasPI ? {
        pi: {
          rate:             piRate,
          term_years:       piTerm,
          annual_fee:       piAnnFee,
          principal,
          monthly_repayment: r2(piMonthlyTotal),
        }
      } : {}),
      ...(hasIO ? {
        io: {
          rate:             ioRate,
          term_years:       ioTerm,
          annual_fee:       ioAnnFee,
          principal,
          monthly_repayment: r2(ioMonthlyTotal),
        }
      } : {}),
    },
    purchasing_costs: {
      ...purchasingCosts,
      total: purchasingTotal,
    },
    assumptions: {
      cap_growth_rate:     capGrowthRate,
      rental_growth_rate:  rentalGrowthRate,
      vacancy_weeks:       vacancyWeeks,
      vacancy_rate:        r2(vacancyRate),
      inflation_rate:      INFLATION_RATE,
      property_mgmt_rate:  PROPERTY_MGMT_RATE,
    },
    day_one: {
      gross_yield_pct:       grossYieldPct,
      net_yield_pct:         netYieldPct,
      pi_monthly_repayment:  hasPI ? r2(piMonthlyTotal) : undefined,
      io_monthly_repayment:  hasIO ? r2(ioMonthlyTotal) : undefined,
      pi_monthly_rental_income:  hasPI ? r2(monthlyRentYear1Net) : undefined,
      pi_monthly_ongoing_costs:  hasPI ? r2(monthlyOngoingYear1) : undefined,
      pi_monthly_net_before_tax: piNetBeforeTaxY1,
      pi_monthly_tax_benefit:    piTaxBenMonthlyY1,
      pi_monthly_net_after_tax:  piNetAfterTaxY1,
      io_monthly_repayment:      hasIO ? r2(ioMonthlyTotal) : undefined,
      io_monthly_net_before_tax: ioNetBeforeTaxY1,
      io_monthly_tax_benefit:    ioTaxBenMonthlyY1,
      io_monthly_net_after_tax:  ioNetAfterTaxY1,
      initial_equity_pi:         hasPI ? r0(inputs.purchase_price - principal - purchasingTotal) : undefined,
      initial_equity_io:         hasIO ? r0(inputs.purchase_price - principal - purchasingTotal) : undefined,
      annual_tax_benefit_total:  r0(taxBenefitY1.annualTaxBenefit),
      annual_tax_benefit_per_buyer: taxBenefitY1.perBuyer
        ? taxBenefitY1.perBuyer.map((b, i) => ({
            name: i === 0 ? (inputs.buyer_1_name || 'Buyer 1') : (inputs.buyer_2_name || 'Buyer 2'),
            annual_saving: r0(b.annualSaving),
          }))
        : undefined,
    },
    annual_schedule: annualSchedule,
    milestones: {
      year_5:  milestone(5),
      year_10: milestone(10),
      year_20: milestone(20),
    },
    crossover_year_pi: crossoverYearPI,
    crossover_year_io: crossoverYearIO,
  };
}
