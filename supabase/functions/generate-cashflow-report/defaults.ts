// =============================================================================
// defaults.ts — system constants for the cashflow calculation engine
//
// ALL constants must be sourced from this file.
// Changing a constant here is a deliberate change to Fulcrum house rules.
// =============================================================================

export const ASSUMPTIONS_VERSION = '1.0';

// Annual inflation rate — system constant, not editable via any form field.
// Used for display purposes only; ongoing costs are modelled as fixed (not inflated).
export const INFLATION_RATE = 0.03;  // 3%

// Property management — Perth Rental Management standard fee structure
export const PROPERTY_MGMT_RATE              = 0.077;  // 7.7% of gross annual rent
export const PROPERTY_MGMT_LETTING_FEE_WEEKS = 2;      // 2 weeks rent per letting event
// Letting fee applied in year 1 and every 2 years thereafter (average tenancy turnover)
export const PROPERTY_MGMT_LETTING_YEARS: number[] = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

// Depreciation
export const DIVISION_43_RATE       = 0.025;  // 2.5% p.a. on build cost (Division 43)
export const DIVISION_43_LIFE_YEARS = 40;
export const DIVISION_40_RATE       = 0.10;   // 10% p.a. on appliance cost (Division 40)

// Borrowing cost deductibility
export const LMI_FULL_DEDUCTION_THRESHOLD   = 100;  // LMI <= $100: deduct in full in year 1
export const ESTABLISHMENT_FEE_AMORT_YEARS  = 5;    // amortise establishment fee over 5 years

// Projection horizon
export const PROJECTION_YEARS = 20;

// Schema versioning
export const SCHEMA_VERSION = 1;
