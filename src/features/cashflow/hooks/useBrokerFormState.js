// =============================================================================
// useBrokerFormState.js — broker form state machine
//
// Manages: current field, answers, validation, navigation, and submit state.
// All branching logic is delegated to brokerFormConfig.js.
// =============================================================================

import { useState, useCallback } from 'react';
import brokerFormConfig, {
  brokerFieldMap,
  findNextField,
  getVisibleFieldIds,
} from '../config/brokerFormConfig.js';

const FIRST_FIELD_ID = 'property_address';

function getInitialAnswers() {
  const answers = {};
  brokerFormConfig.forEach(f => {
    if (f.defaultValue !== undefined && f.defaultValue !== null) {
      answers[f.id] = f.defaultValue;
    }
  });
  return answers;
}

export function useBrokerFormState() {
  const [currentFieldId, setCurrentFieldId] = useState(FIRST_FIELD_ID);
  const [answers,        setAnswers]         = useState(getInitialAnswers);
  const [fieldError,     setFieldError]      = useState(null);
  const [history,        setHistory]         = useState([FIRST_FIELD_ID]);
  const [isSubmitting,   setIsSubmitting]    = useState(false);
  const [isComplete,     setIsComplete]      = useState(false);
  const [submittedId,    setSubmittedId]     = useState(null);

  // ── Derived state ──────────────────────────────────────────────────────────

  const currentField = brokerFieldMap[currentFieldId];

  const visibleIds = getVisibleFieldIds(answers);
  const currentIndex = visibleIds.indexOf(currentFieldId);

  // +1 because progress shows the review screen as the final step
  const totalSteps  = visibleIds.length + 1;
  const currentStep = currentIndex + 1;

  const isReviewScreen = currentFieldId === '__review__';
  const isFirstStep    = currentIndex === 0 && !isReviewScreen;

  // Last 5 answers for the answer trail (exclude current)
  const trailIds = visibleIds.slice(Math.max(0, currentIndex - 5), currentIndex);

  // ── Setters ────────────────────────────────────────────────────────────────

  const setAnswer = useCallback((value) => {
    setAnswers(prev => ({ ...prev, [currentFieldId]: value }));
    setFieldError(null);
  }, [currentFieldId]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const advance = useCallback(() => {
    if (isReviewScreen) return;

    const field = brokerFieldMap[currentFieldId];
    if (!field) return;

    // Validate before advancing
    const currentValue = answers[currentFieldId] ?? null;
    const error = field.validation(currentValue, answers);
    if (error) {
      setFieldError(error);
      return;
    }
    setFieldError(null);

    const nextId = findNextField(currentFieldId, answers);
    if (nextId === null) {
      // End of form — show review screen
      setHistory(prev => [...prev, '__review__']);
      setCurrentFieldId('__review__');
    } else {
      setHistory(prev => [...prev, nextId]);
      setCurrentFieldId(nextId);
    }
  }, [currentFieldId, answers, isReviewScreen]);

  const goBack = useCallback(() => {
    if (history.length <= 1) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    setCurrentFieldId(newHistory[newHistory.length - 1]);
    setFieldError(null);
  }, [history]);

  // Auto-advance for select fields (called after selection, not on blur)
  const autoAdvance = useCallback((value) => {
    const updatedAnswers = { ...answers, [currentFieldId]: value };
    setAnswers(updatedAnswers);
    setFieldError(null);

    // Re-evaluate next with updated answers (entity_type / property_type changes affect branching)
    const field = brokerFieldMap[currentFieldId];
    const error = field.validation(value, updatedAnswers);
    if (error) {
      setFieldError(error);
      return;
    }

    setTimeout(() => {
      const nextId = findNextField(currentFieldId, updatedAnswers);
      if (nextId === null) {
        setHistory(prev => [...prev, '__review__']);
        setCurrentFieldId('__review__');
      } else {
        setHistory(prev => [...prev, nextId]);
        setCurrentFieldId(nextId);
      }
    }, 180);
  }, [currentFieldId, answers]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const submit = useCallback(async (supabase, session, onNotify) => {
    if (isSubmitting || isComplete) return;
    setIsSubmitting(true);

    const payload = {
      ...answers,
      submitted_at: new Date().toISOString(),
    };

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-cashflow-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ inputs_broker: payload }),
        }
      );

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || 'Submission failed');
      }

      setSubmittedId(result.id);
      setIsComplete(true);

      // Trigger notifications (client-side — follows existing portal pattern)
      if (onNotify) {
        await onNotify({
          requestId: result.id,
          brokerName: session?.name || '',
          propertyAddress: answers.property_address?.formatted_address || answers.property_address || '',
        });
      }
    } catch (err) {
      console.error('[submit-cashflow-request]', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, isSubmitting, isComplete]);

  return {
    // State
    currentField,
    currentFieldId,
    answers,
    fieldError,
    isReviewScreen,
    isFirstStep,
    isSubmitting,
    isComplete,
    submittedId,
    // Progress
    currentStep,
    totalSteps,
    visibleIds,
    trailIds,
    // Actions
    setAnswer,
    advance,
    goBack,
    autoAdvance,
    submit,
  };
}
