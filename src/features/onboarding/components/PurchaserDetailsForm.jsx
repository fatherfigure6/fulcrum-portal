// =============================================================================
// PurchaserDetailsForm.jsx — Step 1 of the onboarding wizard
//
// Conditional, entity-type-driven form. Entity type selector renders first;
// the appropriate field set appears only after a selection is made.
// Calls onComplete(payload) when the user clicks Continue and all fields valid.
//
// Entity types:
//   individual        — single purchaser, full contact block
//   joint_tenants     — two purchasers, identical contact blocks
//   tenants_in_common — two purchasers + ownership % each, must sum to 100.00
//   smsf              — SMSF entity name only + double stamp duty disclaimer
//
// Props:
//   initialData  — previously-submitted payload (for Back navigation pre-fill)
//   onComplete   — called with the structured payload on valid Continue click
// =============================================================================

import { useState, useEffect, useRef, useMemo } from 'react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ── Helpers ───────────────────────────────────────────────────────────────────

const emptyClient = () => ({
  firstName: '', middleName: '', lastName: '',
  address: '', email: '', phone: '', ownershipPct: '',
});

// Normalize a client object from initialData — ensures all keys exist
const normalizeClient = (c) => ({ ...emptyClient(), ...(c ?? {}) });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalisePhone(v) {
  let s = (v ?? '').replace(/\s+/g, '');
  if (s.startsWith('+61')) s = '0' + s.slice(3);
  else if (s.startsWith('61') && s.length === 11) s = '0' + s.slice(2);
  return s;
}

function isValidPhone(v) {
  return /^0[2-9]\d{8}$/.test(normalisePhone(v));
}

function validateClient(c, includeOwnershipPct = false) {
  const e = {};
  if (!c.firstName.trim())  e.firstName  = 'Required';
  if (!c.lastName.trim())   e.lastName   = 'Required';
  if (!c.address.trim())    e.address    = 'Required';
  if (!c.email.trim())      e.email      = 'Required';
  else if (!EMAIL_RE.test(c.email.trim())) e.email = 'Invalid email';
  if (!c.phone.trim())      e.phone      = 'Required';
  else if (!isValidPhone(c.phone)) e.phone = 'Invalid Australian phone number';
  if (includeOwnershipPct) {
    const n = parseFloat(c.ownershipPct);
    if (c.ownershipPct === '' || isNaN(n)) e.ownershipPct = 'Required';
    else if (n < 0 || n > 100)             e.ownershipPct = 'Must be 0–100';
  }
  return e;
}

// Defensive percentage parsing — blank/invalid treated as 0 for display only
function toPct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

// ── Common styles ─────────────────────────────────────────────────────────────

const LABEL_ST = {
  display: 'block', fontSize: 14, fontWeight: 600,
  color: '#374151', marginBottom: 6,
};
const ERR_ST = { fontSize: 12, color: '#e07070', marginTop: 4 };
const FIELD_ST = { marginBottom: 16 };

function inputSt(hasErr) {
  return {
    width: '100%',
    border: `1.5px solid ${hasErr ? '#e07070' : '#d8dde8'}`,
    borderRadius: 4,
    padding: '12px 14px',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    minHeight: 44,
    background: '#fff',
  };
}

// ── AddressInput ──────────────────────────────────────────────────────────────
// Adapts the PlacesInput pattern from QuestionRenderer.jsx.
// Returns a plain formatted_address string on onChange.

function AddressInput({ id, value, onChange, onTouch, error }) {
  const inputRef = useRef(null);
  const acRef    = useRef(null);
  const [loaded,   setLoaded]   = useState(false);
  const [localVal, setLocalVal] = useState(value ?? '');

  // Sync localVal when parent resets (e.g. entity type change clears state)
  useEffect(() => { setLocalVal(value ?? ''); }, [value]);

  // Lazy-load Google Maps — reuses window.__gmapsLoading deduplication
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

  // Attach Autocomplete once script is ready
  useEffect(() => {
    if (!loaded || !inputRef.current || acRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'au' },
      fields: ['formatted_address'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (place.formatted_address) {
        setLocalVal(place.formatted_address);
        onChange(place.formatted_address);
        onTouch();
      }
    });
    acRef.current = ac;
  }, [loaded]);

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={() => { onChange(localVal); onTouch(); }}
        autoComplete="off"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        style={inputSt(!!error)}
      />
      {!GOOGLE_MAPS_API_KEY && (
        <div style={{ fontSize: 11, color: '#e65100', marginTop: 4 }}>
          ⚠ Google Maps not configured — manual entry only
        </div>
      )}
    </>
  );
}

// ── OwnershipTotal ────────────────────────────────────────────────────────────

function OwnershipTotal({ a, b }) {
  const total = Number((toPct(a) + toPct(b)).toFixed(2));
  const ok    = total === 100;
  return (
    <div style={{
      padding: '12px 16px',
      background: ok ? '#e4ede8' : '#fdf2f2',
      border: `1px solid ${ok ? '#a8d5b5' : '#fca5a5'}`,
      borderRadius: 4,
      marginTop: 4,
      marginBottom: 28,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: ok ? '#2a5c3a' : '#b91c1c' }}>
        Ownership total: {total.toFixed(2)}%
        {!ok && ' — must equal 100.00%'}
      </span>
    </div>
  );
}

// ── ContactBlock ──────────────────────────────────────────────────────────────

function ContactBlock({ label, values, onChange, touched, fieldPrefix, onFieldTouch, showOwnershipPct }) {
  const errors      = validateClient(values, showOwnershipPct);
  const isTouched   = (field) => touched.has(`${fieldPrefix}.${field}`);
  const markTouched = (field) => onFieldTouch(`${fieldPrefix}.${field}`);
  const err         = (field) => isTouched(field) ? (errors[field] ?? '') : '';
  const mkId        = (field) => `${fieldPrefix}-${field}`;

  // renderField — plain function (not component) to avoid remount/focus loss
  const renderField = ({ name, fieldLabel, type = 'text', required = true, children = null }) => {
    const e      = err(name);
    const inputId = mkId(name);
    return (
      <div style={FIELD_ST} key={name}>
        <label htmlFor={inputId} style={LABEL_ST}>
          {fieldLabel}
          {required
            ? <span style={{ color: '#e07070', marginLeft: 4 }}>*</span>
            : <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>(optional)</span>
          }
        </label>
        {children ?? (
          <input
            id={inputId}
            type={type}
            value={values[name]}
            onChange={ev => onChange({ [name]: ev.target.value })}
            onBlur={() => markTouched(name)}
            aria-invalid={!!e}
            aria-describedby={e ? `${inputId}-err` : undefined}
            style={inputSt(!!e)}
          />
        )}
        {e && <div id={`${inputId}-err`} role="alert" style={ERR_ST}>{e}</div>}
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 28 }}>
      {label && (
        <div style={{
          fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--teal, #1a7a8a)',
          marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #e4e4e0',
        }}>
          {label}
        </div>
      )}

      {renderField({ name: 'firstName', fieldLabel: 'First name' })}
      {renderField({ name: 'middleName', fieldLabel: 'Middle name', required: false })}
      {renderField({ name: 'lastName',  fieldLabel: 'Last name' })}

      {renderField({
        name: 'address', fieldLabel: 'Residential address',
        children: (
          <AddressInput
            id={mkId('address')}
            value={values.address}
            onChange={addr => onChange({ address: addr })}
            onTouch={() => markTouched('address')}
            error={err('address')}
          />
        ),
      })}

      {renderField({ name: 'email', fieldLabel: 'Email address', type: 'email' })}
      {renderField({ name: 'phone', fieldLabel: 'Phone number', type: 'tel' })}

      {showOwnershipPct && renderField({
        name: 'ownershipPct', fieldLabel: 'Ownership %',
        children: (
          <input
            id={mkId('ownershipPct')}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={values.ownershipPct}
            onChange={ev => onChange({ ownershipPct: ev.target.value })}
            onBlur={() => markTouched('ownershipPct')}
            aria-invalid={!!err('ownershipPct')}
            aria-describedby={err('ownershipPct') ? `${mkId('ownershipPct')}-err` : undefined}
            style={{ ...inputSt(!!err('ownershipPct')), maxWidth: 160 }}
          />
        ),
      })}
    </div>
  );
}

// ── Entity type options ────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: 'individual',        label: 'Individual' },
  { value: 'joint_tenants',     label: 'Joint Tenants' },
  { value: 'tenants_in_common', label: 'Tenants in Common' },
  { value: 'smsf',              label: 'SMSF' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function PurchaserDetailsForm({ initialData, onComplete }) {
  const [entityType, setEntityType] = useState(() => initialData?.entityType ?? null);
  const [individual, setIndividual] = useState(() =>
    initialData?.entityType === 'individual' && initialData.individual
      ? normalizeClient(initialData.individual)
      : emptyClient()
  );
  const [clients, setClients] = useState(() => {
    const multi = ['joint_tenants', 'tenants_in_common'];
    if (multi.includes(initialData?.entityType) && initialData?.clients?.length === 2) {
      return initialData.clients.map(normalizeClient);
    }
    return [emptyClient(), emptyClient()];
  });
  const [smsf, setSmsf] = useState(() =>
    initialData?.entityType === 'smsf' && initialData.smsf
      ? initialData.smsf
      : { entityName: '' }
  );
  const [touched, setTouched] = useState(new Set());

  const onFieldTouch = (key) => setTouched(prev => new Set([...prev, key]));

  // True if any field in the current entity's data (including ownershipPct) is non-empty
  const hasData = () => {
    if (!entityType) return false;
    if (entityType === 'individual') {
      return Object.values(individual).some(v => String(v).trim() !== '');
    }
    if (entityType === 'joint_tenants' || entityType === 'tenants_in_common') {
      return clients.some(c => Object.values(c).some(v => String(v).trim() !== ''));
    }
    if (entityType === 'smsf') return smsf.entityName.trim() !== '';
    return false;
  };

  const handleEntityTypeChange = (newType) => {
    if (newType === entityType) return;
    if (hasData() && !window.confirm(
      'Changing entity type will clear the details entered for the current selection. Continue?'
    )) return;
    setEntityType(newType);
    setIndividual(emptyClient());
    setClients([emptyClient(), emptyClient()]);
    setSmsf({ entityName: '' });
    setTouched(new Set());
  };

  const pctTotal = useMemo(() => {
    if (entityType !== 'tenants_in_common') return null;
    return Number((toPct(clients[0].ownershipPct) + toPct(clients[1].ownershipPct)).toFixed(2));
  }, [entityType, clients]);

  const canContinue = useMemo(() => {
    if (!entityType) return false;
    if (entityType === 'individual') {
      return Object.keys(validateClient(individual)).length === 0;
    }
    if (entityType === 'joint_tenants') {
      return clients.every(c => Object.keys(validateClient(c)).length === 0);
    }
    if (entityType === 'tenants_in_common') {
      if (!clients.every(c => Object.keys(validateClient(c, true)).length === 0)) return false;
      return pctTotal === 100;
    }
    if (entityType === 'smsf') return smsf.entityName.trim() !== '';
    return false;
  }, [entityType, individual, clients, smsf, pctTotal]);

  const buildPayload = () => {
    if (entityType === 'individual') {
      return {
        version: 1, entityType,
        individual: { ...individual, phone: normalisePhone(individual.phone) },
      };
    }
    if (entityType === 'joint_tenants') {
      return {
        version: 1, entityType,
        clients: clients.map(({ ownershipPct: _omit, ...c }) => ({
          ...c, phone: normalisePhone(c.phone),
        })),
      };
    }
    if (entityType === 'tenants_in_common') {
      return {
        version: 1, entityType,
        clients: clients.map(c => ({
          ...c,
          phone:        normalisePhone(c.phone),
          ownershipPct: parseFloat(parseFloat(c.ownershipPct).toFixed(2)),
        })),
      };
    }
    if (entityType === 'smsf') {
      return { version: 1, entityType, smsf: { entityName: smsf.entityName.trim() } };
    }
    return { version: 1, entityType };
  };

  const handleContinue = () => {
    if (!canContinue) return;
    onComplete(buildPayload());
  };

  const smsfTouched = touched.has('smsf.entityName');
  const smsfErr     = smsfTouched && !smsf.entityName.trim() ? 'Required' : '';

  return (
    <div>
      {/* ── Entity type radio group ────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ ...LABEL_ST, marginBottom: 12 }}>
          Purchaser type <span style={{ color: '#e07070' }}>*</span>
        </div>
        <div role="radiogroup" aria-label="Purchaser type" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ENTITY_TYPES.map(({ value, label }) => {
            const selected = entityType === value;
            return (
              <label
                key={value}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  border: `2px solid ${selected ? 'var(--teal, #1a7a8a)' : '#d8dde8'}`,
                  borderRadius: 6, cursor: 'pointer',
                  background: selected ? 'rgba(26,122,138,0.06)' : '#fff',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <input
                  type="radio"
                  name="entityType"
                  value={value}
                  checked={selected}
                  onChange={() => handleEntityTypeChange(value)}
                  style={{ width: 18, height: 18, accentColor: 'var(--teal, #1a7a8a)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 15, fontWeight: selected ? 600 : 400, color: selected ? 'var(--teal, #1a7a8a)' : '#2c3e50' }}>
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Individual ────────────────────────────────────────────────────── */}
      {entityType === 'individual' && (
        <ContactBlock
          values={individual}
          onChange={patch => setIndividual(prev => ({ ...prev, ...patch }))}
          touched={touched}
          fieldPrefix="individual"
          onFieldTouch={onFieldTouch}
          showOwnershipPct={false}
        />
      )}

      {/* ── Joint Tenants ─────────────────────────────────────────────────── */}
      {entityType === 'joint_tenants' && (
        <>
          <ContactBlock
            label="Client 1"
            values={clients[0]}
            onChange={patch => setClients(prev => [{ ...prev[0], ...patch }, prev[1]])}
            touched={touched}
            fieldPrefix="clients.0"
            onFieldTouch={onFieldTouch}
            showOwnershipPct={false}
          />
          <ContactBlock
            label="Client 2"
            values={clients[1]}
            onChange={patch => setClients(prev => [prev[0], { ...prev[1], ...patch }])}
            touched={touched}
            fieldPrefix="clients.1"
            onFieldTouch={onFieldTouch}
            showOwnershipPct={false}
          />
        </>
      )}

      {/* ── Tenants in Common ────────────────────────────────────────────── */}
      {entityType === 'tenants_in_common' && (
        <>
          <ContactBlock
            label="Client 1"
            values={clients[0]}
            onChange={patch => setClients(prev => [{ ...prev[0], ...patch }, prev[1]])}
            touched={touched}
            fieldPrefix="clients.0"
            onFieldTouch={onFieldTouch}
            showOwnershipPct={true}
          />
          <ContactBlock
            label="Client 2"
            values={clients[1]}
            onChange={patch => setClients(prev => [prev[0], { ...prev[1], ...patch }])}
            touched={touched}
            fieldPrefix="clients.1"
            onFieldTouch={onFieldTouch}
            showOwnershipPct={true}
          />
          <OwnershipTotal a={clients[0].ownershipPct} b={clients[1].ownershipPct} />
        </>
      )}

      {/* ── SMSF ─────────────────────────────────────────────────────────── */}
      {entityType === 'smsf' && (
        <div>
          <div style={FIELD_ST}>
            <label htmlFor="smsf-entityName" style={LABEL_ST}>
              SMSF entity name <span style={{ color: '#e07070' }}>*</span>
            </label>
            <input
              id="smsf-entityName"
              type="text"
              value={smsf.entityName}
              onChange={e => setSmsf({ entityName: e.target.value })}
              onBlur={() => onFieldTouch('smsf.entityName')}
              aria-invalid={!!smsfErr}
              aria-describedby={smsfErr ? 'smsf-entityName-err' : undefined}
              style={inputSt(!!smsfErr)}
            />
            {smsfErr && (
              <div id="smsf-entityName-err" role="alert" style={ERR_ST}>{smsfErr}</div>
            )}
          </div>

          {/* Amber disclaimer — always visible, non-dismissible (§3.4.1) */}
          <div style={{
            background: '#fff8e6', border: '1px solid #f0b429',
            borderRadius: 4, padding: '12px 14px',
            fontSize: 14, color: '#7a5200', lineHeight: 1.6,
            marginTop: 4,
          }}>
            <strong>Double stamp duty risk.</strong> The entity name must exactly match the
            registered SMSF name. An incorrect name on the contract of sale may result in double
            stamp duty liability under WA law. Please verify with your trustee before proceeding.
          </div>
        </div>
      )}

      {/* ── Continue button ───────────────────────────────────────────────── */}
      {entityType && (
        <div style={{ marginTop: 32 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleContinue}
            disabled={!canContinue}
            style={{ width: '100%' }}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
