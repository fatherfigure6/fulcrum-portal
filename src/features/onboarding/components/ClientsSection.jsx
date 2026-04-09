// =============================================================================
// ClientsSection.jsx — staff-only Clients list view
//
// Displays all clients with search/filter controls.
// "+ New Client" creates a client + token via create-client-token Edge Function.
// The raw token is shown once in a modal with a copy button.
// Row click navigates to /clients/:id (URL-based routing).
// =============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtExpiry(token) {
  if (!token) return '—';
  if (token.used_at)    return 'Used';
  if (token.revoked_at) return 'Revoked';
  const exp = new Date(token.expires_at);
  if (exp <= new Date()) return 'Expired';
  return fmtDate(token.expires_at);
}

function getActiveToken(tokens) {
  return tokens?.find(t => !t.used_at && !t.revoked_at && new Date(t.expires_at) > new Date()) ?? null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cls =
    status === 'active'    ? 'badge badge-active'    :
    status === 'submitted' ? 'badge badge-submitted' :
    'badge badge-pending';
  return <span className={cls}>{status}</span>;
}

// ── Token display modal ───────────────────────────────────────────────────────

function TokenDisplayModal({ rawToken, clientName, onClose }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/onboard?token=${rawToken}`;

  const copyLink = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">Onboarding link generated</div>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 1.5 }}>
          Copy this link and send it to <strong>{clientName}</strong> via email or SMS.
        </p>

        <div style={{
          background: '#f5f7fa',
          border: '1px solid #e0e0de',
          borderRadius: 4,
          padding: '10px 12px',
          fontSize: 13,
          wordBreak: 'break-all',
          marginBottom: 12,
          color: '#333',
          fontFamily: 'monospace',
        }}>
          {link}
        </div>

        <button type="button" className="btn btn-primary" onClick={copyLink} style={{ width: '100%', marginBottom: 12 }}>
          {copied ? '✓ Copied!' : 'Copy link'}
        </button>

        <div style={{
          background: '#fff8e6',
          border: '1px solid #f0d070',
          borderRadius: 4,
          padding: '10px 12px',
          fontSize: 13,
          color: '#7a5200',
          marginBottom: 20,
        }}>
          ⚠ This link will not be shown again. Copy it before closing.
        </div>

        <button type="button" className="btn btn-secondary" onClick={onClose} style={{ width: '100%' }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ── New client modal ──────────────────────────────────────────────────────────

function NewClientModal({ supabase, session, onCreated, onClose }) {
  const [form, setForm]     = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.last_name.trim())  e.last_name  = 'Required';
    if (!form.email.trim())      e.email      = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Invalid email';
    if (!form.phone.trim())      e.phone      = 'Required';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    setServerError(null);

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-client-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey':         import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type':   'application/json',
        },
        body: JSON.stringify(form),
      });

      const body = await res.json();

      if (res.ok) {
        onCreated({
          clientName: `${form.first_name} ${form.last_name}`,
          rawToken:   body.raw_token,
          clientId:   body.client_id,
        });
      } else {
        setServerError(body.message ?? 'Failed to create client');
      }
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const field = (key, label, type = 'text') => (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        disabled={loading}
      />
      {errors[key] && <div style={{ fontSize: 12, color: '#e07070', marginTop: 4 }}>{errors[key]}</div>}
    </div>
  );

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="modal">
        <div className="modal-title">New Client</div>
        {field('first_name', 'First Name')}
        {field('last_name',  'Last Name')}
        {field('email',      'Email Address', 'email')}
        {field('phone',      'Phone Number',  'tel')}

        {serverError && (
          <div style={{ padding: '10px 14px', background: '#fdf2f2', border: '1px solid #fca5a5', borderRadius: 4, fontSize: 13, color: '#b91c1c', marginBottom: 12 }}>
            {serverError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading} style={{ flex: 1 }}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Creating…' : 'Create & generate link'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ClientsSection({ session, supabase }) {
  const navigate = useNavigate();

  const [clients,      setClients]      = useState([]);
  const [tokens,       setTokens]       = useState({}); // clientId → latest token
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [tokenModal,   setTokenModal]   = useState(null); // { clientName, rawToken }

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load clients
      const { data: clientRows, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientErr) throw clientErr;
      setClients(clientRows ?? []);

      // Load most recent token per client (for expiry display)
      if (clientRows?.length) {
        const ids = clientRows.map(c => c.id);
        const { data: tokenRows } = await supabase
          .from('onboarding_tokens')
          .select('id, client_id, expires_at, used_at, revoked_at')
          .in('client_id', ids)
          .order('created_at', { ascending: false });

        const tokenMap = {};
        for (const t of tokenRows ?? []) {
          if (!tokenMap[t.client_id]) tokenMap[t.client_id] = t; // first = most recent
        }
        setTokens(tokenMap);
      }
    } catch (err) {
      setError('Failed to load clients. Please refresh.');
      console.error('[ClientsSection] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadClients(); }, [loadClients]);

  // ── Filter ────────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter(c => {
      const matchSearch = !q ||
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [clients, search, statusFilter]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCreated = ({ clientName, rawToken }) => {
    setShowNewModal(false);
    setTokenModal({ clientName, rawToken });
    loadClients(); // refresh list
  };

  const handleTokenModalClose = () => {
    setTokenModal(null);
  };

  const STATUS_TABS = ['all', 'pending', 'submitted', 'active'];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--primary, #2c3e50)' }}>Clients</h2>
          <div style={{ fontSize: 13, color: '#999', marginTop: 2 }}>Post-conversion client onboarding</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNewModal(true)}>
          + New Client
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', maxWidth: 320, height: 36, padding: '0 12px', border: '1px solid var(--border, #ddd)', borderRadius: 2, fontSize: 14, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_TABS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                border: '1px solid',
                borderColor: statusFilter === s ? 'var(--primary, #2c3e50)' : '#ddd',
                background: statusFilter === s ? 'var(--primary, #2c3e50)' : '#fff',
                color: statusFilter === s ? '#fff' : '#555',
                fontSize: 13,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading…</div>
      ) : error ? (
        <div className="card" style={{ color: '#b91c1c', textAlign: 'center' }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: '#999', padding: 40 }}>
          {clients.length === 0 ? 'No clients yet. Click "+ New Client" to get started.' : 'No clients match your filters.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f5f5f3', borderBottom: '1px solid #e4e4e0' }}>
                {['Name', 'Email', 'Phone', 'Status', 'Created', 'Token Expiry'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => {
                const token = tokens[client.id];
                return (
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    style={{ borderBottom: '1px solid #f0f0ee', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9f9f8'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 500 }}>
                      {client.first_name} {client.last_name}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{client.email}</td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{client.phone}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <StatusBadge status={client.status} />
                    </td>
                    <td style={{ padding: '12px 14px', color: '#888' }}>{fmtDate(client.created_at)}</td>
                    <td style={{ padding: '12px 14px', color: '#888', fontSize: 13 }}>
                      {client.status === 'pending' ? fmtExpiry(token) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showNewModal && (
        <NewClientModal
          supabase={supabase}
          session={session}
          onCreated={handleCreated}
          onClose={() => setShowNewModal(false)}
        />
      )}
      {tokenModal && (
        <TokenDisplayModal
          rawToken={tokenModal.rawToken}
          clientName={tokenModal.clientName}
          onClose={handleTokenModalClose}
        />
      )}
    </div>
  );
}
