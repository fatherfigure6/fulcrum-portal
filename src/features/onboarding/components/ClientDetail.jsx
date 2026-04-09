// =============================================================================
// ClientDetail.jsx — staff-only client detail view
//
// Loaded at /clients/:id. Reads clientId from useParams().
// Parallel data fetch on mount: client row, tokens, latest submission.
//
// Panels:
//   1. Profile — name, email, phone, status badge, Mark as Active
//   2. Onboarding Link — current token, copy, regenerate, token history
//   3. Questionnaire Responses — rendered from question_snapshot (not current config)
//      with Monday sync status and Retry Sync button
//   4. Future Integration — reserved for CRM (greyed placeholder)
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function tokenStatus(token) {
  if (!token) return { label: 'None', badge: 'badge badge-pending' };
  if (token.used_at)    return { label: 'Used',    badge: 'badge badge-submitted' };
  if (token.revoked_at) return { label: 'Revoked', badge: 'badge badge-pending' };
  if (new Date(token.expires_at) <= new Date()) return { label: 'Expired', badge: 'badge badge-pending' };
  return { label: 'Active', badge: 'badge badge-active' };
}

// ── Purchaser Details summary (structured_v1) ─────────────────────────────────

function ClientBlock({ label, client, showOwnershipPct }) {
  const rows = [
    ['Name',    [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ') || '—'],
    ['Address', client.address || '—'],
    ['Email',   client.email   || '—'],
    ['Phone',   client.phone   || '—'],
    ...(showOwnershipPct ? [['Ownership', client.ownershipPct != null ? `${client.ownershipPct}%` : '—']] : []),
  ];
  return (
    <div style={{ marginBottom: 10 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 16, padding: '8px 12px', background: '#f9f9f8', borderRadius: 3 }}>
            <div style={{ flex: '0 0 40%', fontSize: 13, color: '#666' }}>{k}</div>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#333', wordBreak: 'break-word' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PurchaserDetailsSummary({ data }) {
  if (!data || !data.entityType) {
    return (
      <div style={{ padding: '10px 12px', background: '#f9f9f8', borderRadius: 3, fontSize: 13, color: '#999' }}>
        Purchaser details could not be rendered from this submission.
      </div>
    );
  }

  const entityLabels = {
    individual:          'Individual',
    joint_tenants:       'Joint Tenants',
    tenants_in_common:   'Tenants in Common',
    smsf:                'SMSF',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, padding: '8px 12px', background: '#f9f9f8', borderRadius: 3, marginBottom: 8 }}>
        <div style={{ flex: '0 0 40%', fontSize: 13, color: '#666' }}>Entity Type</div>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#333' }}>{entityLabels[data.entityType] ?? data.entityType}</div>
      </div>

      {data.entityType === 'individual' && data.individual && (
        <ClientBlock client={data.individual} showOwnershipPct={false} />
      )}

      {(data.entityType === 'joint_tenants' || data.entityType === 'tenants_in_common') && Array.isArray(data.clients) && (
        data.clients.map((c, i) => (
          <ClientBlock
            key={i}
            label={`Client ${i + 1}`}
            client={c}
            showOwnershipPct={data.entityType === 'tenants_in_common'}
          />
        ))
      )}

      {data.entityType === 'smsf' && data.smsf && (
        <div style={{ display: 'flex', gap: 16, padding: '8px 12px', background: '#f9f9f8', borderRadius: 3 }}>
          <div style={{ flex: '0 0 40%', fontSize: 13, color: '#666' }}>SMSF Name</div>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#333', wordBreak: 'break-word' }}>{data.smsf.entityName || '—'}</div>
        </div>
      )}
    </div>
  );
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

function TokenDisplayModal({ rawToken, onClose }) {
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
        <div className="modal-title">New onboarding link</div>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 1.5 }}>
          Copy this link and send it to the client. The previous link is now invalid.
        </p>
        <div style={{ background: '#f5f7fa', border: '1px solid #e0e0de', borderRadius: 4, padding: '10px 12px', fontSize: 13, wordBreak: 'break-all', marginBottom: 12, color: '#333', fontFamily: 'monospace' }}>
          {link}
        </div>
        <button type="button" className="btn btn-primary" onClick={copyLink} style={{ width: '100%', marginBottom: 12 }}>
          {copied ? '✓ Copied!' : 'Copy link'}
        </button>
        <div style={{ background: '#fff8e6', border: '1px solid #f0d070', borderRadius: 4, padding: '10px 12px', fontSize: 13, color: '#7a5200', marginBottom: 20 }}>
          ⚠ This link will not be shown again. Copy it before closing.
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClose} style={{ width: '100%' }}>Done</button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ClientDetail({ session, supabase }) {
  const { id: clientId } = useParams();
  const navigate = useNavigate();

  const [client,       setClient]       = useState(null);
  const [tokens,       setTokens]       = useState([]);
  const [submission,   setSubmission]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [tokenModal,   setTokenModal]   = useState(null); // { rawToken }
  const [activating,   setActivating]   = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [retrying,     setRetrying]     = useState(false);
  const [editing,      setEditing]      = useState(false);
  const [editForm,     setEditForm]     = useState({});
  const [editSaving,   setEditSaving]   = useState(false);
  const [editError,    setEditError]    = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientRes, tokensRes, submissionRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase.from('onboarding_tokens').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('onboarding_submissions').select('*').eq('client_id', clientId).order('submitted_at', { ascending: false }).limit(1),
      ]);

      if (clientRes.error) throw clientRes.error;
      setClient(clientRes.data);
      setTokens(tokensRes.data ?? []);
      setSubmission(submissionRes.data?.[0] ?? null);
    } catch (err) {
      setError('Failed to load client data. Please try again.');
      console.error('[ClientDetail] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Active token ──────────────────────────────────────────────────────────────
  const activeToken = tokens.find(t => !t.used_at && !t.revoked_at && new Date(t.expires_at) > new Date());
  const onboardingLink = activeToken ? `${window.location.origin}/onboard?token=HIDDEN` : null;

  const copyActiveLink = async () => {
    // We can only show the link structure — we don't have the raw token
    // The raw token was shown once at creation. Staff must regenerate to get a new copyable link.
    alert('The raw token is not stored. Use "Regenerate Link" to generate a new copyable link.');
  };

  // ── Edit client details ───────────────────────────────────────────────────────
  const handleStartEdit = () => {
    setEditForm({ first_name: client.first_name, last_name: client.last_name, email: client.email, phone: client.phone });
    setEditError(null);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!editForm.first_name.trim()) return setEditError('First name is required.');
    if (!editForm.last_name.trim())  return setEditError('Last name is required.');
    if (!editForm.email.trim())      return setEditError('Email is required.');
    if (!EMAIL_RE.test(editForm.email.trim())) return setEditError('Invalid email address.');
    if (!editForm.phone.trim())      return setEditError('Phone is required.');

    setEditSaving(true);
    setEditError(null);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          first_name: editForm.first_name.trim(),
          last_name:  editForm.last_name.trim(),
          email:      editForm.email.trim().toLowerCase(),
          phone:      editForm.phone.trim(),
        })
        .eq('id', clientId);
      if (error) throw error;
      setEditing(false);
      await loadData();
    } catch (err) {
      setEditError(err.message ?? 'Failed to save. Please try again.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete client ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete ${client.first_name} ${client.last_name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) throw error;
      navigate('/clients');
    } catch (err) {
      alert(err.message ?? 'Failed to delete client.');
      setDeleting(false);
    }
  };

  // ── Mark as Active ────────────────────────────────────────────────────────────
  const handleMarkActive = async () => {
    if (!window.confirm(`Mark ${client.first_name} ${client.last_name} as Active?`)) return;
    setActivating(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          status:            'active',
          status_updated_at: new Date().toISOString(),
          status_updated_by: session.id,
        })
        .eq('id', clientId);
      if (error) throw error;
      await loadData();
    } catch (err) {
      console.error('[ClientDetail] mark active error:', err);
      alert('Failed to update status. Please try again.');
    } finally {
      setActivating(false);
    }
  };

  // ── Regenerate token ──────────────────────────────────────────────────────────
  const handleRegenerate = async () => {
    if (!window.confirm('This will revoke the current link and generate a new one. Continue?')) return;
    setRegenerating(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/regenerate-onboarding-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey':         import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type':   'application/json',
        },
        body: JSON.stringify({ client_id: clientId }),
      });

      const body = await res.json();
      if (res.ok) {
        setTokenModal({ rawToken: body.raw_token });
        await loadData();
      } else {
        alert(body.message ?? 'Failed to regenerate token');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  // ── Retry Monday sync ─────────────────────────────────────────────────────────
  const handleRetryMonday = async () => {
    if (!submission) return;
    setRetrying(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/retry-monday-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey':         import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type':   'application/json',
        },
        body: JSON.stringify({ submission_id: submission.id }),
      });

      await res.json();
      await loadData(); // refresh to show updated sync status
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading…</div>;
  }

  if (error || !client) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/clients')} style={{ marginBottom: 16 }}>← Back</button>
        <div className="card" style={{ color: '#b91c1c', textAlign: 'center' }}>{error ?? 'Client not found.'}</div>
      </div>
    );
  }

  const { label: tokenLabel, badge: tokenBadge } = tokenStatus(tokens[0]);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Back navigation */}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/clients')} style={{ marginBottom: 20 }}>
        ← Clients
      </button>

      {/* ── Panel 1: Profile ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        {editing ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary, #2c3e50)', marginBottom: 16 }}>Edit Client Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div className="field">
                <label>First Name</label>
                <input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label>Email Address</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="field">
              <label>Phone Number</label>
              <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            {editError && (
              <div style={{ padding: '8px 12px', background: '#fdf2f2', border: '1px solid #fca5a5', borderRadius: 4, fontSize: 13, color: '#b91c1c', marginBottom: 12 }}>
                {editError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={editSaving}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary, #2c3e50)', marginBottom: 4 }}>
                  {client.first_name} {client.last_name}
                </div>
                <StatusBadge status={client.status} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {client.status === 'submitted' && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleMarkActive} disabled={activating}>
                    {activating ? 'Updating…' : 'Mark as Active'}
                  </button>
                )}
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleStartEdit}>
                  Edit Details
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 24px', marginTop: 20 }}>
              {[
                ['Email',   client.email],
                ['Phone',   client.phone],
                ['Created', fmtDateShort(client.created_at)],
                ...(client.status_updated_at ? [['Status updated', fmtDateShort(client.status_updated_at)]] : []),
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999', fontWeight: 600, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, color: '#333' }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0f0ee' }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{ fontSize: 13, color: '#b91c1c', background: 'none', border: '1px solid #fca5a5', borderRadius: 4, padding: '5px 12px', cursor: 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Delete Client'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Panel 2: Onboarding Link ──────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Onboarding Link</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={tokenBadge}>{tokenLabel}</span>
            {activeToken && (
              <span style={{ fontSize: 13, color: '#888' }}>Expires {fmtDateShort(activeToken.expires_at)}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {activeToken && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={copyActiveLink}
                title="Raw token is not stored — regenerate to get a new copyable link"
              >
                ℹ Raw token not stored
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? 'Generating…' : activeToken ? 'Regenerate Link' : 'Generate Link'}
            </button>
          </div>
        </div>

        {/* Token history */}
        {tokens.length > 0 && (
          <details style={{ fontSize: 13 }}>
            <summary style={{ cursor: 'pointer', color: '#666', marginBottom: 8 }}>
              Token history ({tokens.length})
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {tokens.map(t => {
                const { label } = tokenStatus(t);
                return (
                  <div key={t.id} style={{ display: 'flex', gap: 12, fontSize: 13, color: '#666', padding: '6px 0', borderBottom: '1px solid #f0f0ee' }}>
                    <span style={{ minWidth: 70 }}>{label}</span>
                    <span>Created {fmtDateShort(t.created_at)}</span>
                    {t.expires_at && <span>Expires {fmtDateShort(t.expires_at)}</span>}
                    {t.used_at    && <span>Used {fmtDateShort(t.used_at)}</span>}
                    {t.revoked_at && <span>Revoked {fmtDateShort(t.revoked_at)}</span>}
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>

      {/* ── Panel 3: Questionnaire Responses ─────────────────────────────────── */}
      {submission ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title">Questionnaire Responses</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#888' }}>v{submission.questionnaire_version}</span>
              <span style={{ fontSize: 12, color: '#888' }}>Submitted {fmtDateShort(submission.submitted_at)}</span>
              {/* Monday sync status */}
              {submission.monday_sync_status === 'synced' && (
                <span className="badge badge-synced">Synced</span>
              )}
              {submission.monday_sync_status === 'pending' && (
                <span className="badge badge-in-review">Sync pending</span>
              )}
              {submission.monday_sync_status === 'failed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="badge badge-sync-failed">Sync failed</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleRetryMonday}
                    disabled={retrying}
                  >
                    {retrying ? 'Retrying…' : 'Retry Sync'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Render responses using question_snapshot for historical accuracy */}
          {(() => {
            const snapshot = submission.question_snapshot ?? [];
            const responses = submission.responses ?? {};
            const sections = [...new Set(snapshot.map(q => q.section))];

            return sections.map(section => (
              <div key={section} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#999', fontWeight: 700, marginBottom: 10 }}>
                  {section}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {snapshot.filter(q => q.section === section).map(q => {
                    if (q.type === 'structured_v1' && q.id === 'purchaser_details') {
                      return (
                        <div key={q.id}>
                          <PurchaserDetailsSummary data={responses.purchaser_details} />
                        </div>
                      );
                    }
                    const val = responses[q.id];
                    const display = (val === null || val === undefined || val === '') ? '—' : String(val);
                    return (
                      <div key={q.id} style={{ display: 'flex', gap: 16, padding: '10px 12px', background: '#f9f9f8', borderRadius: 3, marginBottom: 2 }}>
                        <div style={{ flex: '0 0 45%', fontSize: 13, color: '#666', lineHeight: 1.4 }}>{q.label}</div>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#333', wordBreak: 'break-word', lineHeight: 1.4 }}>{display}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, color: '#999', textAlign: 'center', padding: '24px 16px' }}>
          No questionnaire submission yet.
        </div>
      )}

      {/* ── Panel 4: Future CRM Integration ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16, opacity: 0.5 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>Reserved for future CRM integration</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Notes', 'Pipeline Stage', 'Activity Log'].map(label => (
            <div key={label} style={{ padding: '12px 16px', background: '#f5f5f3', borderRadius: 4, fontSize: 13, color: '#aaa' }}>
              {label} — coming in Phase 2
            </div>
          ))}
        </div>
      </div>

      {/* Token modal */}
      {tokenModal && (
        <TokenDisplayModal
          rawToken={tokenModal.rawToken}
          onClose={() => setTokenModal(null)}
        />
      )}
    </div>
  );
}
