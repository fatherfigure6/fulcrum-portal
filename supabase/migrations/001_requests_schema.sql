-- =============================================================================
-- 001_requests_schema.sql
-- Full relational request system — replaces kv_store JSON for all request types
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Parent table: requests
-- Holds all fields shared across request types (rent, cma, pdr, referral)
-- ---------------------------------------------------------------------------
CREATE TABLE requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  request_type    TEXT        NOT NULL
                              CHECK (request_type IN ('rent', 'cma', 'pdr', 'referral')),

  -- 'cancelled' included: staff may need to close a request without deleting it (preserves audit trail)
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'in_review', 'in_progress', 'complete', 'cancelled')),

  source          TEXT        NOT NULL DEFAULT 'broker'
                              CHECK (source IN ('public', 'broker', 'staff')),

  -- Broker (submitter) — null only for pure public PDR submissions with no broker link
  broker_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  broker_name     TEXT,
  broker_email    TEXT,
  broker_company  TEXT,

  -- Client contact — null for rent/CMA (property-based, no client contact stored)
  client_name     TEXT,
  client_email    TEXT,
  client_mobile   TEXT,

  -- Staff notes visible across all request types
  internal_notes  TEXT,

  -- Simple completion URL for rent/CMA/referral
  -- PDR uses report_pdf_path / report_html_path on request_pdr_details instead
  download_url    TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_requests_request_type ON requests(request_type);
CREATE INDEX idx_requests_status       ON requests(status);
CREATE INDEX idx_requests_broker_id    ON requests(broker_id);
CREATE INDEX idx_requests_created_at   ON requests(created_at DESC);

CREATE TRIGGER requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Rent details
-- ---------------------------------------------------------------------------
CREATE TABLE request_rent_details (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID  NOT NULL REFERENCES requests(id) ON DELETE CASCADE UNIQUE,
  address     TEXT  NOT NULL,
  weekly_rent NUMERIC(10,2),
  notes       TEXT
);

-- ---------------------------------------------------------------------------
-- CMA details
-- ---------------------------------------------------------------------------
CREATE TABLE request_cma_details (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID  NOT NULL REFERENCES requests(id) ON DELETE CASCADE UNIQUE,
  address         TEXT  NOT NULL,
  expected_value  NUMERIC(12,2),
  notes           TEXT
);

-- ---------------------------------------------------------------------------
-- Referral details
-- ---------------------------------------------------------------------------
CREATE TABLE request_referral_details (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID  NOT NULL REFERENCES requests(id) ON DELETE CASCADE UNIQUE,
  situation   TEXT,
  staff_notes TEXT  -- referral-specific annotation (in addition to parent internal_notes)
);

-- ---------------------------------------------------------------------------
-- PDR details
-- ---------------------------------------------------------------------------
CREATE TABLE request_pdr_details (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID          NOT NULL REFERENCES requests(id) ON DELETE CASCADE UNIQUE,

  -- Intake fields (broker/client-submitted — do not change these)
  budget_min          NUMERIC(12,2),
  budget_max          NUMERIC(12,2) NOT NULL,
  property_types      TEXT[]        NOT NULL DEFAULT '{}',
  bedrooms            TEXT,
  bathrooms           TEXT,
  locations           TEXT,
  purpose             TEXT          CHECK (purpose IN ('owner', 'investor')),
  rental_yield        NUMERIC(5,2),
  notes               TEXT,

  -- Staff fulfilment fields
  hero_statement      TEXT,
  viability_summary   TEXT,
  supporting_notes    TEXT,

  -- File paths
  sales_csv_file_path TEXT,
  report_pdf_path     TEXT,
  report_html_path    TEXT
);

-- ---------------------------------------------------------------------------
-- PDR strategy modules (optional, one-to-many per PDR request)
-- ---------------------------------------------------------------------------
CREATE TABLE pdr_strategies (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            UUID          NOT NULL REFERENCES requests(id) ON DELETE CASCADE,

  strategy_type         TEXT          NOT NULL
                                      CHECK (strategy_type IN (
                                        'value_creation',
                                        'capital_adjustment',
                                        'location_expansion',
                                        'property_configuration',
                                        'subdivision',
                                        'ancillary_dwelling'
                                      )),

  headline              TEXT,
  summary               TEXT,

  -- Financial fields — nullable, not every strategy uses all of them
  target_purchase_price NUMERIC(12,2),
  budget_amount         NUMERIC(12,2),
  projected_end_value   NUMERIC(12,2),

  supporting_notes      TEXT,
  sort_order            INTEGER       NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdr_strategies_request_id ON pdr_strategies(request_id);
CREATE INDEX idx_pdr_strategies_sort       ON pdr_strategies(request_id, sort_order);

CREATE TRIGGER pdr_strategies_updated_at
  BEFORE UPDATE ON pdr_strategies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------------
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access" ON requests
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'
  ));

CREATE POLICY "broker_read_own" ON requests
  FOR SELECT
  USING (broker_id = auth.uid());

-- No anon SELECT or direct INSERT — public PDR goes through SECURITY DEFINER RPC only

-- ---------------------------------------------------------------------------
-- request_rent_details
-- ---------------------------------------------------------------------------
ALTER TABLE request_rent_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access" ON request_rent_details
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'
  ));

CREATE POLICY "broker_read_own" ON request_rent_details
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM requests WHERE id = request_id AND broker_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- request_cma_details
-- ---------------------------------------------------------------------------
ALTER TABLE request_cma_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access" ON request_cma_details
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'
  ));

CREATE POLICY "broker_read_own" ON request_cma_details
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM requests WHERE id = request_id AND broker_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- request_referral_details
-- ---------------------------------------------------------------------------
ALTER TABLE request_referral_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access" ON request_referral_details
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'
  ));

CREATE POLICY "broker_read_own" ON request_referral_details
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM requests WHERE id = request_id AND broker_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- request_pdr_details
-- ---------------------------------------------------------------------------
ALTER TABLE request_pdr_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access" ON request_pdr_details
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'
  ));

CREATE POLICY "broker_read_own" ON request_pdr_details
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM requests WHERE id = request_id AND broker_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- pdr_strategies — staff only, brokers never access directly
-- ---------------------------------------------------------------------------
ALTER TABLE pdr_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access" ON pdr_strategies
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff'
  ));

-- ---------------------------------------------------------------------------
-- Explicitly remove direct INSERT from anon and authenticated on all tables
-- All creation goes through SECURITY DEFINER RPCs in 002_requests_rpcs.sql
-- ---------------------------------------------------------------------------
REVOKE INSERT ON requests               FROM anon, authenticated;
REVOKE INSERT ON request_rent_details   FROM anon, authenticated;
REVOKE INSERT ON request_cma_details    FROM anon, authenticated;
REVOKE INSERT ON request_referral_details FROM anon, authenticated;
REVOKE INSERT ON request_pdr_details    FROM anon, authenticated;
REVOKE INSERT ON pdr_strategies         FROM anon, authenticated;
-- pdr_strategies INSERT is granted back to authenticated — staff manage strategies
-- directly via supabase client (not RPC). RLS staff_full_access policy restricts to staff only.
GRANT INSERT ON pdr_strategies TO authenticated;
