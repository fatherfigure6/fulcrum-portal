// =============================================================================
// schema.ts — inputs_broker validation for submit-cashflow-request
//
// Field IDs are canonical. Any change to an id is a breaking change and
// requires a schema_version bump on the cashflow_reports table.
// =============================================================================

export type PropertyAddress = {
  formatted_address: string
  place_id: string
  lat: number
  lng: number
}

export type InputsBroker = {
  property_address: PropertyAddress
  purchase_price: number
  property_type: 'house' | 'unit_duplex' | 'villa_townhouse' | 'apartment'
  entity_type: 'individual' | 'joint' | 'tenants_in_common' | 'smsf'
  ownership_split?: { buyer_1: number; buyer_2: number }
  buyer_1_name?: string
  buyer_1_income?: number
  buyer_2_name?: string
  buyer_2_income?: number
  smsf_fund_name?: string
  smsf_contributions?: number
  loan_type: 'pi' | 'io' | 'both'
  pi_interest_rate?: number
  pi_loan_term?: number
  pi_annual_fee?: number
  io_interest_rate?: number
  io_loan_term?: number
  io_annual_fee?: number
  deposit: number
  lmi?: number | null
  establishment_fee?: number
  strata_fees_known?: number | null
  broker_notes?: string | null
  submitted_at: string   // ISO 8601
}

const VALID_PROPERTY_TYPES = ['house', 'unit_duplex', 'villa_townhouse', 'apartment']
const VALID_ENTITY_TYPES   = ['individual', 'joint', 'tenants_in_common', 'smsf']
const VALID_LOAN_TYPES     = ['pi', 'io', 'both']
const STRATA_TYPES         = ['unit_duplex', 'villa_townhouse', 'apartment']

/**
 * Validates an inputs_broker payload.
 * Returns null if valid; returns an error message string if invalid.
 */
export function validateInputsBroker(b: unknown): string | null {
  if (!b || typeof b !== 'object') return 'inputs_broker must be an object'
  const p = b as Record<string, unknown>

  // ── property_address ────────────────────────────────────────────────────────
  if (!p.property_address || typeof p.property_address !== 'object') {
    return 'property_address is required'
  }
  const addr = p.property_address as Record<string, unknown>
  if (!addr.formatted_address || typeof addr.formatted_address !== 'string') {
    return 'property_address.formatted_address is required'
  }

  // ── purchase_price ──────────────────────────────────────────────────────────
  if (typeof p.purchase_price !== 'number' || p.purchase_price <= 0) {
    return 'purchase_price must be a positive number'
  }

  // ── property_type ───────────────────────────────────────────────────────────
  if (!VALID_PROPERTY_TYPES.includes(p.property_type as string)) {
    return `property_type must be one of: ${VALID_PROPERTY_TYPES.join(', ')}`
  }

  // ── entity_type ─────────────────────────────────────────────────────────────
  if (!VALID_ENTITY_TYPES.includes(p.entity_type as string)) {
    return `entity_type must be one of: ${VALID_ENTITY_TYPES.join(', ')}`
  }

  const entityType = p.entity_type as string
  const isJointOrTIC = entityType === 'joint' || entityType === 'tenants_in_common'
  const isSMSF       = entityType === 'smsf'

  // ── ownership_split (required for joint/TIC) ────────────────────────────────
  if (isJointOrTIC) {
    if (!p.ownership_split || typeof p.ownership_split !== 'object') {
      return 'ownership_split is required for joint / tenants_in_common'
    }
    const split = p.ownership_split as Record<string, unknown>
    const b1 = Number(split.buyer_1)
    const b2 = Number(split.buyer_2)
    if (isNaN(b1) || isNaN(b2) || Math.round(b1 + b2) !== 100) {
      return 'ownership_split buyer_1 + buyer_2 must equal 100'
    }
    if (b1 <= 0 || b2 <= 0) {
      return 'Each buyer must hold more than 0% in ownership_split'
    }
  }

  // ── buyer names and incomes (required unless SMSF) ─────────────────────────
  if (!isSMSF) {
    if (!p.buyer_1_name || typeof p.buyer_1_name !== 'string' || (p.buyer_1_name as string).trim().length < 2) {
      return 'buyer_1_name is required'
    }
    if (typeof p.buyer_1_income !== 'number' || (p.buyer_1_income as number) < 0) {
      return 'buyer_1_income must be a non-negative number'
    }
    if (isJointOrTIC) {
      if (!p.buyer_2_name || typeof p.buyer_2_name !== 'string' || (p.buyer_2_name as string).trim().length < 2) {
        return 'buyer_2_name is required for joint / tenants_in_common'
      }
      if (typeof p.buyer_2_income !== 'number' || (p.buyer_2_income as number) < 0) {
        return 'buyer_2_income must be a non-negative number'
      }
    }
  }

  // ── SMSF fields (required if SMSF) ─────────────────────────────────────────
  if (isSMSF) {
    if (!p.smsf_fund_name || typeof p.smsf_fund_name !== 'string' || (p.smsf_fund_name as string).trim().length < 2) {
      return 'smsf_fund_name is required for SMSF'
    }
  }

  // ── loan_type ───────────────────────────────────────────────────────────────
  if (!VALID_LOAN_TYPES.includes(p.loan_type as string)) {
    return `loan_type must be one of: ${VALID_LOAN_TYPES.join(', ')}`
  }

  const loanType = p.loan_type as string
  const hasPI    = loanType === 'pi'   || loanType === 'both'
  const hasIO    = loanType === 'io'   || loanType === 'both'

  // ── P&I loan fields ─────────────────────────────────────────────────────────
  if (hasPI) {
    if (typeof p.pi_interest_rate !== 'number' || (p.pi_interest_rate as number) <= 0 || (p.pi_interest_rate as number) >= 30) {
      return 'pi_interest_rate must be a number between 0 and 30'
    }
    if (typeof p.pi_loan_term !== 'number' || (p.pi_loan_term as number) < 1 || (p.pi_loan_term as number) > 40) {
      return 'pi_loan_term must be between 1 and 40 years'
    }
  }

  // ── IO loan fields ──────────────────────────────────────────────────────────
  if (hasIO) {
    if (typeof p.io_interest_rate !== 'number' || (p.io_interest_rate as number) <= 0 || (p.io_interest_rate as number) >= 30) {
      return 'io_interest_rate must be a number between 0 and 30'
    }
    if (typeof p.io_loan_term !== 'number' || (p.io_loan_term as number) < 1 || (p.io_loan_term as number) > 40) {
      return 'io_loan_term must be between 1 and 40 years'
    }
  }

  // ── deposit ─────────────────────────────────────────────────────────────────
  if (typeof p.deposit !== 'number' || (p.deposit as number) < 0) {
    return 'deposit must be a non-negative number'
  }

  // ── submitted_at ────────────────────────────────────────────────────────────
  if (!p.submitted_at || typeof p.submitted_at !== 'string') {
    return 'submitted_at is required'
  }

  return null   // valid
}
