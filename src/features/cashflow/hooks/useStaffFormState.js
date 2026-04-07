// =============================================================================
// useStaffFormState.js — staff completion form state
//
// Manages form values for the staff completion form.
// Unlike the broker wizard, the staff form shows all sections at once
// and validates on submit.
//
// Initialization:
//   The form pre-fills from inputs_broker (broker-submitted values) and
//   applies field defaultValues for any missing staff-specific fields.
//   Staff may edit any field — all values write to inputs_final on generation.
//
// Stamp duty auto-calculation:
//   When purchase_price changes (and stamp_duty has not been manually edited),
//   stamp_duty is re-calculated from calculateWAStampDuty().
// =============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import staffFormConfig, {
  validateStaffForm,
  buildInputsFinal,
  staffFieldMap,
} from '../config/staffFormConfig.js';
import { calculateWAStampDuty } from '../config/stampDuty.js';

// ── Build initial form values from broker inputs + field defaults ───────────

function buildInitialValues(inputsBroker) {
  const values = {};
  for (const field of staffFormConfig) {
    if (field.type === 'info') continue;
    // Broker-supplied value takes precedence over field default
    const brokerValue = inputsBroker?.[field.id];
    if (brokerValue !== undefined && brokerValue !== null) {
      values[field.id] = brokerValue;
    } else if (field.defaultValue !== null && field.defaultValue !== undefined) {
      values[field.id] = field.defaultValue;
    } else {
      values[field.id] = null;
    }
  }

  // Special case: property_address — broker supplies an object; text field needs a string
  if (values['property_address'] && typeof values['property_address'] === 'object') {
    values['property_address'] = values['property_address'].formatted_address || '';
  }

  // Special case: strata_fees — pre-fill from strata_fees_known if broker supplied it
  if (inputsBroker?.strata_fees_known !== null && inputsBroker?.strata_fees_known !== undefined) {
    values['strata_fees'] = inputsBroker.strata_fees_known;
  }

  // Auto-calculate stamp duty from purchase_price if not already supplied
  if (!values['stamp_duty'] && values['purchase_price']) {
    values['stamp_duty'] = calculateWAStampDuty(Number(values['purchase_price']));
  }

  return values;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {object} props.inputsBroker   — inputs_broker from the cashflow_reports row
 * @param {string} props.requestId      — UUID of the cashflow_reports row (null for staff-initiated)
 * @param {object} props.supabase       — Supabase client (used to call Edge Function)
 * @param {object} props.session        — auth session
 */
export function useStaffFormState({ inputsBroker, requestId, supabase, session }) {
  const [values, setValues]         = useState(() => buildInitialValues(inputsBroker));
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState(null);
  const [isComplete, setIsComplete]     = useState(false);
  const [generatedId, setGeneratedId]   = useState(null);

  // Track whether stamp_duty has been manually edited by staff
  const stampDutyManualRef = useRef(false);

  // ── Field change handler ─────────────────────────────────────────────────

  const setValue = useCallback((fieldId, value) => {
    setValues(prev => {
      const next = { ...prev, [fieldId]: value };

      // Auto-recalculate stamp duty when purchase_price changes
      // (only if staff has not manually overridden stamp_duty)
      if (fieldId === 'purchase_price' && !stampDutyManualRef.current) {
        next['stamp_duty'] = calculateWAStampDuty(Number(value) || 0);
      }

      // If staff edits stamp_duty directly, mark it as manual
      if (fieldId === 'stamp_duty') {
        stampDutyManualRef.current = true;
      }

      return next;
    });

    // Clear field error on change
    setFieldErrors(prev => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  // ── Form reset ──────────────────────────────────────────────────────────

  const resetStampDuty = useCallback(() => {
    stampDutyManualRef.current = false;
    const recalculated = calculateWAStampDuty(Number(values['purchase_price']) || 0);
    setValue('stamp_duty', recalculated);
    stampDutyManualRef.current = false;   // setValue('stamp_duty') sets it true; reset again
  }, [values, setValue]);

  // ── Validate and submit ──────────────────────────────────────────────────

  const submit = useCallback(async () => {
    // Validate all visible fields
    const errors = validateStaffForm(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Scroll to first error field
      const firstErrorId = Object.keys(errors)[0];
      const el = document.getElementById(`staff-field-${firstErrorId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Build inputs_final by merging staff values over broker inputs
      const inputsFinal = buildInputsFinal(values, inputsBroker);

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const token = currentSession?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');

      const body = {
        inputs_final: inputsFinal,
      };
      if (requestId) {
        body.request_id = requestId;
      }
      // entity_type and property_address are carried through inputs_final
      // but also sent top-level for the Edge Function's convenience
      body.entity_type      = inputsFinal.entity_type;
      body.property_address = inputsFinal.property_address?.formatted_address || '';

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cashflow-report`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(body),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        const msg = json?.message || json?.error || 'Report generation failed';
        throw new Error(msg);
      }

      setGeneratedId(json.id);
      setIsComplete(true);
    } catch (err) {
      setSubmitError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }, [values, inputsBroker, requestId, supabase, session]);

  // ── Derived: which fields are visible ───────────────────────────────────

  const visibleFieldIds = staffFormConfig
    .filter(f => f.visibleWhen(values))
    .map(f => f.id);

  // ── Computed stamp duty display value ────────────────────────────────────

  const stampDutyIsAutoCalc = !stampDutyManualRef.current;

  return {
    values,
    setValue,
    fieldErrors,
    visibleFieldIds,
    isSubmitting,
    submitError,
    isComplete,
    generatedId,
    stampDutyIsAutoCalc,
    resetStampDuty,
    submit,
  };
}
