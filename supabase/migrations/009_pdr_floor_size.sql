-- =============================================================================
-- 009_pdr_floor_size.sql
--
-- 1. Add floor_min / floor_max (NUMERIC m²) to request_pdr_details so a PDR
--    intake can record an internal floor-size constraint, alongside land size.
-- 2. Replace the three PDR-creation RPCs (create_pdr_public, create_pdr_request,
--    create_pdr_staff) with versions that accept the two new params. Old
--    signatures are DROP-then-CREATE-OR-REPLACE so we don't leave a stale
--    overload that older clients could still hit.
-- =============================================================================

-- ── 1. Columns ────────────────────────────────────────────────────────────────

ALTER TABLE request_pdr_details
  ADD COLUMN IF NOT EXISTS floor_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS floor_max NUMERIC(10,2);


-- ── 2. create_pdr_public ──────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS create_pdr_public(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION create_pdr_public(
  p_broker_id       UUID,
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
  p_land_min        TEXT,
  p_land_max        TEXT,
  p_floor_min       TEXT,
  p_floor_max       TEXT,
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
  IF p_client_email IS NULL OR TRIM(p_client_email) = '' THEN
    RAISE EXCEPTION 'client_email is required';
  END IF;
  IF p_budget_max IS NULL OR TRIM(p_budget_max) = '' THEN
    RAISE EXCEPTION 'budget_max is required';
  END IF;

  IF p_broker_id IS NOT NULL THEN
    SELECT id INTO v_resolved_broker_id
    FROM profiles
    WHERE id = p_broker_id AND role = 'broker' AND status = 'approved';
  END IF;

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

  INSERT INTO request_pdr_details (
    request_id,
    budget_min, budget_max,
    property_types, bedrooms, bathrooms, locations,
    purpose, rental_yield,
    land_min, land_max,
    floor_min, floor_max,
    notes
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
    NULLIF(REGEXP_REPLACE(p_land_min,     '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_land_max,     '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_floor_min,    '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_floor_max,    '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(TRIM(p_notes), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_pdr_public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pdr_public TO anon;


-- ── 3. create_pdr_request ─────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS create_pdr_request(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

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
  p_land_min        TEXT,
  p_land_max        TEXT,
  p_floor_min       TEXT,
  p_floor_max       TEXT,
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
    purpose, rental_yield,
    land_min, land_max,
    floor_min, floor_max,
    notes
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
    NULLIF(REGEXP_REPLACE(p_land_min,     '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_land_max,     '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_floor_min,    '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_floor_max,    '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(TRIM(p_notes), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_pdr_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pdr_request TO authenticated;


-- ── 4. create_pdr_staff ───────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS create_pdr_staff(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
);

CREATE OR REPLACE FUNCTION create_pdr_staff(
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
  p_land_min        TEXT,
  p_land_max        TEXT,
  p_floor_min       TEXT,
  p_floor_max       TEXT,
  p_notes           TEXT,
  p_client_id       UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff') THEN
    RAISE EXCEPTION 'Caller must be a staff member';
  END IF;

  IF p_client_name  IS NULL OR TRIM(p_client_name)  = '' THEN RAISE EXCEPTION 'client_name is required';  END IF;
  IF p_client_email IS NULL OR TRIM(p_client_email) = '' THEN RAISE EXCEPTION 'client_email is required'; END IF;
  IF p_budget_max   IS NULL OR TRIM(p_budget_max)   = '' THEN RAISE EXCEPTION 'budget_max is required';   END IF;
  IF p_locations    IS NULL OR TRIM(p_locations)    = '' THEN RAISE EXCEPTION 'locations is required';    END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'client_id does not exist';
  END IF;

  INSERT INTO requests (
    request_type, status, source,
    client_id, client_name, client_email, client_mobile
  ) VALUES (
    'pdr', 'pending', 'staff',
    p_client_id,
    TRIM(p_client_name), TRIM(p_client_email), NULLIF(TRIM(p_client_mobile), '')
  )
  RETURNING id INTO v_request_id;

  INSERT INTO request_pdr_details (
    request_id,
    budget_min, budget_max,
    property_types, bedrooms, bathrooms, locations,
    purpose, rental_yield,
    land_min, land_max,
    floor_min, floor_max,
    notes
  ) VALUES (
    v_request_id,
    NULLIF(REGEXP_REPLACE(p_budget_min,   '[^0-9.]', '', 'g'), '')::NUMERIC(12,2),
    REGEXP_REPLACE(p_budget_max,          '[^0-9.]', '', 'g')::NUMERIC(12,2),
    COALESCE(p_property_types, '{}'),
    NULLIF(TRIM(p_bedrooms),  ''),
    NULLIF(TRIM(p_bathrooms), ''),
    TRIM(p_locations),
    NULLIF(TRIM(p_purpose),   ''),
    NULLIF(REGEXP_REPLACE(p_rental_yield, '[^0-9.]', '', 'g'), '')::NUMERIC(5,2),
    NULLIF(REGEXP_REPLACE(p_land_min,     '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_land_max,     '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_floor_min,    '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(REGEXP_REPLACE(p_floor_max,    '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
    NULLIF(TRIM(p_notes), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_pdr_staff FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pdr_staff TO authenticated;
