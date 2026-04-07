// =============================================================================
// defaults.js — system constants for the cashflow analysis tool
//
// ALL constants must be sourced from this file.
// Never hardcode these values inline — any change to a constant must be
// made here and here only.
// =============================================================================

// Inflation rate — system constant, not user-configurable.
// Used for display in the assumptions bar; ongoing costs are fixed (not inflated).
export const INFLATION_RATE = 0.03;

// Property management — fixed Fulcrum house rule, not user-entered.
export const PROPERTY_MGMT_RATE = 0.077;                          // 7.7% of gross annual rent
export const PROPERTY_MGMT_LETTING_WEEKS = 2;                     // letting fee = 2 weeks rent
export const PROPERTY_MGMT_LETTING_YEARS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]; // year 1 + every 2 years

// Forecast assumption defaults (pre-filled in staff form, editable by staff)
export const DEFAULT_CAP_GROWTH    = 7.0;   // %
export const DEFAULT_RENTAL_GROWTH = 4.0;   // %
export const DEFAULT_VACANCY_WEEKS = 4;     // weeks per year → 4/52 = 7.69...%
export const DEFAULT_VACANCY_RATE  = DEFAULT_VACANCY_WEEKS / 52;

// Default purchasing cost estimates
export const DEFAULT_CONVEYANCER           = 1000;
export const DEFAULT_ANNUAL_MAINTENANCE    = 1000;
export const DEFAULT_ANNUAL_BANK_FEE       = 120;
export const DEFAULT_BUILDING_INSPECTION   = 350;  // fixed — not user-editable
export const DEFAULT_PEST_INSPECTION       = 350;  // fixed — not user-editable

// Report schema versioning
export const SCHEMA_VERSION      = 1;
export const ASSUMPTIONS_VERSION = '1.0';

// Projection horizon
export const PROJECTION_YEARS = 20;

// Strata property types
export const STRATA_PROPERTY_TYPES = ['unit_duplex', 'villa_townhouse', 'apartment'];
