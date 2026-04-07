// =============================================================================
// CashflowDashboard.jsx — cashflow analysis request list for brokers and staff
//
// Broker view: shows their own submitted requests with status badges and a
//   "View Report" link when complete.
// Staff view: shows all requests with broker details, sorted pending-first,
//   with summary badge counts and action buttons.
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_ORDER = { pending: 0, in_progress: 1, complete: 2, cancelled: 3 };

const STATUS_LABEL = {
  pending:     'Pending',
  in_progress: 'In Progress',
  complete:    'Complete',
  cancelled:   'Cancelled',
};

const ENTITY_LABEL = {
  individual:        'Individual',
  joint:             'Joint tenants',
  tenants_in_common: 'Tenants in common',
  smsf:              'SMSF',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function StatusBadge({ status }) {
  const colours = {
    pending:     { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
    in_progress: { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' },
    complete:    { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
    cancelled:   { background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' },
  };
  const style = colours[status] || colours.cancelled;
  return (
    <span style={{
      ...style,
      fontSize: 12,
      fontWeight: 600,
      padding: '3px 10px',
      borderRadius: 12,
      whiteSpace: 'nowrap',
      display: 'inline-block',
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

// ── Broker dashboard ──────────────────────────────────────────────────────────

function BrokerDashboard({ supabase }) {
  const navigate = useNavigate();
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('cashflow_reports')
      .select('id, property_address, entity_type, status, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError('Failed to load your cashflow requests. Please try again.');
        } else {
          setRows(data || []);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <div className="dashboard-shell">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Cashflow Analysis</div>
          <div className="page-sub">Your submitted cashflow analysis requests</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/cashflow/new')}
          style={{ flexShrink: 0 }}
        >
          + New Request
        </button>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 24px' }}>
          Loading your requests…
        </div>
      )}

      {error && (
        <div className="card" style={{ color: '#ef4444', fontSize: 14, padding: '20px 24px' }}>
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
          <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>No requests yet</div>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
            Submit your first cashflow analysis request and the Fulcrum team will prepare your report.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/cashflow/new')}>
            New Request →
          </button>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle}>Property</th>
                <th style={thStyle}>Entity</th>
                <th style={thStyle}>Submitted</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: idx < rows.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                      {row.property_address || '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>{ENTITY_LABEL[row.entity_type] || row.entity_type || '—'}</td>
                  <td style={tdStyle}>{formatDate(row.created_at)}</td>
                  <td style={tdStyle}><StatusBadge status={row.status} /></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {row.status === 'complete' && (
                      <a
                        href={`/report?id=${row.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}
                      >
                        View Report →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Staff dashboard ───────────────────────────────────────────────────────────

function StaffDashboard({ supabase }) {
  const navigate = useNavigate();
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchData() {
      // Query 1: all cashflow reports
      const { data: reports, error: reportsError } = await supabase
        .from('cashflow_reports')
        .select('id, property_address, entity_type, status, created_at, broker_id')
        .order('created_at', { ascending: false });

      if (reportsError) throw reportsError;

      // Query 2: profiles for the broker_ids that are present
      const brokerIds = [...new Set((reports || []).map(r => r.broker_id).filter(Boolean))];

      let profiles = [];
      if (brokerIds.length) {
        const { data: profileRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, company')
          .in('id', brokerIds);

        if (profilesError) throw profilesError;
        profiles = profileRows || [];
      }

      // Merge profiles into reports
      const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      const merged = (reports || []).map(r => ({ ...r, broker: profileMap[r.broker_id] || null }));

      // Client-side sort: pending → in_progress → complete/cancelled → created_at DESC
      merged.sort((a, b) => {
        const diff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        return diff !== 0 ? diff : new Date(b.created_at) - new Date(a.created_at);
      });

      return merged;
    }

    fetchData()
      .then(merged => {
        if (!cancelled) {
          setRows(merged);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load cashflow requests. Please refresh and try again.');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [supabase]);

  // Summary counts
  const pendingCount    = rows.filter(r => r.status === 'pending').length;
  const inProgressCount = rows.filter(r => r.status === 'in_progress').length;
  const completeCount   = rows.filter(r => r.status === 'complete').length;

  return (
    <div className="dashboard-shell">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Cashflow Analysis</div>
          <div className="page-sub">Broker cashflow requests — review, complete, and generate reports</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/cashflow/staff/new')}
          style={{ flexShrink: 0 }}
        >
          + New Report
        </button>
      </div>

      {/* Summary badges */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SummaryBadge label="Pending"     count={pendingCount}    colour="#fef3c7" textColour="#92400e" border="#fcd34d" />
          <SummaryBadge label="In Progress" count={inProgressCount} colour="#dbeafe" textColour="#1e40af" border="#93c5fd" />
          <SummaryBadge label="Complete"    count={completeCount}   colour="#d1fae5" textColour="#065f46" border="#6ee7b7" />
        </div>
      )}

      {loading && (
        <div className="card" style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 24px' }}>
          Loading requests…
        </div>
      )}

      {error && (
        <div className="card" style={{ color: '#ef4444', fontSize: 14, padding: '20px 24px' }}>
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>No cashflow requests yet</div>
          <p style={{ fontSize: 14, color: '#6b7280' }}>
            Broker-submitted requests will appear here. You can also create a report directly using the New Report button.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle}>Property</th>
                <th style={thStyle}>Entity</th>
                <th style={thStyle}>Broker</th>
                <th style={thStyle}>Submitted</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: idx < rows.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                      {row.property_address || '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>{ENTITY_LABEL[row.entity_type] || row.entity_type || '—'}</td>
                  <td style={tdStyle}>
                    {row.broker ? (
                      <span>
                        <span style={{ fontWeight: 500 }}>{row.broker.name || '—'}</span>
                        {row.broker.company && (
                          <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 6 }}>
                            {row.broker.company}
                          </span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={tdStyle}>{formatDate(row.created_at)}</td>
                  <td style={tdStyle}><StatusBadge status={row.status} /></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {(row.status === 'pending' || row.status === 'in_progress') && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/cashflow/${row.id}`)}
                      >
                        Complete →
                      </button>
                    )}
                    {row.status === 'complete' && (
                      <a
                        href={`/report?id=${row.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}
                      >
                        View Report →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SummaryBadge ──────────────────────────────────────────────────────────────

function SummaryBadge({ label, count, colour, textColour, border }) {
  return (
    <div style={{
      background: colour,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: textColour }}>{count}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: textColour }}>{label}</span>
    </div>
  );
}

// ── Shared table styles ───────────────────────────────────────────────────────

const thStyle = {
  padding: '11px 16px',
  fontSize: 12,
  fontWeight: 700,
  color: '#6b7280',
  textAlign: 'left',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '13px 16px',
  fontSize: 14,
  color: '#374151',
  verticalAlign: 'middle',
};

// ── Main export ───────────────────────────────────────────────────────────────

export default function CashflowDashboard({ supabase, session }) {
  if (session?.role === 'staff') {
    return <StaffDashboard supabase={supabase} />;
  }
  return <BrokerDashboard supabase={supabase} />;
}
