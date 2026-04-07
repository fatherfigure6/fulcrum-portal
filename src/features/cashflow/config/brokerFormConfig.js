// =============================================================================
// brokerFormConfig.js — broker request form field definitions
//
// Each field object is the single source of truth for:
//   id          — canonical key used in inputs_broker payload (never rename without schema bump)
//   group       — group number for progress tracking
//   groupLabel  — display label for the group header
//   type        — input type (see QuestionRenderer)
//   label       — question text shown to broker
//   hint        — optional helper text
//   required    — whether the field must be answered before advancing
//   defaultValue
//   options     — for 'select' type
//   validation  — (value, answers) => string | null
//   visibleWhen — (answers) => boolean
//   next        — (answers) => string | null   ← null means end of form
//
// ALL branching logic lives in next() functions here.
// Component code must not contain branching logic.
//
// Input types: places_autocomplete | currency | percentage | integer | year |
//              select | split | textarea | info
// =============================================================================

import { STRATA_PROPERTY_TYPES, DEFAULT_ANNUAL_BANK_FEE } from './defaults.js';

const brokerFormConfig = [

  // ── Group 1 — Property details ─────────────────────────────────────────────

  {
    id: 'property_address',
    group: 1,
    groupLabel: 'Property details',
    type: 'places_autocomplete',
    label: 'What is the property address?',
    hint: 'Start typing to search. Results are restricted to Australian addresses.',
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (v && v.formatted_address) ? null : 'Please select a property address',
    visibleWhen: () => true,
    next: () => 'purchase_price',
  },

  {
    id: 'purchase_price',
    group: 1,
    groupLabel: 'Property details',
    type: 'currency',
    label: 'What is the purchase price?',
    hint: null,
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (v !== null && v !== '' && Number(v) > 0) ? null : 'Please enter a valid purchase price',
    visibleWhen: () => true,
    next: () => 'property_type',
  },

  {
    id: 'property_type',
    group: 1,
    groupLabel: 'Property details',
    type: 'select',
    label: 'What type of property is this?',
    hint: null,
    required: true,
    defaultValue: null,
    options: [
      { value: 'house',           label: 'House' },
      { value: 'unit_duplex',     label: 'Unit / Duplex' },
      { value: 'villa_townhouse', label: 'Villa / Townhouse' },
      { value: 'apartment',       label: 'Apartment' },
    ],
    validation: (v) => v ? null : 'Please select a property type',
    visibleWhen: () => true,
    next: () => 'entity_type',
  },

  // ── Group 2 — Purchasing entity ────────────────────────────────────────────

  {
    id: 'entity_type',
    group: 2,
    groupLabel: 'Purchasing entity',
    type: 'select',
    label: 'Who is purchasing this property?',
    hint: null,
    required: true,
    defaultValue: null,
    options: [
      { value: 'individual',        label: 'Individual' },
      { value: 'joint',             label: 'Joint tenants' },
      { value: 'tenants_in_common', label: 'Tenants in common' },
      { value: 'smsf',              label: 'SMSF' },
    ],
    validation: (v) => v ? null : 'Please select who is purchasing',
    visibleWhen: () => true,
    next: (answers) => {
      if (answers.entity_type === 'joint' || answers.entity_type === 'tenants_in_common') {
        return 'ownership_split';
      }
      if (answers.entity_type === 'smsf') {
        return 'smsf_fund_name';
      }
      return 'buyer_1_name';
    },
  },

  {
    id: 'ownership_split',
    group: 2,
    groupLabel: 'Purchasing entity',
    type: 'split',
    label: 'What is the ownership split between the two purchasers?',
    hint: 'Enter the percentage for each buyer. The two values must add up to 100%.',
    required: true,
    defaultValue: { buyer_1: 50, buyer_2: 50 },
    options: null,
    validation: (v) => {
      if (!v || v.buyer_1 === undefined || v.buyer_2 === undefined) return 'Please enter the ownership split';
      const b1 = Number(v.buyer_1);
      const b2 = Number(v.buyer_2);
      if (isNaN(b1) || isNaN(b2)) return 'Please enter valid percentages';
      if (Math.round(b1 + b2) !== 100) return 'Ownership percentages must add up to 100%';
      if (b1 <= 0 || b2 <= 0) return 'Each buyer must hold more than 0%';
      return null;
    },
    visibleWhen: (answers) =>
      answers.entity_type === 'joint' || answers.entity_type === 'tenants_in_common',
    next: () => 'buyer_1_name',
  },

  // ── Group 3 — Buyer details ────────────────────────────────────────────────

  {
    id: 'buyer_1_name',
    group: 3,
    groupLabel: 'Buyer details',
    type: 'text',
    label: "What is the buyer's full name?",
    hint: null,
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (v && v.trim().length >= 2) ? null : "Please enter the buyer's full name",
    visibleWhen: (answers) => answers.entity_type !== 'smsf',
    next: () => 'buyer_1_income',
  },

  {
    id: 'buyer_1_income',
    group: 3,
    groupLabel: 'Buyer details',
    type: 'currency',
    label: 'What is their annual income before tax?',
    hint: 'Include salary, wages, and any regular investment income. Do not include rental income from this property.',
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (v !== null && v !== '' && Number(v) >= 0) ? null : 'Please enter a valid annual income',
    visibleWhen: (answers) => answers.entity_type !== 'smsf',
    next: (answers) => {
      if (answers.entity_type === 'joint' || answers.entity_type === 'tenants_in_common') {
        return 'buyer_2_name';
      }
      return 'loan_type';
    },
  },

  {
    id: 'buyer_2_name',
    group: 3,
    groupLabel: 'Buyer details',
    type: 'text',
    label: "What is Buyer 2's full name?",
    hint: null,
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (v && v.trim().length >= 2) ? null : "Please enter Buyer 2's full name",
    visibleWhen: (answers) =>
      answers.entity_type === 'joint' || answers.entity_type === 'tenants_in_common',
    next: () => 'buyer_2_income',
  },

  {
    id: 'buyer_2_income',
    group: 3,
    groupLabel: 'Buyer details',
    type: 'currency',
    label: "What is Buyer 2's annual income before tax?",
    hint: 'Include salary, wages, and any regular investment income.',
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (v !== null && v !== '' && Number(v) >= 0) ? null : 'Please enter a valid annual income',
    visibleWhen: (answers) =>
      answers.entity_type === 'joint' || answers.entity_type === 'tenants_in_common',
    next: () => 'loan_type',
  },

  // ── Group 3A — SMSF details ────────────────────────────────────────────────

  {
    id: 'smsf_fund_name',
    group: 3,
    groupLabel: 'SMSF details',
    type: 'text',
    label: 'What is the name of the SMSF?',
    hint: null,
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (v && v.trim().length >= 2) ? null : 'Please enter the fund name',
    visibleWhen: (answers) => answers.entity_type === 'smsf',
    next: () => 'smsf_contributions',
  },

  {
    id: 'smsf_contributions',
    group: 3,
    groupLabel: 'SMSF details',
    type: 'currency',
    label: 'What are the annual concessional contributions to the fund?',
    hint: 'Enter 0 if unknown. Staff can complete this later.',
    required: false,
    defaultValue: 0,
    options: null,
    validation: (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Please enter a valid contributions amount',
    visibleWhen: (answers) => answers.entity_type === 'smsf',
    next: () => 'loan_type',
  },

  // ── Group 4 — Loan details ─────────────────────────────────────────────────

  {
    id: 'loan_type',
    group: 4,
    groupLabel: 'Loan details',
    type: 'select',
    label: 'What type of loan is being arranged?',
    hint: null,
    required: true,
    defaultValue: null,
    options: [
      { value: 'pi',   label: 'Principal & Interest (P&I)' },
      { value: 'io',   label: 'Interest Only (IO)' },
      { value: 'both', label: 'Both — show side-by-side comparison' },
    ],
    validation: (v) => v ? null : 'Please select a loan type',
    visibleWhen: () => true,
    next: () => 'pi_interest_rate',  // state machine skips invisible fields
  },

  {
    id: 'pi_interest_rate',
    group: 4,
    groupLabel: 'Loan details',
    type: 'percentage',
    label: 'What is the P&I interest rate?',
    hint: 'Enter as a percentage, e.g. 5.89',
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (Number(v) > 0 && Number(v) < 30) ? null : 'Please enter a valid interest rate',
    visibleWhen: (answers) => answers.loan_type === 'pi' || answers.loan_type === 'both',
    next: () => 'pi_loan_term',
  },

  {
    id: 'pi_loan_term',
    group: 4,
    groupLabel: 'Loan details',
    type: 'integer',
    label: 'What is the P&I loan term?',
    hint: null,
    required: true,
    defaultValue: 30,
    options: null,
    validation: (v) => (Number(v) >= 1 && Number(v) <= 40) ? null : 'Loan term must be between 1 and 40 years',
    visibleWhen: (answers) => answers.loan_type === 'pi' || answers.loan_type === 'both',
    next: () => 'pi_annual_fee',
  },

  {
    id: 'pi_annual_fee',
    group: 4,
    groupLabel: 'Loan details',
    type: 'currency',
    label: 'Are there any annual bank fees on the P&I loan?',
    hint: 'Enter 0 if none. Most lenders charge $120–$395 per year.',
    required: false,
    defaultValue: DEFAULT_ANNUAL_BANK_FEE,
    options: null,
    validation: (v) => (Number(v) >= 0) ? null : 'Please enter a valid fee amount',
    visibleWhen: (answers) => answers.loan_type === 'pi' || answers.loan_type === 'both',
    next: (answers) => {
      // For PI-only, skip IO fields entirely. For IO or Both, proceed to IO fields.
      if (answers.loan_type === 'pi') return 'deposit';
      return 'io_interest_rate';
    },
  },

  {
    id: 'io_interest_rate',
    group: 4,
    groupLabel: 'Loan details',
    type: 'percentage',
    label: 'What is the IO interest rate?',
    hint: 'Enter as a percentage, e.g. 5.89',
    required: true,
    defaultValue: null,
    options: null,
    validation: (v) => (Number(v) > 0 && Number(v) < 30) ? null : 'Please enter a valid interest rate',
    visibleWhen: (answers) => answers.loan_type === 'io' || answers.loan_type === 'both',
    next: () => 'io_loan_term',
  },

  {
    id: 'io_loan_term',
    group: 4,
    groupLabel: 'Loan details',
    type: 'integer',
    label: 'What is the IO loan term?',
    hint: null,
    required: true,
    defaultValue: 30,
    options: null,
    validation: (v) => (Number(v) >= 1 && Number(v) <= 40) ? null : 'Loan term must be between 1 and 40 years',
    visibleWhen: (answers) => answers.loan_type === 'io' || answers.loan_type === 'both',
    next: () => 'io_annual_fee',
  },

  {
    id: 'io_annual_fee',
    group: 4,
    groupLabel: 'Loan details',
    type: 'currency',
    label: 'Are there any annual bank fees on the IO loan?',
    hint: 'Enter 0 if none.',
    required: false,
    defaultValue: DEFAULT_ANNUAL_BANK_FEE,
    options: null,
    validation: (v) => (Number(v) >= 0) ? null : 'Please enter a valid fee amount',
    visibleWhen: (answers) => answers.loan_type === 'io' || answers.loan_type === 'both',
    next: () => 'deposit',
  },

  // ── Group 5 — Lending costs ────────────────────────────────────────────────

  {
    id: 'deposit',
    group: 5,
    groupLabel: 'Lending costs',
    type: 'currency',
    label: 'How much deposit is the buyer contributing?',
    hint: 'Enter 0 for a no-deposit loan. This is the cash deposit, not the LVR percentage.',
    required: true,
    defaultValue: 0,
    options: null,
    validation: (v) => (Number(v) >= 0) ? null : 'Please enter a valid deposit amount',
    visibleWhen: () => true,
    next: (answers) => {
      const price   = Number(answers.purchase_price) || 0;
      const deposit = Number(answers.deposit) || 0;
      if (price > 0 && (price - deposit) / price > 0.8) {
        return 'lmi';
      }
      return 'establishment_fee';
    },
  },

  {
    id: 'lmi',
    group: 5,
    groupLabel: 'Lending costs',
    type: 'currency',
    label: 'What is the estimated Lenders Mortgage Insurance (LMI) cost?',
    hint: 'LMI applies because the deposit is less than 20% of the purchase price. Check with the lender for the exact figure.',
    required: false,
    defaultValue: null,
    options: null,
    validation: (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Please enter a valid LMI amount',
    visibleWhen: (answers) => {
      const price   = Number(answers.purchase_price) || 0;
      const deposit = Number(answers.deposit) || 0;
      return price > 0 && (price - deposit) / price > 0.8;
    },
    next: () => 'establishment_fee',
  },

  {
    id: 'establishment_fee',
    group: 5,
    groupLabel: 'Lending costs',
    type: 'currency',
    label: 'Is there a mortgage establishment fee?',
    hint: 'This is the one-off fee charged by the lender to set up the loan. Enter 0 if none.',
    required: false,
    defaultValue: 0,
    options: null,
    validation: (v) => (Number(v) >= 0) ? null : 'Please enter a valid fee amount',
    visibleWhen: () => true,
    next: (answers) =>
      STRATA_PROPERTY_TYPES.includes(answers.property_type)
        ? 'strata_fees_known'
        : 'broker_notes',
  },

  {
    id: 'strata_fees_known',
    group: 5,
    groupLabel: 'Lending costs',
    type: 'currency',
    label: 'Do you know the annual strata fees for this property?',
    hint: 'Enter the annual amount if known, or skip — staff will confirm. Enter 0 if no strata fees apply.',
    required: false,
    defaultValue: null,
    options: null,
    validation: (v) => (v === null || v === '' || Number(v) >= 0) ? null : 'Please enter a valid strata fee amount',
    visibleWhen: (answers) => STRATA_PROPERTY_TYPES.includes(answers.property_type),
    next: () => 'broker_notes',
  },

  // ── Group 6 — Notes for staff ──────────────────────────────────────────────

  {
    id: 'broker_notes',
    group: 6,
    groupLabel: 'Notes for staff',
    type: 'textarea',
    label: 'Is there anything else the team should know?',
    hint: 'Optional. Add any context, client circumstances, or special considerations.',
    required: false,
    defaultValue: null,
    options: null,
    validation: () => null,
    visibleWhen: () => true,
    next: () => null,   // end of broker form — triggers review screen
  },
];

export default brokerFormConfig;

// Field map for O(1) lookup by id
export const brokerFieldMap = Object.fromEntries(
  brokerFormConfig.map(f => [f.id, f])
);

/**
 * Given the current field id and the current answers, finds the next
 * field id that is visible. Skips invisible fields by following their
 * next() chain until a visible field is found or the form ends.
 * Returns null when the form is complete.
 */
export function findNextField(currentId, answers) {
  const current = brokerFieldMap[currentId];
  if (!current) return null;
  let nextId = current.next(answers);
  while (nextId) {
    const nextField = brokerFieldMap[nextId];
    if (!nextField) return null;
    if (nextField.visibleWhen(answers)) return nextId;
    nextId = nextField.next(answers);
  }
  return null;
}

/**
 * Returns the ordered list of visible field ids for the current answers.
 * Used to calculate progress and build the answer trail.
 */
export function getVisibleFieldIds(answers) {
  const visited = [];
  let id = 'property_address';
  while (id) {
    const field = brokerFieldMap[id];
    if (!field) break;
    if (field.visibleWhen(answers)) visited.push(id);
    id = field.next(answers);
    // Avoid infinite loops
    if (visited.length > 100) break;
  }
  return visited;
}
