-- =============================================================================
-- 007_staff_pdr_rpc.sql
--
-- 1. Add nullable client_id FK to requests (links staff-initiated PDRs to the
--    clients table without touching existing broker/public records).
-- 2. create_pdr_staff RPC — staff only, sets source='staff', broker fields NULL.
-- =============================================================================

-- ── 1. Add client_id to requests ──────────────────────────────────────────────

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requests_client_id ON requests(client_id);

-- ── 2. create_pdr_staff RPC ───────────────────────────────────────────────────

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
  -- Verify caller is a staff member
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff') THEN
    RAISE EXCEPTION 'Caller must be a staff member';
  END IF;

  -- Required field validation (server-side trust boundary)
  IF p_client_name  IS NULL OR TRIM(p_client_name)  = '' THEN RAISE EXCEPTION 'client_name is required';  END IF;
  IF p_client_email IS NULL OR TRIM(p_client_email) = '' THEN RAISE EXCEPTION 'client_email is required'; END IF;
  IF p_budget_max   IS NULL OR TRIM(p_budget_max)   = '' THEN RAISE EXCEPTION 'budget_max is required';   END IF;
  IF p_locations    IS NULL OR TRIM(p_locations)    = '' THEN RAISE EXCEPTION 'locations is required';    END IF;

  -- Validate client_id exists if provided
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
    purpose, rental_yield, notes
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
    NULLIF(TRIM(p_notes), '')
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_pdr_staff FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pdr_staff TO authenticated;
