-- =============================================================================
-- 006_clients_onboarding.sql
-- Client Onboarding Questionnaire — post-conversion client intake module
--
-- Three tables:
--   clients              — one row per converted client
--   onboarding_tokens    — hashed tokenised links (14-day expiry, single-use)
--   onboarding_submissions — questionnaire responses + Monday.com sync state
--
-- Access model:
--   Staff: full read/write on all three tables (RLS + WITH CHECK)
--   Brokers: zero access (no RLS policy created for broker role)
--   Public: zero direct table access (all public access via Edge Functions only)
--
-- set_updated_at() trigger function is reused from 001_requests_schema.sql.
-- =============================================================================

-- ── clients ───────────────────────────────────────────────────────────────────
-- One row per converted client. Status reflects the client relationship lifecycle,
-- not any individual token or submission state.
--
-- Status lifecycle:
--   pending   = client record created, onboarding link generated, no submission yet
--   submitted = questionnaire successfully completed by client
--   active    = manually promoted by staff once client is in active service delivery
--
-- active must NEVER be set automatically — only via deliberate staff action.
-- Token expiry must NOT automatically change client status.
-- =============================================================================
CREATE TABLE clients (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID        NOT NULL REFERENCES auth.users(id),

  first_name       TEXT        NOT NULL,
  last_name        TEXT        NOT NULL,
  email            TEXT        NOT NULL,
  phone            TEXT        NOT NULL,

  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'submitted', 'active')),

  -- Null for automated transitions (e.g. form submission → 'submitted').
  -- Set to staff user UUID only for deliberate staff actions (e.g. 'active').
  status_updated_at  TIMESTAMPTZ,
  status_updated_by  UUID REFERENCES auth.users(id)

  -- Reserved for future CRM integration — not used in Phase 1:
  -- source TEXT, broker_id UUID, crm_lead_id TEXT
);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_clients_status ON clients(status, created_at DESC);

-- ── onboarding_tokens ─────────────────────────────────────────────────────────
-- Stores only the SHA-256 hex digest of the raw token.
-- The raw token (32 bytes / 64 hex chars) is returned once to staff and never stored.
-- Token state is separate from client status — expiry does not change client.status.
--
-- Token lifecycle states (derived from columns, not a status field):
--   active  = used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
--   used    = used_at IS NOT NULL
--   expired = expires_at <= NOW() AND used_at IS NULL AND revoked_at IS NULL
--   revoked = revoked_at IS NOT NULL
-- =============================================================================
CREATE TABLE onboarding_tokens (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                UUID        NOT NULL REFERENCES auth.users(id),

  -- RESTRICT: prevents accidental client deletion once tokens exist.
  -- Audit records must be preserved.
  client_id                 UUID        NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,

  -- SHA-256 hex digest of the 32-byte raw token.
  -- CHECK enforces that only valid 64-char hex strings are stored.
  token_hash                TEXT        NOT NULL UNIQUE
                            CHECK (char_length(token_hash) = 64),

  expires_at                TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  used_at                   TIMESTAMPTZ,
  revoked_at                TIMESTAMPTZ,

  -- Audit chain: which token was revoked to create this one.
  regenerated_from_token_id UUID        REFERENCES onboarding_tokens(id)
);

-- Fast lookup of active tokens for a client
CREATE INDEX idx_onboarding_tokens_active
  ON onboarding_tokens(client_id, expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- DB-level enforcement: at most one active (unused, unrevoked) token per client.
-- Prevents duplicate active tokens even if application logic fails to revoke first.
CREATE UNIQUE INDEX uq_onboarding_tokens_one_active_per_client
  ON onboarding_tokens(client_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- ── onboarding_submissions ────────────────────────────────────────────────────
-- One row per completed questionnaire submission.
-- UNIQUE(token_id) is the DB-level backstop against duplicate submissions.
--
-- question_snapshot captures [{id, label, section, type, options?}] at submission
-- time so historical responses can be rendered correctly even after question config
-- changes in future versions.
--
-- monday_sync_status is an explicit enum — UI never infers state from null fields.
-- =============================================================================
CREATE TABLE onboarding_submissions (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- RESTRICT: historical intake records must not disappear if a client row is deleted.
  client_id                   UUID        NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  token_id                    UUID        NOT NULL REFERENCES onboarding_tokens(id) ON DELETE RESTRICT,

  questionnaire_version       TEXT        NOT NULL,

  -- Raw responses keyed by stable question ID: { questionId: value }
  responses                   JSONB       NOT NULL,

  -- [{id, label, section, type, options?}] captured at submission time.
  -- Used for rendering historical responses after question config changes.
  question_snapshot           JSONB       NOT NULL,

  -- Explicit Monday.com sync state — never inferred from null combinations.
  monday_sync_status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (monday_sync_status IN ('pending', 'synced', 'failed')),

  monday_webhook_attempted_at  TIMESTAMPTZ,
  monday_webhook_response_code INT,
  monday_webhook_error         TEXT,

  -- Populated only when a staff member manually retries the sync.
  monday_retry_attempted_by    UUID        REFERENCES auth.users(id),
  monday_retry_attempted_at    TIMESTAMPTZ,

  -- DB-level guarantee: exactly one submission per token.
  UNIQUE(token_id)
);

-- ── Row-level security ────────────────────────────────────────────────────────
-- Staff: full access (read + write) on all three tables.
-- Brokers: zero access — no broker RLS policy is created.
-- Public: zero direct access — all public paths go through Edge Functions (service role).
--
-- WITH CHECK mirrors USING so INSERT/UPDATE are equally enforced.
-- =============================================================================
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all" ON clients
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'));

CREATE POLICY "staff_all" ON onboarding_tokens
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'));

CREATE POLICY "staff_all" ON onboarding_submissions
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'));

-- ── Atomic token claim ────────────────────────────────────────────────────────
-- Prevents double-submission race condition: two concurrent form submissions with
-- the same token can both pass a SELECT check, but only one UPDATE will find a row.
-- The second call sees 0 rows updated and receives TOKEN_INVALID.
--
-- SECURITY MODEL:
--   SECURITY DEFINER — runs with definer privileges, safely bypasses RLS
--   SET search_path = public — prevents search_path hijacking attacks
--   Called exclusively from submit-onboarding-form Edge Function via adminClient.rpc()
--   Public/frontend clients must NEVER call this function directly
--   Execute granted only to service_role (see REVOKE/GRANT below)
-- =============================================================================
CREATE OR REPLACE FUNCTION claim_onboarding_token(p_token_hash TEXT)
RETURNS TABLE(token_id UUID, client_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE onboarding_tokens
  SET used_at = NOW()
  WHERE token_hash  = p_token_hash
    AND used_at     IS NULL
    AND revoked_at  IS NULL
    AND expires_at  > NOW()
  RETURNING onboarding_tokens.id, onboarding_tokens.client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOKEN_INVALID';
  END IF;
END;
$$;

-- Only service_role (used by Edge Functions) may call this function.
-- No authenticated or anonymous user should ever reach it directly.
REVOKE EXECUTE ON FUNCTION claim_onboarding_token(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_onboarding_token(TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION claim_onboarding_token(TEXT) TO service_role;
