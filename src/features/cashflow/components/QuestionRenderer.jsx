// =============================================================================
// QuestionRenderer.jsx — renders a single question based on its type
//
// Supported types:
//   places_autocomplete | currency | percentage | integer | year |
//   select | split | textarea | text
//
// Currency/percentage/integer/year all use the input-group pattern
// (flex container with a shared border). No absolute-positioned prefixes.
// =============================================================================

import { useState, useEffect, useRef } from 'react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ── Shared input-group styles ──────────────────────────────────────────────────
const groupStyle = {
  display: 'flex',
  alignItems: 'stretch',
  border: '1.5px solid #d8dde8',
  borderRadius: 4,
  overflow: 'hidden',
  background: '#fff',
  transition: 'border-color 0.15s',
  width: '100%',
};
const addonStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  background: '#f4f6f9',
  borderRight: '1.5px solid #d8dde8',
  fontSize: 15,
  color: '#6b7280',
  userSelect: 'none',
  flexShrink: 0,
};
const addonRightStyle = { ...addonStyle, borderRight: 'none', borderLeft: '1.5px solid #d8dde8' };
const inputStyle = {
  flex: 1,
  border: 'none',
  outline: 'none',
  padding: '12px 14px',
  fontSize: 16,
  background: 'transparent',
  width: '100%',
  minWidth: 0,
};

// ── Google Places autocomplete with full place data ───────────────────────────
function PlacesInput({ value, onChange, onKeyDown }) {
  const inputRef = useRef(null);
  const acRef    = useRef(null);
  const [loaded,   setLoaded]   = useState(false);
  const [localVal, setLocalVal] = useState(
    value?.formatted_address || (typeof value === 'string' ? value : '')
  );

  useEffect(() => {
    if (window.google?.maps?.places) { setLoaded(true); return; }
    if (window.__gmapsLoading) { window.__gmapsLoading.then(() => setLoaded(true)); return; }
    window.__gmapsLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    window.__gmapsLoading.then(() => setLoaded(true)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loaded || !inputRef.current || acRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'au' },
      fields: ['formatted_address', 'place_id', 'geometry'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.formatted_address) return;
      const placeData = {
        formatted_address: place.formatted_address,
        place_id:          place.place_id || '',
        lat:               place.geometry?.location?.lat() ?? 0,
        lng:               place.geometry?.location?.lng() ?? 0,
      };
      setLocalVal(place.formatted_address);
      onChange(placeData);
    });
    acRef.current = ac;
  }, [loaded]);

  return (
    <div>
      <input
        ref={inputRef}
        value={localVal}
        onChange={e => { setLocalVal(e.target.value); }}
        onKeyDown={onKeyDown}
        placeholder="Start typing a property address…"
        autoComplete="off"
        style={{
          width: '100%',
          border: '1.5px solid #d8dde8',
          borderRadius: 4,
          padding: '12px 14px',
          fontSize: 16,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {!GOOGLE_MAPS_API_KEY && (
        <div style={{ fontSize: 11, color: '#e65100', marginTop: 5 }}>
          ⚠ Google Maps API key not set — autocomplete inactive. Manual entry still works.
        </div>
      )}
    </div>
  );
}

// ── Ownership split (two percentage inputs side by side) ──────────────────────
function SplitInput({ value, onChange }) {
  const val = value || { buyer_1: 50, buyer_2: 50 };

  const handleChange = (key, raw) => {
    const n = Math.max(0, Math.min(100, Number(raw) || 0));
    const other = 100 - n;
    onChange({ ...val, [key]: n, [key === 'buyer_1' ? 'buyer_2' : 'buyer_1']: other });
  };

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' }}>Buyer 1</label>
        <div style={groupStyle}>
          <input
            type="number"
            min={1}
            max={99}
            value={val.buyer_1}
            onChange={e => handleChange('buyer_1', e.target.value)}
            style={inputStyle}
          />
          <span style={addonRightStyle}>%</span>
        </div>
      </div>
      <div style={{ paddingTop: 18, color: '#6b7280', fontSize: 18 }}>/</div>
      <div style={{ flex: 1 }}>
        <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' }}>Buyer 2</label>
        <div style={groupStyle}>
          <input
            type="number"
            min={1}
            max={99}
            value={val.buyer_2}
            onChange={e => handleChange('buyer_2', e.target.value)}
            style={inputStyle}
          />
          <span style={addonRightStyle}>%</span>
        </div>
      </div>
    </div>
  );
}

// ── Main renderer ─────────────────────────────────────────────────────────────
export default function QuestionRenderer({ field, value, onChange, onAutoAdvance, onKeyDown, error }) {
  if (!field) return null;

  const focusStyle = { outlineOffset: 2 };

  switch (field.type) {

    case 'places_autocomplete':
      return (
        <PlacesInput
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      );

    case 'currency':
      return (
        <div style={groupStyle}>
          <span style={addonStyle}>$</span>
          <input
            type="number"
            min={0}
            step={1}
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onKeyDown={onKeyDown}
            placeholder="0"
            style={inputStyle}
          />
        </div>
      );

    case 'percentage':
      return (
        <div style={groupStyle}>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onKeyDown={onKeyDown}
            placeholder="0.00"
            style={inputStyle}
          />
          <span style={addonRightStyle}>%</span>
        </div>
      );

    case 'integer':
      return (
        <div style={groupStyle}>
          <input
            type="number"
            min={1}
            max={40}
            step={1}
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onKeyDown={onKeyDown}
            placeholder="30"
            style={inputStyle}
          />
          <span style={addonRightStyle}>years</span>
        </div>
      );

    case 'year':
      return (
        <div style={groupStyle}>
          <input
            type="number"
            min={1985}
            max={new Date().getFullYear()}
            step={1}
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onKeyDown={onKeyDown}
            placeholder={new Date().getFullYear().toString()}
            style={inputStyle}
          />
        </div>
      );

    case 'text':
      return (
        <input
          type="text"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          style={{
            width: '100%',
            border: '1.5px solid #d8dde8',
            borderRadius: 4,
            padding: '12px 14px',
            fontSize: 16,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      );

    case 'select':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {field.options.map(opt => (
            <div
              key={opt.value}
              onClick={() => onAutoAdvance(opt.value)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onAutoAdvance(opt.value)}
              style={{
                border: `2px solid ${value === opt.value ? 'var(--teal)' : '#d8dde8'}`,
                borderRadius: 6,
                padding: '12px 16px',
                cursor: 'pointer',
                background: value === opt.value ? 'rgba(26,122,138,0.06)' : '#fff',
                fontSize: 15,
                fontWeight: value === opt.value ? 600 : 400,
                color: value === opt.value ? 'var(--teal)' : 'var(--ink)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      );

    case 'split':
      return <SplitInput value={value} onChange={onChange} />;

    case 'textarea':
      return (
        <textarea
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            border: '1.5px solid #d8dde8',
            borderRadius: 4,
            padding: '12px 14px',
            fontSize: 15,
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
          placeholder="Optional — add any context or notes for the Fulcrum team"
        />
      );

    default:
      return <div style={{ color: '#e65100' }}>Unknown field type: {field.type}</div>;
  }
}
