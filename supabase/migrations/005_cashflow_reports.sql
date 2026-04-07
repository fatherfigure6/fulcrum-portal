-- =============================================================================
-- 005_cashflow_reports.sql
-- cashflow_reports table for the Cashflow Analysis Tool (v1)
--
-- Two-stage workflow:
--   Stage 1 — broker submits request (inputs_broker written, status = 'pending')
--   Stage 2 — staff completes and generates (inputs_final + report_data written,
--              status = 'complete', is_public = true)
--
-- All writes go through Edge Functions using service role — no direct client
-- INSERT is permitted. Brokers SELECT their own rows; staff SELECT all rows.
-- The public report endpoint uses service role and checks four conditions before
-- returning data — no anon SELECT RLS policy is needed or created.
-- =============================================================================

CREATE TABLE cashflow_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Set server-side from auth.uid() in submit-cashflow-request Edge Function.
  -- References profiles(id) to match existing portal conventions.
  -- NOT NULL: every record must have a submitting broker.
  -- NO ON DELETE clause (default NO ACTION): a broker with active reports
  -- cannot be deleted without first resolving the reports.
  broker_id        UUID        NOT NULL REFERENCES profiles(id),

  -- Populated when staff generate the report.
  staff_id         UUID        REFERENCES profiles(id) ON DELETE SET NULL,

  property_address TEXT        NOT NULL,

  entity_type      TEXT        NOT NULL
                               CHECK (entity_type IN (
                                 'individual',
                                 'joint',
                                 'tenants_in_common',
                                 'smsf'
                               )),

  -- Written at submission. Never overwritten — immutable audit record.
  inputs_broker    JSONB       NOT NULL,

  -- Written at generation. Authoritative payload used by calculator.
  -- The calculator reads exclusively from inputs_final; never from inputs_broker.
  inputs_final     JSONB,

  -- Null until status = 'complete'.
  report_data      JSONB,

  schema_version   INTEGER     NOT NULL DEFAULT 1,

  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN (
                                 'pending',
                                 'in_progress',
                                 'complete',
                                 'cancelled'
                               )),

  -- Defaults false. Set to true only on successful generation.
  -- Pending and in-progress records are never publicly accessible.
  is_public        BOOLEAN     NOT NULL DEFAULT FALSE,

  revoked_at       TIMESTAMPTZ,
  generated_at     TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_cashflow_reports_broker_id  ON cashflow_reports(broker_id);
CREATE INDEX idx_cashflow_reports_status     ON cashflow_reports(status);
CREATE INDEX idx_cashflow_reports_created_at ON cashflow_reports(created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at trigger — reuses set_updated_at() from 001_requests_schema.sql
-- ---------------------------------------------------------------------------
CREATE TRIGGER cashflow_reports_updated_at
  BEFORE UPDATE ON cashflow_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
ALTER TABLE cashflow_reports ENABLE ROW LEVEL SECURITY;

-- Staff: full access to all rows (read, update status/inputs_final/report_data)
CREATE POLICY "staff_full_access" ON cashflow_reports
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'
  ));

-- Broker: read their own submitted requests only
CREATE POLICY "broker_read_own" ON cashflow_reports
  FOR SELECT
  USING (broker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Block direct inserts
-- All creation goes through submit-cashflow-request Edge Function (service role).
-- All updates go through generate-cashflow-report Edge Function (service role).
-- No anon or authenticated client ever touches this table directly.
-- ---------------------------------------------------------------------------
REVOKE INSERT ON cashflow_reports FROM anon, authenticated;
