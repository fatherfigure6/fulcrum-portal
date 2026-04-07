// =============================================================================
// staffFormConfig.js — staff completion form field definitions
//
// The staff form is a scrollable multi-section form (not a step-by-step wizard).
// All sections are rendered simultaneously; fields use visibleWhen() for
// conditional display.
//
// Sections:
//   A — Rental income & assumptions
//   B — Stamp duty & transfer costs
//   C — Ongoing property costs
//   D — Depreciation
//   E — Acquisition costs
//   F — Lending (pre-filled from inputs_broker, editable)
//   G — Entity & buyers (pre-filled from inputs_broker, editable)
//
// Input types: currency | percentage | integer | year | text | select |
//              split | textarea | info
//
// 'info' type = read-only display block (no field in inputs_final)
// =============================================================================

import {
  INFLATION_RATE,
  PROPERTY_MGMT_RATE,
  PROPERTY_MGMT_LETTING_WEEKS,
  STRATA_PROPERTY_TYPES,
  DEFAULT_CAP_GROWTH,
  DEFAULT_RENTAL_GROWTH,
  DEFAULT_VACANCY_WEEKS,
  DEFAULT_CONVEYANCER,
  DEFAULT_ANNUAL_MAINTENANCE,
  DEFAULT_ANNUAL_BANK_FEE,
} from './defaults.js';

// ── Section metadata ──────────────────────────────────────────────────────────

export const STAFF_SECTIONS = [
  { id: 'P', label: 'Property details' },
  { id: 'A', label: 'Rental income & assumptions' },
  { id: 'B', label: 'Stamp duty & transfer costs' },
  { id: 'C', label: 'Ongoing property costs' },
  { id: 'D', label: 'Depreciation' },
  { id: 'E', label: 'Acquisition costs' },
  { id: 'F', label: 'Lending details' },
  { id: 'G', label: 'Entity & buyers' },
];

// ── Field definitions ─────────────────────────────────────────────────────────

const staffFormConfig = [

  // ══════════════════════════════════════════════════════════════════════════
  // Section P — Property details
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:           'property_address',
    section:      'P',
    sectionLabel: 'Property details',
    type:         'places_autocomplete',
    label:        'Property address',
    hint:         'Start typing to search. Pre-filled from broker submission if available.',
    required:     true,
    defaultValue: null,
    validation:   (v) => (v && v.formatted_address) ? null : 'Please select a property address',
    visibleWhen:  () => true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Section A — Rental income & assumptions
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:           'weekly_rent',
    section:      'A',
    sectionLabel: 'Rental income & assumptions',
    type:         'currency',
    label:        'Weekly rental income',
    hint:         'Current market rent estimate for this property.',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) > 0) ? null : 'Weekly rent must be greater than zero',
    visibleWhen:  () => true,
  },

  {
    id:           'assumptions_cap_growth',
    section:      'A',
    sectionLabel: 'Rental income & assumptions',
    type:         'percentage',
    label:        'Annual capital growth rate',
    hint:         `Default ${DEFAULT_CAP_GROWTH}%. Fulcrum's standard long-term assumption for this market.`,
    required:     true,
    defaultValue: DEFAULT_CAP_GROWTH,
    validation:   (v) => (Number(v) > 0 && Number(v) < 50) ? null : 'Capital growth rate must be between 0 and 50%',
    visibleWhen:  () => true,
  },

  {
    id:           'assumptions_rental_growth',
    section:      'A',
    sectionLabel: 'Rental income & assumptions',
    type:         'percentage',
    label:        'Annual rental growth rate',
    hint:         `Default ${DEFAULT_RENTAL_GROWTH}%.`,
    required:     true,
    defaultValue: DEFAULT_RENTAL_GROWTH,
    validation:   (v) => (Number(v) >= 0 && Number(v) < 50) ? null : 'Rental growth rate must be between 0 and 50%',
    visibleWhen:  () => true,
  },

  {
    id:           'assumptions_vacancy',
    section:      'A',
    sectionLabel: 'Rental income & assumptions',
    type:         'integer',
    label:        'Vacancy allowance (weeks per year)',
    hint:         `Default ${DEFAULT_VACANCY_WEEKS} weeks. Represents expected periods without a tenant.`,
    required:     true,
    defaultValue: DEFAULT_VACANCY_WEEKS,
    validation:   (v) => {
      const n = Number(v);
      return (n >= 0 && n <= 52) ? null : 'Vacancy must be between 0 and 52 weeks';
    },
    visibleWhen:  () => true,
  },

  {
    id:           'info_inflation_rate',
    section:      'A',
    sectionLabel: 'Rental income & assumptions',
    type:         'info',
    label:        'Annual inflation rate',
    hint:         'System constant — not editable. Applied annually to all ongoing costs in the projection.',
    value:        `${(INFLATION_RATE * 100).toFixed(1)}%`,
    required:     false,
    defaultValue: null,
    validation:   () => null,
    visibleWhen:  () => true,
  },

  {
    id:           'info_property_mgmt',
    section:      'A',
    sectionLabel: 'Rental income & assumptions',
    type:         'info',
    label:        'Property management',
    hint:         `Fulcrum house rule — not editable. ${(PROPERTY_MGMT_RATE * 100).toFixed(1)}% of gross annual rent, plus ${PROPERTY_MGMT_LETTING_WEEKS} weeks rent as letting fee in years 1, 3, 5, 7, 9, 11, 13, 15, 17, 19.`,
    value:        `${(PROPERTY_MGMT_RATE * 100).toFixed(1)}% of gross rent + letting fee`,
    required:     false,
    defaultValue: null,
    validation:   () => null,
    visibleWhen:  () => true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Section B — Stamp duty & transfer costs
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:           'stamp_duty',
    section:      'B',
    sectionLabel: 'Stamp duty & transfer costs',
    type:         'currency',
    label:        'Stamp duty + transfer fee',
    hint:         'Auto-calculated from WA OSR rates. Verify and adjust if required (e.g. first home buyer concession or foreign buyer surcharge).',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) >= 0) ? null : 'Stamp duty must be zero or greater',
    visibleWhen:  () => true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Section C — Ongoing property costs
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:           'council_rates',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'currency',
    label:        'Council rates (annual)',
    hint:         'Check the council rate notice or estimate from comparable properties.',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) >= 0) ? null : 'Council rates must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'water_rates',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'currency',
    label:        'Water rates (annual)',
    hint:         'Landlord-paid water service charges. Typically $800–$1,200 per year in WA.',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) >= 0) ? null : 'Water rates must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'insurance',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'currency',
    label:        'Landlord insurance (annual)',
    hint:         'Building and landlord contents insurance. Typically $1,200–$2,500 per year.',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) >= 0) ? null : 'Insurance must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'maintenance',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'currency',
    label:        'Annual maintenance allowance',
    hint:         `Default $${DEFAULT_ANNUAL_MAINTENANCE.toLocaleString()}. General repairs and upkeep estimate.`,
    required:     true,
    defaultValue: DEFAULT_ANNUAL_MAINTENANCE,
    validation:   (v) => (Number(v) >= 0) ? null : 'Maintenance must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'strata_fees',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'currency',
    label:        'Annual strata fees',
    hint:         'Enter the annual strata levy. The broker may have provided an estimate — confirm or update.',
    required:     false,
    defaultValue: null,
    validation:   (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Strata fees must be zero or greater',
    visibleWhen:  (v) => STRATA_PROPERTY_TYPES.includes(v.property_type),
  },

  {
    id:           'land_tax',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'currency',
    label:        'Land tax (annual)',
    hint:         'Optional. Enter 0 if land tax does not apply or is unknown.',
    required:     false,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : 'Land tax must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'ongoing_other_1_label',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'text',
    label:        'Other ongoing cost 1 — label',
    hint:         'Optional. Name this cost (e.g. "Body corporate levy").',
    required:     false,
    defaultValue: null,
    validation:   () => null,
    visibleWhen:  () => true,
  },

  {
    id:           'ongoing_other_1_amount',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'currency',
    label:        'Other ongoing cost 1 — annual amount',
    hint:         null,
    required:     false,
    defaultValue: null,
    validation:   (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Amount must be zero or greater',
    visibleWhen:  (v) => !!(v.ongoing_other_1_label && v.ongoing_other_1_label.trim()),
  },

  {
    id:           'ongoing_other_2_label',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'text',
    label:        'Other ongoing cost 2 — label',
    hint:         'Optional. Name this cost.',
    required:     false,
    defaultValue: null,
    validation:   () => null,
    visibleWhen:  () => true,
  },

  {
    id:           'ongoing_other_2_amount',
    section:      'C',
    sectionLabel: 'Ongoing property costs',
    type:         'currency',
    label:        'Other ongoing cost 2 — annual amount',
    hint:         null,
    required:     false,
    defaultValue: null,
    validation:   (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Amount must be zero or greater',
    visibleWhen:  (v) => !!(v.ongoing_other_2_label && v.ongoing_other_2_label.trim()),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Section D — Depreciation
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:           'build_cost',
    section:      'D',
    sectionLabel: 'Depreciation',
    type:         'currency',
    label:        'Estimated build cost',
    hint:         'Division 43 — structural building allowance at 2.5% p.a. for up to 40 years.',
    required:     false,
    defaultValue: null,
    validation:   (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Build cost must be zero or greater',
    visibleWhen:  (v) => v.property_type === 'house',
  },

  {
    id:           'build_year',
    section:      'D',
    sectionLabel: 'Depreciation',
    type:         'year',
    label:        'Year the building was constructed',
    hint:         'Used to calculate remaining depreciable life. Enter as a 4-digit year.',
    required:     false,
    defaultValue: null,
    validation:   (v) => {
      if (v === null || v === '') return null;
      const n = Number(v);
      return (n >= 1900 && n <= new Date().getFullYear()) ? null : 'Please enter a valid construction year';
    },
    visibleWhen:  (v) => v.property_type === 'house',
  },

  {
    id:           'appliance_cost',
    section:      'D',
    sectionLabel: 'Depreciation',
    type:         'currency',
    label:        'Estimated appliance cost',
    hint:         'Division 40 — plant and equipment at 10% p.a. (diminishing value, simplified as straight-line over 10 years).',
    required:     false,
    defaultValue: null,
    validation:   (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Appliance cost must be zero or greater',
    visibleWhen:  (v) => v.property_type === 'house',
  },

  {
    id:           'depreciation_allowance',
    section:      'D',
    sectionLabel: 'Depreciation',
    type:         'currency',
    label:        'Estimated annual depreciation allowance',
    hint:         'For units, villas, and apartments — obtain from a quantity surveyor or use an industry estimate.',
    required:     false,
    defaultValue: null,
    validation:   (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Depreciation must be zero or greater',
    visibleWhen:  (v) => STRATA_PROPERTY_TYPES.includes(v.property_type),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Section E — Acquisition costs
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:           'buyers_agent_fee',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'currency',
    label:        "Buyer's agent fee",
    hint:         'Optional. Leave blank or enter 0 if none.',
    required:     false,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : "Buyer's agent fee must be zero or greater",
    visibleWhen:  () => true,
  },

  {
    id:           'conveyancer',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'currency',
    label:        'Conveyancer / settlement agent fee',
    hint:         `Default $${DEFAULT_CONVEYANCER.toLocaleString()}.`,
    required:     false,
    defaultValue: DEFAULT_CONVEYANCER,
    validation:   (v) => (Number(v) >= 0) ? null : 'Conveyancer fee must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'building_inspection',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'currency',
    label:        'Building inspection fee',
    hint:         'Optional. Enter 0 if none.',
    required:     false,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : 'Building inspection fee must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'pest_inspection',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'currency',
    label:        'Pest inspection fee',
    hint:         'Optional. Enter 0 if none.',
    required:     false,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : 'Pest inspection fee must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'renovation_allowance',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'currency',
    label:        'Renovation / initial maintenance allowance',
    hint:         'Optional. One-off cost at acquisition. Enter 0 if none.',
    required:     false,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : 'Amount must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'other_cost_1_label',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'text',
    label:        'Other acquisition cost 1 — label',
    hint:         'Optional. Name this one-off cost.',
    required:     false,
    defaultValue: null,
    validation:   () => null,
    visibleWhen:  () => true,
  },

  {
    id:           'other_cost_1_amount',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'currency',
    label:        'Other acquisition cost 1 — amount',
    hint:         null,
    required:     false,
    defaultValue: null,
    validation:   (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Amount must be zero or greater',
    visibleWhen:  (v) => !!(v.other_cost_1_label && v.other_cost_1_label.trim()),
  },

  {
    id:           'other_cost_2_label',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'text',
    label:        'Other acquisition cost 2 — label',
    hint:         'Optional. Name this one-off cost.',
    required:     false,
    defaultValue: null,
    validation:   () => null,
    visibleWhen:  () => true,
  },

  {
    id:           'other_cost_2_amount',
    section:      'E',
    sectionLabel: 'Acquisition costs',
    type:         'currency',
    label:        'Other acquisition cost 2 — amount',
    hint:         null,
    required:     false,
    defaultValue: null,
    validation:   (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Amount must be zero or greater',
    visibleWhen:  (v) => !!(v.other_cost_2_label && v.other_cost_2_label.trim()),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Section F — Lending details (pre-filled from inputs_broker, editable)
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:           'purchase_price',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'currency',
    label:        'Purchase price',
    hint:         'Pre-filled from broker submission. Edit only if the price has changed.',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) > 0) ? null : 'Purchase price must be greater than zero',
    visibleWhen:  () => true,
  },

  {
    id:           'deposit',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'currency',
    label:        'Deposit',
    hint:         'Cash deposit amount. Enter 0 for no-deposit.',
    required:     true,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : 'Deposit must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'loan_type',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'select',
    label:        'Loan type',
    hint:         null,
    required:     true,
    defaultValue: null,
    options: [
      { value: 'pi',   label: 'Principal & Interest (P&I)' },
      { value: 'io',   label: 'Interest Only (IO)' },
      { value: 'both', label: 'Both — side-by-side comparison' },
    ],
    validation:   (v) => v ? null : 'Please select a loan type',
    visibleWhen:  () => true,
  },

  {
    id:           'pi_interest_rate',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'percentage',
    label:        'P&I interest rate',
    hint:         'Annual rate as a percentage, e.g. 5.89',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) > 0 && Number(v) < 30) ? null : 'Please enter a valid interest rate (0–30%)',
    visibleWhen:  (v) => v.loan_type === 'pi' || v.loan_type === 'both',
  },

  {
    id:           'pi_loan_term',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'integer',
    label:        'P&I loan term (years)',
    hint:         null,
    required:     true,
    defaultValue: 30,
    validation:   (v) => (Number(v) >= 1 && Number(v) <= 40) ? null : 'Loan term must be between 1 and 40 years',
    visibleWhen:  (v) => v.loan_type === 'pi' || v.loan_type === 'both',
  },

  {
    id:           'pi_annual_fee',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'currency',
    label:        'Annual bank fee — P&I loan',
    hint:         `Default $${DEFAULT_ANNUAL_BANK_FEE}. Enter 0 if none.`,
    required:     false,
    defaultValue: DEFAULT_ANNUAL_BANK_FEE,
    validation:   (v) => (Number(v) >= 0) ? null : 'Bank fee must be zero or greater',
    visibleWhen:  (v) => v.loan_type === 'pi' || v.loan_type === 'both',
  },

  {
    id:           'io_interest_rate',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'percentage',
    label:        'IO interest rate',
    hint:         'Annual rate as a percentage, e.g. 5.89',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) > 0 && Number(v) < 30) ? null : 'Please enter a valid interest rate (0–30%)',
    visibleWhen:  (v) => v.loan_type === 'io' || v.loan_type === 'both',
  },

  {
    id:           'io_loan_term',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'integer',
    label:        'IO loan term (years)',
    hint:         null,
    required:     true,
    defaultValue: 30,
    validation:   (v) => (Number(v) >= 1 && Number(v) <= 40) ? null : 'Loan term must be between 1 and 40 years',
    visibleWhen:  (v) => v.loan_type === 'io' || v.loan_type === 'both',
  },

  {
    id:           'io_annual_fee',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'currency',
    label:        'Annual bank fee — IO loan',
    hint:         'Enter 0 if none.',
    required:     false,
    defaultValue: DEFAULT_ANNUAL_BANK_FEE,
    validation:   (v) => (Number(v) >= 0) ? null : 'Bank fee must be zero or greater',
    visibleWhen:  (v) => v.loan_type === 'io' || v.loan_type === 'both',
  },

  {
    id:           'establishment_fee',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'currency',
    label:        'Mortgage establishment fee',
    hint:         'One-off fee to set up the loan. Tax-deductible, amortised over 5 years. Enter 0 if none.',
    required:     false,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : 'Establishment fee must be zero or greater',
    visibleWhen:  () => true,
  },

  {
    id:           'lmi',
    section:      'F',
    sectionLabel: 'Lending details',
    type:         'currency',
    label:        'Lenders Mortgage Insurance (LMI)',
    hint:         "Tax-deductible. Amortised over the loan term if above $100. Enter 0 if LVR ≤ 80%.",
    required:     false,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : 'LMI must be zero or greater',
    visibleWhen:  () => true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Section G — Entity & buyers (pre-filled from inputs_broker, editable)
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:           'entity_type',
    section:      'G',
    sectionLabel: 'Entity & buyers',
    type:         'select',
    label:        'Purchasing entity',
    hint:         null,
    required:     true,
    defaultValue: null,
    options: [
      { value: 'individual',        label: 'Individual' },
      { value: 'joint',             label: 'Joint tenants' },
      { value: 'tenants_in_common', label: 'Tenants in common' },
      { value: 'smsf',              label: 'SMSF' },
    ],
    validation:   (v) => v ? null : 'Please select an entity type',
    visibleWhen:  () => true,
  },

  {
    id:           'buyer_1_name',
    section:      'G',
    sectionLabel: 'Entity & buyers',
    type:         'text',
    label:        'Buyer 1 — full name',
    hint:         null,
    required:     true,
    defaultValue: null,
    validation:   (v) => (v && v.trim().length >= 2) ? null : "Please enter Buyer 1's full name",
    visibleWhen:  (v) => v.entity_type !== 'smsf',
  },

  {
    id:           'buyer_1_income',
    section:      'G',
    sectionLabel: 'Entity & buyers',
    type:         'currency',
    label:        'Buyer 1 — annual income before tax',
    hint:         'Used for tax benefit calculation only. Not shown in the client report.',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) >= 0) ? null : "Please enter Buyer 1's annual income",
    visibleWhen:  (v) => v.entity_type !== 'smsf',
  },

  {
    id:           'buyer_2_name',
    section:      'G',
    sectionLabel: 'Entity & buyers',
    type:         'text',
    label:        'Buyer 2 — full name',
    hint:         null,
    required:     true,
    defaultValue: null,
    validation:   (v) => (v && v.trim().length >= 2) ? null : "Please enter Buyer 2's full name",
    visibleWhen:  (v) => v.entity_type === 'joint' || v.entity_type === 'tenants_in_common',
  },

  {
    id:           'buyer_2_income',
    section:      'G',
    sectionLabel: 'Entity & buyers',
    type:         'currency',
    label:        'Buyer 2 — annual income before tax',
    hint:         'Used for tax benefit calculation only. Not shown in the client report.',
    required:     true,
    defaultValue: null,
    validation:   (v) => (Number(v) >= 0) ? null : "Please enter Buyer 2's annual income",
    visibleWhen:  (v) => v.entity_type === 'joint' || v.entity_type === 'tenants_in_common',
  },

  {
    id:           'ownership_split',
    section:      'G',
    sectionLabel: 'Entity & buyers',
    type:         'split',
    label:        'Ownership split',
    hint:         'Percentage owned by each buyer. Must total 100%.',
    required:     true,
    defaultValue: { buyer_1: 50, buyer_2: 50 },
    validation:   (v) => {
      if (!v || v.buyer_1 === undefined || v.buyer_2 === undefined) return 'Please enter the ownership split';
      const b1 = Number(v.buyer_1);
      const b2 = Number(v.buyer_2);
      if (isNaN(b1) || isNaN(b2)) return 'Please enter valid percentages';
      if (Math.round(b1 + b2) !== 100) return 'Ownership percentages must add up to 100%';
      if (b1 <= 0 || b2 <= 0) return 'Each buyer must hold more than 0%';
      return null;
    },
    visibleWhen:  (v) => v.entity_type === 'joint' || v.entity_type === 'tenants_in_common',
  },

  {
    id:           'smsf_fund_name',
    section:      'G',
    sectionLabel: 'Entity & buyers',
    type:         'text',
    label:        'SMSF fund name',
    hint:         null,
    required:     true,
    defaultValue: null,
    validation:   (v) => (v && v.trim().length >= 2) ? null : 'Please enter the fund name',
    visibleWhen:  (v) => v.entity_type === 'smsf',
  },

  {
    id:           'smsf_contributions',
    section:      'G',
    sectionLabel: 'Entity & buyers',
    type:         'currency',
    label:        'Annual concessional contributions to the fund',
    hint:         'Used for SMSF tax benefit calculation. Enter 0 if unknown.',
    required:     false,
    defaultValue: 0,
    validation:   (v) => (Number(v) >= 0) ? null : 'Contributions must be zero or greater',
    visibleWhen:  (v) => v.entity_type === 'smsf',
  },
];

export default staffFormConfig;

// ── Field map for O(1) lookup by id ──────────────────────────────────────────

export const staffFieldMap = Object.fromEntries(
  staffFormConfig.map(f => [f.id, f])
);

/**
 * Returns all fields visible for the current form values.
 * Info fields are excluded from validation but included for rendering.
 */
export function getVisibleStaffFields(formValues) {
  return staffFormConfig.filter(f => f.visibleWhen(formValues));
}

/**
 * Validates the entire form and returns an object of fieldId → error string.
 * Only validates required and filled optional fields.
 * Returns an empty object if the form is valid.
 */
export function validateStaffForm(formValues) {
  const errors = {};
  const visible = getVisibleStaffFields(formValues);

  for (const field of visible) {
    if (field.type === 'info') continue;
    const value = formValues[field.id];
    const isEmpty = value === null || value === '' || value === undefined;
    if (field.required && isEmpty) {
      errors[field.id] = `${field.label} is required`;
      continue;
    }
    if (!isEmpty) {
      const err = field.validation(value, formValues);
      if (err) errors[field.id] = err;
    }
  }

  return errors;
}

/**
 * Builds the inputs_final payload from staff form values and broker inputs.
 * broker inputs are carried into inputs_final under canonical field names.
 * Staff form values overwrite broker values where they overlap (Sections F and G).
 */
export function buildInputsFinal(staffValues, brokerInputs) {
  // Merge: broker values first, staff values override
  const merged = { ...brokerInputs, ...staffValues };

  // Strip info-type fields (not part of inputs_final)
  const infoIds = staffFormConfig
    .filter(f => f.type === 'info')
    .map(f => f.id);
  for (const id of infoIds) {
    delete merged[id];
  }

  // Coerce numeric fields to numbers
  const numericIds = staffFormConfig
    .filter(f => ['currency', 'percentage', 'integer', 'year'].includes(f.type))
    .map(f => f.id);
  for (const id of numericIds) {
    if (merged[id] !== null && merged[id] !== undefined && merged[id] !== '') {
      merged[id] = Number(merged[id]);
    }
  }

  return merged;
}
