-- =============================================================================
-- 002_requests_rpcs.sql
-- SECURITY DEFINER RPC functions for atomic request creation
-- All functions: REVOKE ALL FROM PUBLIC, then GRANT EXECUTE to specific roles only
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: strip non-numeric characters and cast to NUMERIC
-- Used inline in each RPC to handle currency strings like "$600,000"
-- ---------------------------------------------------------------------------
-- REGEXP_REPLACE(val, '[^0-9.]', '', 'g')::NUMERIC(12,2)
-- NULLIF(..., '') handles empty strings → NULL


-- =============================================================================
-- create_pdr_public
-- Called by unauthenticated public PDR form (/pdr?id=<brokerId>)
-- GRANT EXECUTE to anon only — authenticated brokers use create_pdr_request
-- =============================================================================
CREATE OR REPLACE FUNCTION create_pdr_public(
  p_broker_id       UUID,    -- optional; validated; silently nulled if invalid/unapproved
  p_client_name     TEXT,
  p_client_email    TEXT,
  p_client_mobile   TEXT,
  p_budget_min      TEXT,
  p_budget_max      TEXT,
  p_property_types  TEXT[],
  p_bedrooms        TEXT,
  p_bathrooms       TEXT,
  p_locations       TEXT,
  p_purpose         TEXT,
  p_rental_yield    TEXT,
  p_notes           TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id         UUID;
  v_resolved_broker_id UUID := NULL;
BEGIN
  -- Validate required fields
  IF p_client_email IS NULL OR TRIM(p_client_email) = '' THEN
    RAISE EXCEPTION 'client_email is required';
  END IF;
  IF p_budget_max IS NULL OR TRIM(p_budget_max) = '' THEN
    RAISE EXCEPTION 'budget_max is required';
  END IF;

  -- Validate broker_id if supplied — must be an approved broker
  -- If not found or not approved, silently fall back to NULL
  -- (client submission is preserved; broker attribution is lost, not the request)
  IF p_broker_id IS NOT NULL THEN
    SELECT id INTO v_resolved_broker_id
    FROM profiles
    WHERE id = p_broker_id AND role = 'broker' AND status = 'approved';
    -- v_resolved_broker_id stays NULL if no matching approved broker found
  END IF;

  -- Insert parent request (atomic with detail insert below)
  INSERT INTO requests (
    request_type, status, source,
    broker_id,
    client_name, client_email, client_mobile
  ) VALUES (
    'pdr', 'pending', 'public',
    v_resolved_broker_id,
    TRIM(p_client_name), TRIM(p_client_email), NULLIF(TRIM(p_client_mobile), '')
  )
  RETURNING id INTO v_request_id;

  -- Insert PDR detail in same transaction — no orphan possible
  INSERT INTO request_pdr_details (
    request_id,
    budget_min, budget_max,
    property_types, bedrooms, bathrooms, locations,
    purpose, rental_yield, notes
  ) VALUES (
    v_request_id,
    NULLIF(REGEXP_REPLACE(p_budget_min,   '[^0-9.]', '', 'g'), '')::NUMERIC(12,2),
    REGEXP_REPLACE(p_budget_max,          '[^0-9.]', '', 'g')::NUMERIC(12,2),
    COALESCE(p_property_types, '{}'),
    NULLIF(TRIM(p_bedrooms), ''),
    NULLIF(TRIM(p_bathrooms), ''),
    NULLIF(TRIM(p_locations), ''),
    NULLIF(TRIM(p_purpose), ''),
    NULLIF(REGEXP_REPLACE(p_rental_yield, '[^0-9.]', '', 'g'), '')::NUMERIC(5,2),
    NULLIF(TRIM(p_notes), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_pdr_public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pdr_public TO anon;
-- authenticated brokers use create_pdr_request instead


-- =============================================================================
-- create_pdr_request
-- Called by authenticated broker submitting PDR from within the portal
-- =============================================================================
CREATE OR REPLACE FUNCTION create_pdr_request(
  p_client_name     TEXT,
  p_client_email    TEXT,
  p_client_mobile   TEXT,
  p_budget_min      TEXT,
  p_budget_max      TEXT,
  p_property_types  TEXT[],
  p_bedrooms        TEXT,
  p_bathrooms       TEXT,
  p_locations       TEXT,
  p_purpose         TEXT,
  p_rental_yield    TEXT,
  p_notes           TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
  v_broker     profiles%ROWTYPE;
BEGIN
  -- Verify caller is an approved broker
  SELECT * INTO v_broker
  FROM profiles
  WHERE id = auth.uid() AND role = 'broker' AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller must be an approved broker';
  END IF;

  IF p_client_email IS NULL OR TRIM(p_client_email) = '' THEN
    RAISE EXCEPTION 'client_email is required';
  END IF;
  IF p_budget_max IS NULL OR TRIM(p_budget_max) = '' THEN
    RAISE EXCEPTION 'budget_max is required';
  END IF;

  INSERT INTO requests (
    request_type, status, source,
    broker_id, broker_name, broker_email, broker_company,
    client_name, client_email, client_mobile
  ) VALUES (
    'pdr', 'pending', 'broker',
    v_broker.id, v_broker.name, v_broker.email, v_broker.company,
    TRIM(p_client_name), TRIM(p_client_email), NULLIF(TRIM(p_client_mobile), '')
  )
  RETURNING id INTO v_request_id;

  INSERT INTO request_pdr_details (
    request_id,
    budget_min, budget_max,
    property_types, bedrooms, bathrooms, locations,
    purpose, rental_yield, notes
  ) VALUES (
    v_request_id,
    NULLIF(REGEXP_REPLACE(p_budget_min,   '[^0-9.]', '', 'g'), '')::NUMERIC(12,2),
    REGEXP_REPLACE(p_budget_max,          '[^0-9.]', '', 'g')::NUMERIC(12,2),
    COALESCE(p_property_types, '{}'),
    NULLIF(TRIM(p_bedrooms), ''),
    NULLIF(TRIM(p_bathrooms), ''),
    NULLIF(TRIM(p_locations), ''),
    NULLIF(TRIM(p_purpose), ''),
    NULLIF(REGEXP_REPLACE(p_rental_yield, '[^0-9.]', '', 'g'), '')::NUMERIC(5,2),
    NULLIF(TRIM(p_notes), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_pdr_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pdr_request TO authenticated;


-- =============================================================================
-- create_rent_request
-- =============================================================================
CREATE OR REPLACE FUNCTION create_rent_request(
  p_address     TEXT,
  p_weekly_rent TEXT,
  p_notes       TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
  v_broker     profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_broker
  FROM profiles
  WHERE id = auth.uid() AND role = 'broker' AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved broker required';
  END IF;

  IF p_address IS NULL OR TRIM(p_address) = '' THEN
    RAISE EXCEPTION 'address is required';
  END IF;

  INSERT INTO requests (
    request_type, status, source,
    broker_id, broker_name, broker_email, broker_company
  ) VALUES (
    'rent', 'pending', 'broker',
    v_broker.id, v_broker.name, v_broker.email, v_broker.company
  )
  RETURNING id INTO v_request_id;

  INSERT INTO request_rent_details (request_id, address, weekly_rent, notes)
  VALUES (
    v_request_id,
    TRIM(p_address),
    NULLIF(REGEXP_REPLACE(p_weekly_rent, '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(TRIM(p_notes), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_rent_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_rent_request TO authenticated;


-- =============================================================================
-- create_cma_request
-- =============================================================================
CREATE OR REPLACE FUNCTION create_cma_request(
  p_address        TEXT,
  p_expected_value TEXT,
  p_notes          TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
  v_broker     profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_broker
  FROM profiles
  WHERE id = auth.uid() AND role = 'broker' AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved broker required';
  END IF;

  IF p_address IS NULL OR TRIM(p_address) = '' THEN
    RAISE EXCEPTION 'address is required';
  END IF;

  INSERT INTO requests (
    request_type, status, source,
    broker_id, broker_name, broker_email, broker_company
  ) VALUES (
    'cma', 'pending', 'broker',
    v_broker.id, v_broker.name, v_broker.email, v_broker.company
  )
  RETURNING id INTO v_request_id;

  INSERT INTO request_cma_details (request_id, address, expected_value, notes)
  VALUES (
    v_request_id,
    TRIM(p_address),
    NULLIF(REGEXP_REPLACE(p_expected_value, '[^0-9.]', '', 'g'), '')::NUMERIC(12,2),
    NULLIF(TRIM(p_notes), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_cma_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_cma_request TO authenticated;


-- =============================================================================
-- create_referral_request
-- =============================================================================
CREATE OR REPLACE FUNCTION create_referral_request(
  p_client_name   TEXT,
  p_client_email  TEXT,
  p_client_mobile TEXT,
  p_situation     TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
  v_broker     profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_broker
  FROM profiles
  WHERE id = auth.uid() AND role = 'broker' AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved broker required';
  END IF;

  IF p_client_name IS NULL OR TRIM(p_client_name) = '' THEN
    RAISE EXCEPTION 'client_name is required';
  END IF;

  INSERT INTO requests (
    request_type, status, source,
    broker_id, broker_name, broker_email, broker_company,
    client_name, client_email, client_mobile
  ) VALUES (
    'referral', 'pending', 'broker',
    v_broker.id, v_broker.name, v_broker.email, v_broker.company,
    TRIM(p_client_name),
    NULLIF(TRIM(p_client_email), ''),
    NULLIF(TRIM(p_client_mobile), '')
  )
  RETURNING id INTO v_request_id;

  INSERT INTO request_referral_details (request_id, situation)
  VALUES (
    v_request_id,
    NULLIF(TRIM(p_situation), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_referral_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_referral_request TO authenticated;
