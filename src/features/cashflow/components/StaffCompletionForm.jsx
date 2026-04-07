// =============================================================================
// StaffCompletionForm.jsx — staff report completion and generation form
//
// Renders all sections A–G simultaneously (scrollable).
// Pre-fills from inputs_broker; staff may edit any field.
// Generates report via the generate-cashflow-report Edge Function on submit.
// =============================================================================

import React, { useId } from 'react';
import { useStaffFormState } from '../hooks/useStaffFormState.js';
import staffFormConfig, { STAFF_SECTIONS } from '../config/staffFormConfig.js';

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = {
  page: {
    maxWidth: 820,
    margin: '0 auto',
    padding: '32px 24px 80px',
    fontFamily: 'inherit',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--primary, #1a2e5a)',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 32,
  },

  // Broker context panel
  contextPanel: {
    background: '#f0f4ff',
    border: '1px solid #c7d4f5',
    borderRadius: 8,
    padding: '16px 20px',
    marginBottom: 32,
  },
  contextTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#4b5563',
    marginBottom: 10,
  },
  contextGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '8px 24px',
  },
  contextItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  contextLabel: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  contextValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: 500,
  },
  contextNotes: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 14,
    color: '#374151',
    fontStyle: 'italic',
  },

  // Section
  section: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    marginBottom: 24,
    overflow: 'hidden',
  },
  sectionHeader: {
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  sectionBadge: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--primary, #1a2e5a)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
  },
  sectionBody: {
    padding: '0 20px',
  },

  // Field
  field: {
    padding: '18px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  fieldLast: {
    padding: '18px 0',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 4,
    display: 'block',
  },
  fieldRequired: {
    color: '#ef4444',
    marginLeft: 3,
  },
  fieldHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 1.5,
  },
  fieldError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 5,
  },

  // Info block
  infoBlock: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 14px',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 13,
  },
  infoIcon: {
    fontSize: 15,
    flexShrink: 0,
    marginTop: 1,
    color: '#6b7280',
  },
  infoValue: {
    fontWeight: 700,
    color: '#374151',
    fontSize: 14,
    marginBottom: 2,
  },
  infoHint: {
    color: '#6b7280',
    lineHeight: 1.5,
  },

  // Input group
  group: {
    display: 'flex',
    alignItems: 'stretch',
    border: '1.5px solid #d8dde8',
    borderRadius: 6,
    overflow: 'hidden',
    background: '#fff',
    maxWidth: 360,
  },
  groupError: {
    border: '1.5px solid #ef4444',
  },
  addon: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    background: '#f4f6f9',
    borderRight: '1.5px solid #d8dde8',
    fontSize: 14,
    color: '#6b7280',
    userSelect: 'none',
    flexShrink: 0,
  },
  addonRight: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    background: '#f4f6f9',
    borderLeft: '1.5px solid #d8dde8',
    fontSize: 14,
    color: '#6b7280',
    userSelect: 'none',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    padding: '10px 12px',
    fontSize: 15,
    background: 'transparent',
    width: '100%',
    minWidth: 0,
  },

  // Select
  select: {
    width: '100%',
    maxWidth: 360,
    padding: '10px 12px',
    fontSize: 15,
    border: '1.5px solid #d8dde8',
    borderRadius: 6,
    background: '#fff',
    color: '#111827',
    appearance: 'auto',
    cursor: 'pointer',
  },

  // Textarea
  textarea: {
    width: '100%',
    maxWidth: 600,
    padding: '10px 12px',
    fontSize: 14,
    border: '1.5px solid #d8dde8',
    borderRadius: 6,
    background: '#fff',
    minHeight: 80,
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },

  // Split (ownership)
  splitRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    maxWidth: 360,
  },
  splitItem: {
    flex: 1,
  },
  splitLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },

  // Stamp duty reset button
  stampRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  autoTag: {
    fontSize: 11,
    color: '#059669',
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: 4,
    padding: '2px 8px',
    fontWeight: 600,
  },
  resetBtn: {
    fontSize: 12,
    color: 'var(--primary, #1a2e5a)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },

  // Footer
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 32,
    paddingTop: 24,
    borderTop: '1px solid #e5e7eb',
  },
  submitBtn: {
    padding: '14px 32px',
    background: 'var(--primary, #1a2e5a)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    opacity: 1,
  },
  submitBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  submitError: {
    fontSize: 14,
    color: '#ef4444',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
    padding: '10px 14px',
    maxWidth: 500,
  },

  // Success screen
  success: {
    textAlign: 'center',
    padding: '60px 24px',
    maxWidth: 480,
    margin: '0 auto',
  },
  successIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#059669',
    marginBottom: 8,
  },
  successText: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 24,
    lineHeight: 1.6,
  },
  successLink: {
    display: 'inline-block',
    padding: '12px 28px',
    background: 'var(--primary, #1a2e5a)',
    color: '#fff',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
    marginRight: 12,
  },
  successSecondary: {
    display: 'inline-block',
    padding: '12px 28px',
    border: '1.5px solid #d8dde8',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    color: '#374151',
    textDecoration: 'none',
    cursor: 'pointer',
    background: 'none',
  },
};

// ── Helper: format display value for broker context ────────────────────────────

function formatContextValue(key, value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && value.formatted_address) return value.formatted_address;
  const LABELS = {
    property_type: {
      house: 'House',
      unit_duplex: 'Unit / Duplex',
      villa_townhouse: 'Villa / Townhouse',
      apartment: 'Apartment',
    },
    entity_type: {
      individual: 'Individual',
      joint: 'Joint tenants',
      tenants_in_common: 'Tenants in common',
      smsf: 'SMSF',
    },
    loan_type: {
      pi: 'P&I',
      io: 'Interest Only',
      both: 'P&I + IO (both)',
    },
  };
  if (LABELS[key]?.[value]) return LABELS[key][value];
  if (typeof value === 'number') {
    if (['purchase_price', 'deposit', 'lmi', 'establishment_fee', 'strata_fees_known'].includes(key)) {
      return '$' + Number(value).toLocaleString();
    }
    if (['pi_interest_rate', 'io_interest_rate'].includes(key)) return value + '%';
    if (['pi_loan_term', 'io_loan_term'].includes(key)) return value + ' years';
  }
  return String(value);
}

// ── StaffFieldInput — renders a single editable staff field ───────────────────

function StaffFieldInput({ field, value, error, onChange, onResetStampDuty, stampDutyIsAutoCalc }) {
  const inputId = `staff-field-${field.id}`;

  if (field.type === 'info') {
    return (
      <div style={s.infoBlock}>
        <span style={s.infoIcon}>ℹ</span>
        <div>
          <div style={s.infoValue}>{field.value}</div>
          {field.hint && <div style={s.infoHint}>{field.hint}</div>}
        </div>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <select
        id={inputId}
        style={{ ...s.select, ...(error ? { border: '1.5px solid #ef4444' } : {}) }}
        value={value || ''}
        onChange={e => onChange(field.id, e.target.value || null)}
      >
        <option value="">— Select —</option>
        {field.options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'split') {
    const split = value || { buyer_1: 50, buyer_2: 50 };
    return (
      <div style={s.splitRow}>
        <div style={s.splitItem}>
          <div style={s.splitLabel}>Buyer 1</div>
          <div style={{ ...s.group, ...(error ? s.groupError : {}) }}>
            <input
              type="number"
              min={1} max={99}
              style={s.input}
              value={split.buyer_1 ?? ''}
              onChange={e => onChange(field.id, { ...split, buyer_1: Number(e.target.value) })}
            />
            <span style={s.addonRight}>%</span>
          </div>
        </div>
        <div style={{ color: '#9ca3af', fontWeight: 700, marginTop: 20 }}>+</div>
        <div style={s.splitItem}>
          <div style={s.splitLabel}>Buyer 2</div>
          <div style={{ ...s.group, ...(error ? s.groupError : {}) }}>
            <input
              type="number"
              min={1} max={99}
              style={s.input}
              value={split.buyer_2 ?? ''}
              onChange={e => onChange(field.id, { ...split, buyer_2: Number(e.target.value) })}
            />
            <span style={s.addonRight}>%</span>
          </div>
        </div>
        <div style={{ color: '#9ca3af', marginTop: 20 }}>= 100%</div>
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        id={inputId}
        style={{ ...s.textarea, ...(error ? { border: '1.5px solid #ef4444' } : {}) }}
        value={value || ''}
        placeholder={field.hint || ''}
        onChange={e => onChange(field.id, e.target.value || null)}
        rows={4}
      />
    );
  }

  if (field.type === 'currency') {
    const input = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ ...s.group, ...(error ? s.groupError : {}) }}>
          <span style={s.addon}>$</span>
          <input
            id={inputId}
            type="number"
            min={0}
            step={field.id === 'weekly_rent' ? 5 : 1}
            style={s.input}
            value={value ?? ''}
            onChange={e => onChange(field.id, e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        {field.id === 'stamp_duty' && (
          <div style={s.stampRow}>
            {stampDutyIsAutoCalc
              ? <span style={s.autoTag}>Auto-calculated</span>
              : (
                <>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>Manually edited</span>
                  <button type="button" style={s.resetBtn} onClick={onResetStampDuty}>
                    Reset to auto-calculated
                  </button>
                </>
              )
            }
          </div>
        )}
      </div>
    );
    return input;
  }

  if (field.type === 'percentage') {
    return (
      <div style={{ ...s.group, ...(error ? s.groupError : {}) }}>
        <input
          id={inputId}
          type="number"
          min={0}
          max={100}
          step={0.01}
          style={s.input}
          value={value ?? ''}
          onChange={e => onChange(field.id, e.target.value === '' ? null : Number(e.target.value))}
        />
        <span style={s.addonRight}>%</span>
      </div>
    );
  }

  if (field.type === 'integer' || field.type === 'year') {
    return (
      <div style={{ ...s.group, ...(error ? s.groupError : {}) }}>
        <input
          id={inputId}
          type="number"
          min={field.type === 'year' ? 1900 : 0}
          step={1}
          style={s.input}
          value={value ?? ''}
          onChange={e => onChange(field.id, e.target.value === '' ? null : Number(e.target.value))}
        />
        {field.type === 'integer' && field.id.includes('term') && (
          <span style={s.addonRight}>yrs</span>
        )}
        {field.type === 'integer' && field.id.includes('vacancy') && (
          <span style={s.addonRight}>wks</span>
        )}
      </div>
    );
  }

  // text
  return (
    <input
      id={inputId}
      type="text"
      style={{
        width: '100%',
        maxWidth: 400,
        padding: '10px 12px',
        fontSize: 15,
        border: `1.5px solid ${error ? '#ef4444' : '#d8dde8'}`,
        borderRadius: 6,
        outline: 'none',
        boxSizing: 'border-box',
      }}
      value={value || ''}
      onChange={e => onChange(field.id, e.target.value || null)}
    />
  );
}

// ── Broker context panel ───────────────────────────────────────────────────────

function BrokerContextPanel({ inputsBroker }) {
  if (!inputsBroker) return null;

  const DISPLAY_KEYS = [
    { key: 'property_address', label: 'Property' },
    { key: 'property_type',    label: 'Property type' },
    { key: 'entity_type',      label: 'Purchasing entity' },
    { key: 'purchase_price',   label: 'Purchase price' },
    { key: 'loan_type',        label: 'Loan type' },
    { key: 'pi_interest_rate', label: 'P&I rate' },
    { key: 'pi_loan_term',     label: 'P&I term' },
    { key: 'io_interest_rate', label: 'IO rate' },
    { key: 'io_loan_term',     label: 'IO term' },
    { key: 'deposit',          label: 'Deposit' },
    { key: 'lmi',              label: 'LMI' },
    { key: 'establishment_fee', label: 'Establishment fee' },
    { key: 'strata_fees_known', label: 'Strata (broker)' },
  ];

  const items = DISPLAY_KEYS
    .filter(({ key }) => inputsBroker[key] !== null && inputsBroker[key] !== undefined)
    .map(({ key, label }) => ({
      label,
      value: formatContextValue(key, inputsBroker[key]),
    }));

  return (
    <div style={s.contextPanel}>
      <div style={s.contextTitle}>Broker submission</div>
      <div style={s.contextGrid}>
        {items.map(({ label, value }) => (
          <div key={label} style={s.contextItem}>
            <span style={s.contextLabel}>{label}</span>
            <span style={s.contextValue}>{value}</span>
          </div>
        ))}
      </div>
      {inputsBroker.broker_notes && (
        <div style={s.contextNotes}>
          <strong>Broker notes:</strong> {inputsBroker.broker_notes}
        </div>
      )}
    </div>
  );
}

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen({ generatedId, onViewDashboard }) {
  const publicUrl = `${window.location.origin}/report?id=${generatedId}`;

  return (
    <div style={s.success}>
      <div style={s.successIcon}>✅</div>
      <div style={s.successTitle}>Report generated</div>
      <p style={s.successText}>
        The cashflow analysis report has been generated and is now available to the client.
        The broker will be notified when you trigger the notification below.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a href={`/report?id=${generatedId}`} target="_blank" rel="noreferrer" style={s.successLink}>
          View report
        </a>
        <button type="button" style={s.successSecondary} onClick={onViewDashboard}>
          Back to dashboard
        </button>
      </div>
      <div style={{ marginTop: 20, fontSize: 13, color: '#9ca3af' }}>
        Report ID: {generatedId}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {object} props.cashflowRequest  — full cashflow_reports row (must include inputs_broker)
 * @param {object} props.supabase
 * @param {object} props.session
 * @param {function} props.onComplete     — called with generatedId after successful generation
 * @param {function} props.onCancel       — called when user navigates away
 */
export default function StaffCompletionForm({
  cashflowRequest,
  supabase,
  session,
  onComplete,
  onCancel,
}) {
  const inputsBroker = cashflowRequest?.inputs_broker ?? null;
  const requestId    = cashflowRequest?.id || null;

  const {
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
  } = useStaffFormState({ inputsBroker, requestId, supabase, session });

  function handleComplete() {
    if (onComplete) onComplete(generatedId);
  }

  if (isComplete) {
    return (
      <SuccessScreen
        generatedId={generatedId}
        onViewDashboard={handleComplete}
      />
    );
  }

  // Group visible non-info fields by section for rendering
  const visibleSet = new Set(visibleFieldIds);

  return (
    <div style={s.page}>
      <div style={s.pageTitle}>Complete cashflow analysis</div>
      <div style={s.pageSubtitle}>
        Complete the sections below, then click Generate Report.
        Broker-submitted values are shown in the context panel above — edit any field as needed.
      </div>

      <BrokerContextPanel inputsBroker={inputsBroker} />

      {STAFF_SECTIONS.map(section => {
        const sectionFields = staffFormConfig.filter(
          f => f.section === section.id && visibleSet.has(f.id)
        );

        if (sectionFields.length === 0) return null;

        return (
          <div key={section.id} style={s.section}>
            <div style={s.sectionHeader}>
              <div style={s.sectionBadge}>{section.id}</div>
              <div style={s.sectionTitle}>{section.label}</div>
            </div>
            <div style={s.sectionBody}>
              {sectionFields.map((field, idx) => {
                const isLast  = idx === sectionFields.length - 1;
                const error   = fieldErrors[field.id];

                return (
                  <div
                    key={field.id}
                    style={isLast ? s.fieldLast : s.field}
                    id={`staff-field-${field.id}`}
                  >
                    {field.type !== 'info' && (
                      <label htmlFor={`staff-field-${field.id}`} style={s.fieldLabel}>
                        {field.label}
                        {field.required && <span style={s.fieldRequired}>*</span>}
                      </label>
                    )}
                    {field.type === 'info' && (
                      <div style={{ ...s.fieldLabel, marginBottom: 8 }}>{field.label}</div>
                    )}
                    {field.hint && field.type !== 'info' && (
                      <div style={s.fieldHint}>{field.hint}</div>
                    )}

                    <StaffFieldInput
                      field={field}
                      value={values[field.id]}
                      error={error}
                      onChange={setValue}
                      onResetStampDuty={resetStampDuty}
                      stampDutyIsAutoCalc={stampDutyIsAutoCalc}
                    />

                    {error && <div style={s.fieldError}>{error}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={s.footer}>
        {submitError && (
          <div style={s.submitError}>{submitError}</div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            style={{
              ...s.submitBtn,
              ...(isSubmitting ? s.submitBtnDisabled : {}),
            }}
            onClick={submit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Generating report…' : 'Generate Report'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              style={{
                padding: '14px 24px',
                background: 'none',
                border: '1.5px solid #d8dde8',
                borderRadius: 8,
                fontSize: 15,
                cursor: 'pointer',
                color: '#374151',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
