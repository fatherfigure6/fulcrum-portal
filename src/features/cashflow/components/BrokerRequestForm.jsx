// =============================================================================
// BrokerRequestForm.jsx — broker cashflow analysis request form orchestrator
//
// One question at a time. Progress bar + step counter at top.
// Answer trail pills below card. Review screen before submit.
// On submit: calls submit-cashflow-request Edge Function, then triggers
// notifications client-side (EmailJS + WhatsApp).
// =============================================================================

import { useCallback, useState } from 'react';
import BrandHeader from './BrandHeader.jsx';
import QuestionRenderer from './QuestionRenderer.jsx';
import AnswerSummary from './AnswerSummary.jsx';
import { useBrokerFormState } from '../hooks/useBrokerFormState.js';
import { brokerFieldMap } from '../config/brokerFormConfig.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(value, field) {
  if (value === null || value === undefined || value === '') return '—';
  switch (field.type) {
    case 'places_autocomplete':
      return value.formatted_address || value;
    case 'currency':
      return `$${Number(value).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case 'percentage':
      return `${value}%`;
    case 'integer':
      return `${value} years`;
    case 'split':
      return `${value.buyer_1}% / ${value.buyer_2}%`;
    case 'select': {
      const opt = field.options?.find(o => o.value === value);
      return opt ? opt.label : value;
    }
    default:
      return String(value);
  }
}

// ── Review screen ──────────────────────────────────────────────────────────────

function ReviewScreen({ visibleIds, answers, onBack, onSubmit, isSubmitting, submitError }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <BrandHeader />
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Review your request
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>
            Ready to submit?
          </div>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 }}>
            Review your answers below. Staff will complete the remaining fields and generate your report. You'll receive a notification when it's ready.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: '#f4f6f9', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
            {visibleIds.map(id => {
              const field = brokerFieldMap[id];
              if (!field) return null;
              const value = answers[id];
              return (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 14px', background: '#fff', gap: 12, borderBottom: '1px solid #f4f6f9' }}>
                  <span style={{ fontSize: 13, color: '#6b7280', flex: '0 0 auto', maxWidth: '55%' }}>{field.label.replace('?', '')}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-word' }}>
                    {fmt(value, field)}
                  </span>
                </div>
              );
            })}
          </div>

          {submitError && (
            <div style={{ background: '#fdf2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>
              {submitError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-secondary"
              onClick={onBack}
              disabled={isSubmitting}
              style={{ flex: '0 0 auto' }}
            >
              ← Back
            </button>
            <button
              className="btn btn-primary"
              onClick={onSubmit}
              disabled={isSubmitting}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {isSubmitting ? 'Submitting…' : 'Submit Request →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Confirmation screen ────────────────────────────────────────────────────────

function ConfirmationScreen({ onNewRequest }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <BrandHeader />
        <div style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            Request submitted
          </div>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
            Your cashflow analysis request has been received. The Fulcrum Australia team will review your submission, complete the specialist inputs, and generate your report. You'll be notified when it's ready.
          </p>
          <button className="btn btn-secondary" onClick={onNewRequest}>
            Submit another request
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────────

export default function BrokerRequestForm({ supabase, session, onNotify, onComplete }) {
  const {
    currentField,
    currentFieldId,
    answers,
    fieldError,
    isReviewScreen,
    isFirstStep,
    isSubmitting,
    isComplete,
    submittedId,
    currentStep,
    totalSteps,
    visibleIds,
    trailIds,
    setAnswer,
    advance,
    goBack,
    autoAdvance,
    submit,
  } = useBrokerFormState();

  const [submitError, setSubmitError] = useState(null);

  // Handle keyboard Enter to advance (not on textarea or select)
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && currentField?.type !== 'textarea' && currentField?.type !== 'select') {
      e.preventDefault();
      advance();
    }
  }, [advance, currentField]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    try {
      await submit(supabase, session, onNotify);
      if (onComplete) onComplete();
    } catch (err) {
      setSubmitError(err?.message || 'Submission failed. Please try again.');
    }
  }, [submit, supabase, session, onNotify, onComplete]);

  const handleNewRequest = useCallback(() => {
    window.location.reload();
  }, []);

  // Progress percentage
  const progressPct = Math.round((currentStep / totalSteps) * 100);

  if (isComplete) {
    return (
      <div style={{ padding: '24px 16px' }}>
        <ConfirmationScreen onNewRequest={handleNewRequest} />
      </div>
    );
  }

  if (isReviewScreen) {
    return (
      <div style={{ padding: '24px 16px' }}>
        <ReviewScreen
          visibleIds={visibleIds}
          answers={answers}
          onBack={goBack}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitError={null}
        />
      </div>
    );
  }

  if (!currentField) return null;

  return (
    <div style={{
      padding: '24px 16px',
      minHeight: '100%',
      background: 'var(--primary)',
    }}>
      {/* Progress bar */}
      <div style={{ maxWidth: 480, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: 'var(--teal)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          Step {currentStep} of {totalSteps}
        </div>
      </div>

      {/* Question card */}
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 6, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
          <BrandHeader />
          <div style={{ padding: '24px 24px 28px' }}>
            {/* Group label */}
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--teal)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              {currentField.groupLabel}
            </div>

            {/* Question text */}
            <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--ink)', marginBottom: currentField.hint ? 8 : 16, lineHeight: 1.4 }}>
              {currentField.label}
            </div>

            {/* Hint */}
            {currentField.hint && (
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 1.5 }}>
                {currentField.hint}
              </div>
            )}

            {/* Input */}
            <QuestionRenderer
              field={currentField}
              value={answers[currentFieldId] ?? currentField.defaultValue}
              onChange={setAnswer}
              onAutoAdvance={autoAdvance}
              onKeyDown={handleKeyDown}
              error={fieldError}
            />

            {/* Inline error */}
            {fieldError && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span>⚠</span> {fieldError}
              </div>
            )}

            {/* Skip link for optional fields */}
            {!currentField.required && currentField.type !== 'select' && (
              <div style={{ marginTop: 12 }}>
                <span
                  onClick={advance}
                  style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {currentField.type === 'textarea' ? 'Skip — nothing to add' : "I'm not sure — staff will confirm"}
                </span>
              </div>
            )}

            {/* Navigation buttons (not shown for select — auto-advances) */}
            {currentField.type !== 'select' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                {!isFirstStep && (
                  <button
                    className="btn btn-secondary"
                    onClick={goBack}
                    style={{ flex: '0 0 auto' }}
                  >
                    ← Back
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={advance}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Continue →
                </button>
              </div>
            )}

            {/* Back button for select questions */}
            {currentField.type === 'select' && !isFirstStep && (
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-secondary btn-sm" onClick={goBack}>← Back</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Answer trail */}
      <AnswerSummary trailIds={trailIds} answers={answers} />
    </div>
  );
}
