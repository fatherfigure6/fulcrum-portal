// =============================================================================
// OnboardingForm.jsx — public client onboarding questionnaire
//
// No authentication required. Identity is established by the token in the URL.
//
// Phases:
//   loading    — token is being validated on mount
//   error      — token invalid/used; shows branded error message
//   form       — section-by-section wizard
//   submitting — loading overlay while saving
//   success    — thank-you screen (answers NOT redisplayed per PRD)
//
// Token is read from ?token= on every Edge Function call — not stored in state.
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ONBOARDING_QUESTIONS,
  ONBOARDING_SECTIONS,
  QUESTIONS_BY_SECTION,
  QUESTIONNAIRE_VERSION,
} from '../../../config/onboarding-questions.ts';
import PurchaserDetailsForm from './PurchaserDetailsForm.jsx';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Field renderer ─────────────────────────────────────────────────────────────
// Handles the four types used by onboarding questions: text, textarea, radio.
// (select/checkbox/date/number not currently used but could be added via config)

function FieldInput({ question, value, onChange, error }) {
  const baseStyle = {
    width: '100%',
    border: `1.5px solid ${error ? '#e07070' : '#d8dde8'}`,
    borderRadius: 4,
    padding: '12px 14px',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    minHeight: 44,
    background: '#fff',
  };

  if (question.type === 'textarea') {
    return (
      <textarea
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={question.placeholder ?? ''}
        rows={4}
        style={{ ...baseStyle, resize: 'vertical' }}
      />
    );
  }

  if (question.type === 'radio') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(question.options ?? []).map(opt => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                border: `2px solid ${selected ? 'var(--teal, #1a7a8a)' : '#d8dde8'}`,
                borderRadius: 6,
                padding: '12px 16px',
                cursor: 'pointer',
                background: selected ? 'rgba(26,122,138,0.06)' : '#fff',
                fontSize: 15,
                fontWeight: selected ? 600 : 400,
                color: selected ? 'var(--teal, #1a7a8a)' : '#2c3e50',
                textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
                minHeight: 48,
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  // Default: text
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={question.placeholder ?? ''}
      style={baseStyle}
    />
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ currentIndex, total }) {
  return (
    <div className="onboarding-progress">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`onboarding-progress-segment${i <= currentIndex ? ' filled' : ''}`}
        />
      ))}
    </div>
  );
}

// ── Error screen ───────────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  INVALID_OR_EXPIRED: "This link is not valid. Please contact your Fulcrum adviser.",
  ALREADY_SUBMITTED:  "You have already completed this form. Thank you!",
  TOKEN_MISSING:      "This link is missing a required parameter. Please contact your Fulcrum adviser.",
  SERVER_ERROR:       "Something went wrong. Please try again or contact your Fulcrum adviser.",
};

function ErrorScreen({ errorCode }) {
  const message = ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.SERVER_ERROR;
  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary, #2c3e50)', marginBottom: 12 }}>
          {errorCode === 'ALREADY_SUBMITTED' ? 'Already submitted' : 'Link unavailable'}
        </div>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
          {message}
        </p>
      </div>
    </div>
  );
}

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary, #2c3e50)', marginBottom: 12 }}>
          Thank you!
        </div>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
          We've received your information. A member of the Fulcrum team will be in touch if anything further is required.
        </p>
        <div style={{
          background: '#f5f7fa',
          border: '1px solid #e4e4e0',
          borderRadius: 6,
          padding: '14px 16px',
          fontSize: 14,
          color: '#555',
          lineHeight: 1.5,
          textAlign: 'left',
        }}>
          <strong>One more thing:</strong> Please also email a copy of your pre-approval to your Fulcrum adviser.
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OnboardingForm() {
  const location = useLocation();

  const getToken = () => new URLSearchParams(location.search).get('token') ?? '';

  const [phase,            setPhase]            = useState('loading'); // loading | error | form | submitting | success
  const [errorCode,        setErrorCode]        = useState(null);
  const [firstName,        setFirstName]        = useState('');
  const [sectionIdx,       setSectionIdx]       = useState(0);
  const [responses,        setResponses]        = useState({});
  const [purchaserDetails, setPurchaserDetails] = useState(null);
  const [fieldErrors,      setFieldErrors]      = useState({});
  const [submitError,      setSubmitError]      = useState(null);

  // ── Validate token on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setErrorCode('TOKEN_MISSING');
      setPhase('error');
      return;
    }

    fetch(
      `${SUPABASE_URL}/functions/v1/validate-onboarding-token?token=${encodeURIComponent(token)}`,
      {
        headers: {
          'apikey':       import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      }
    )
      .then(res => res.json().then(body => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (ok) {
          setFirstName(body.first_name ?? '');
          setPhase('form');
        } else {
          setErrorCode(body.error ?? 'SERVER_ERROR');
          setPhase('error');
        }
      })
      .catch(() => {
        setErrorCode('SERVER_ERROR');
        setPhase('error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-section validation ───────────────────────────────────────────────────
  const validateSection = useCallback((idx) => {
    const sectionName = ONBOARDING_SECTIONS[idx];
    const sectionQuestions = QUESTIONS_BY_SECTION[sectionName] ?? [];
    const errors = {};

    for (const q of sectionQuestions) {
      if (!q.required) continue;
      const val = responses[q.id];
      const empty = val === null || val === undefined || String(val).trim() === '';
      if (empty) {
        errors[q.id] = 'This field is required.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [responses]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const handleNext = () => {
    if (!validateSection(sectionIdx)) return;
    setSectionIdx(i => i + 1);
    setFieldErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setSectionIdx(i => i - 1);
    setFieldErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Validate all sections before submitting
    const allErrors = {};
    for (let i = 0; i < ONBOARDING_SECTIONS.length; i++) {
      const sectionName = ONBOARDING_SECTIONS[i];
      for (const q of QUESTIONS_BY_SECTION[sectionName] ?? []) {
        if (!q.required) continue;
        const val = responses[q.id];
        const empty = val === null || val === undefined || String(val).trim() === '';
        if (empty) allErrors[q.id] = 'This field is required.';
      }
    }

    if (Object.keys(allErrors).length > 0) {
      setFieldErrors(allErrors);
      return;
    }

    setPhase('submitting');
    setSubmitError(null);

    const token = getToken();

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/submit-onboarding-form`,
        {
          method: 'POST',
          headers: {
            'apikey':       import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            purchaser_details: purchaserDetails,
            responses,
            questionnaire_version: QUESTIONNAIRE_VERSION,
          }),
        }
      );

      const body = await res.json();

      if (res.ok) {
        setPhase('success');
      } else if (body.error === 'ALREADY_SUBMITTED' || body.error === 'INVALID_OR_EXPIRED') {
        setErrorCode(body.error);
        setPhase('error');
      } else {
        setPhase('form');
        setSubmitError('Something went wrong. Please try again.');
      }
    } catch {
      setPhase('form');
      setSubmitError('Network error. Please check your connection and try again.');
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ color: '#999', fontSize: 15 }}>Loading…</div>
      </div>
    );
  }

  if (phase === 'error') {
    return <ErrorScreen errorCode={errorCode} />;
  }

  if (phase === 'success') {
    return <SuccessScreen />;
  }

  // ── Purchaser Details section (structured form — not generic question loop) ──
  const currentSection = ONBOARDING_SECTIONS[sectionIdx];

  if (phase === 'form' && currentSection === 'Purchaser Details') {
    return (
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 16px 48px' }}>
        <ProgressBar currentIndex={sectionIdx} total={ONBOARDING_SECTIONS.length} />
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--teal, #1a7a8a)', marginBottom: 4 }}>
            Step {sectionIdx + 1} of {ONBOARDING_SECTIONS.length}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary, #2c3e50)' }}>
            Purchaser Details
          </div>
          {firstName && (
            <div style={{ fontSize: 15, color: '#6b7280', marginTop: 6 }}>
              Welcome, {firstName}.
            </div>
          )}
        </div>
        <PurchaserDetailsForm
          initialData={purchaserDetails}
          onComplete={(payload) => {
            setPurchaserDetails(payload);
            setSectionIdx(ONBOARDING_SECTIONS.indexOf('Purchaser Details') + 1);
            setFieldErrors({});
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  const isSubmitting = phase === 'submitting';
  const sectionQuestions = QUESTIONS_BY_SECTION[currentSection] ?? [];
  const isLastSection = sectionIdx === ONBOARDING_SECTIONS.length - 1;

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 16px 48px' }}>
      {/* Progress bar */}
      <ProgressBar currentIndex={sectionIdx} total={ONBOARDING_SECTIONS.length} />

      {/* Section header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--teal, #1a7a8a)', marginBottom: 4 }}>
          Step {sectionIdx + 1} of {ONBOARDING_SECTIONS.length}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary, #2c3e50)' }}>
          {currentSection}
        </div>
        {sectionIdx === 0 && firstName && (
          <div style={{ fontSize: 15, color: '#6b7280', marginTop: 6 }}>
            Welcome, {firstName}.
          </div>
        )}
      </div>

      {/* Questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {sectionQuestions.map(q => (
          <div key={q.id} className="field">
            <label style={{ display: 'block', marginBottom: 6 }}>
              {q.label}
              {q.required && <span style={{ color: '#e07070', marginLeft: 4 }}>*</span>}
            </label>
            {q.helpText && (
              <div className="hint" style={{ marginBottom: 8 }}>{q.helpText}</div>
            )}
            <FieldInput
              question={q}
              value={responses[q.id] ?? ''}
              onChange={val => setResponses(r => ({ ...r, [q.id]: val }))}
              error={fieldErrors[q.id]}
            />
            {fieldErrors[q.id] && (
              <div style={{ fontSize: 12, color: '#e07070', marginTop: 4 }}>
                {fieldErrors[q.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submit error */}
      {submitError && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#fdf2f2', border: '1px solid #fca5a5', borderRadius: 4, fontSize: 13, color: '#b91c1c' }}>
          {submitError}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        {sectionIdx > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleBack}
            disabled={isSubmitting}
          >
            Back
          </button>
        )}
        {!isLastSection ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNext}
            disabled={isSubmitting}
            style={{ flex: 1 }}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{ flex: 1 }}
          >
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </button>
        )}
      </div>
    </div>
  );
}
