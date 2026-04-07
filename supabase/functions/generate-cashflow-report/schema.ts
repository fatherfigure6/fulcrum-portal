// =============================================================================
// schema.ts — inputs_final validation for generate-cashflow-report
//
// The calculator reads exclusively from inputs_final.
// inputs_final contains no _override suffix fields — staff edit canonical
// field names directly (per PRD section 4.1.1 staff full-edit rule).
// =============================================================================

import type { InputsFinal } from './calculator.ts';

/**
 * Validates an inputs_final payload.
 * Returns null if valid; returns an error message string if invalid.
 */
export function validateInputsFinal(f: unknown): string | null {
  if (!f || typeof f !== 'object') return 'inputs_final must be an object';
  const p = f as Record<string, unknown>;

  // ── Core broker fields (carried into inputs_final) ─────────────────────────
  if (!p.property_address || typeof p.property_address !== 'object') {
    return 'property_address is required';
  }
  const addr = p.property_address as Record<string, unknown>;
  if (!addr.formatted_address || typeof addr.formatted_address !== 'string') {
    return 'property_address.formatted_address is required';
  }

  if (typeof p.purchase_price !== 'number' || (p.purchase_price as number) <= 0) {
    return 'purchase_price must be a positive number';
  }

  const validPropertyTypes = ['house', 'unit_duplex', 'villa_townhouse', 'apartment'];
  if (!validPropertyTypes.includes(p.property_type as string)) {
    return 'property_type must be one of: ' + validPropertyTypes.join(', ');
  }

  const validEntityTypes = ['individual', 'joint', 'tenants_in_common', 'smsf'];
  if (!validEntityTypes.includes(p.entity_type as string)) {
    return 'entity_type must be one of: ' + validEntityTypes.join(', ');
  }

  const validLoanTypes = ['pi', 'io', 'both'];
  if (!validLoanTypes.includes(p.loan_type as string)) {
    return 'loan_type must be one of: ' + validLoanTypes.join(', ');
  }

  const loanType = p.loan_type as string;
  const hasPI    = loanType === 'pi'   || loanType === 'both';
  const hasIO    = loanType === 'io'   || loanType === 'both';

  if (hasPI) {
    if (typeof p.pi_interest_rate !== 'number' || (p.pi_interest_rate as number) <= 0 || (p.pi_interest_rate as number) >= 30) {
      return 'pi_interest_rate must be between 0 and 30';
    }
    if (typeof p.pi_loan_term !== 'number' || (p.pi_loan_term as number) < 1 || (p.pi_loan_term as number) > 40) {
      return 'pi_loan_term must be between 1 and 40 years';
    }
  }

  if (hasIO) {
    if (typeof p.io_interest_rate !== 'number' || (p.io_interest_rate as number) <= 0 || (p.io_interest_rate as number) >= 30) {
      return 'io_interest_rate must be between 0 and 30';
    }
    if (typeof p.io_loan_term !== 'number' || (p.io_loan_term as number) < 1 || (p.io_loan_term as number) > 40) {
      return 'io_loan_term must be between 1 and 40 years';
    }
  }

  if (typeof p.deposit !== 'number' || (p.deposit as number) < 0) {
    return 'deposit must be a non-negative number';
  }

  // ── Staff-required fields ──────────────────────────────────────────────────
  if (typeof p.weekly_rent !== 'number' || (p.weekly_rent as number) <= 0) {
    return 'weekly_rent must be a positive number';
  }

  if (typeof p.assumptions_cap_growth !== 'number' || (p.assumptions_cap_growth as number) <= 0) {
    return 'assumptions_cap_growth must be a positive number';
  }
  if (typeof p.assumptions_rental_growth !== 'number' || (p.assumptions_rental_growth as number) < 0) {
    return 'assumptions_rental_growth must be a non-negative number';
  }
  if (typeof p.assumptions_vacancy !== 'number' || (p.assumptions_vacancy as number) < 0 || (p.assumptions_vacancy as number) > 52) {
    return 'assumptions_vacancy must be between 0 and 52 weeks';
  }

  if (typeof p.stamp_duty !== 'number' || (p.stamp_duty as number) < 0) {
    return 'stamp_duty must be a non-negative number';
  }

  if (typeof p.council_rates !== 'number' || (p.council_rates as number) < 0) {
    return 'council_rates must be a non-negative number';
  }
  if (typeof p.water_rates !== 'number' || (p.water_rates as number) < 0) {
    return 'water_rates must be a non-negative number';
  }
  if (typeof p.insurance !== 'number' || (p.insurance as number) < 0) {
    return 'insurance must be a non-negative number';
  }
  if (typeof p.maintenance !== 'number' || (p.maintenance as number) < 0) {
    return 'maintenance must be a non-negative number';
  }

  return null;  // valid
}
