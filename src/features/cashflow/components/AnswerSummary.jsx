// =============================================================================
// AnswerSummary.jsx — answer trail pills shown below the question card
//
// Displays the last N answered questions as read-only summary pills.
// Clicking a pill navigates back to that question.
// =============================================================================

import { brokerFieldMap } from '../config/brokerFormConfig.js';

function formatValue(field, value) {
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
    case 'textarea':
      return value.length > 40 ? value.slice(0, 40) + '…' : value;
    default:
      return String(value);
  }
}

export default function AnswerSummary({ trailIds, answers }) {
  if (!trailIds || trailIds.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
      maxWidth: 480,
      margin: '12px auto 0',
    }}>
      {trailIds.map(id => {
        const field = brokerFieldMap[id];
        if (!field) return null;
        const value = answers[id];
        if (value === null || value === undefined) return null;
        return (
          <div
            key={id}
            title={field.label}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 12,
              color: 'rgba(255,255,255,0.7)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              maxWidth: 220,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
              {field.groupLabel}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>
              {formatValue(field, value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
