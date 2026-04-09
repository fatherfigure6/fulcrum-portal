-- =============================================================================
-- 009_rent_letters.sql
-- rent_letters table + RLS + storage RLS for cma-uploads and rent-letters buckets
--
-- NOTE: Before running this migration, create the following buckets in the
-- Supabase Storage dashboard (Storage > New bucket):
--   • cma-uploads   — Private
--   • rent-letters  — Private
--   • prm-assets    — Public (for the letterhead PNG)
--
-- Then upload prm-letterhead-header.png to prm-assets/ before deploying
-- the generate-rent-letter edge function.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- rent_letters — immutable audit records, one per generation
-- FK to requests(id) — the existing rent request row (request_type = 'rent')
-- ---------------------------------------------------------------------------
CREATE TABLE rent_letters (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             UUID          REFERENCES requests(id) ON DELETE SET NULL,

  -- Letter content inputs (snapshot at time of generation)
  property_address       TEXT          NOT NULL,
  rent_low               INTEGER       NOT NULL CHECK (rent_low >= 50 AND rent_low <= 10000),
  rent_high              INTEGER       NOT NULL CHECK (rent_high >= 50 AND rent_high <= 10000),
  signatory_name         TEXT          NOT NULL,
  signatory_phone        TEXT          NOT NULL,
  signatory_email        TEXT          NOT NULL,

  -- Versioning — set by client using pre-flight count query
  version_number         INTEGER       NOT NULL DEFAULT 1,

  -- Storage paths (relative paths within their respective buckets)
  cma_storage_path       TEXT,
  cma_original_filename  TEXT,
  cma_file_size_bytes    INTEGER,
  letter_storage_path    TEXT          NOT NULL,
  letter_file_size_bytes INTEGER,

  -- Optional audit snapshot of the originating request at time of generation
  request_snapshot       JSONB,

  -- Free-text notes (e.g. "regenerated due to address correction")
  generation_notes       TEXT,

  -- Metadata
  generated_by           UUID          REFERENCES auth.users(id),
  generated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  letter_date            DATE          NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_rent_letters_request_id  ON rent_letters(request_id);
CREATE INDEX idx_rent_letters_generated_at ON rent_letters(generated_at DESC);
CREATE INDEX idx_rent_letters_generated_by ON rent_letters(generated_by);

-- ---------------------------------------------------------------------------
-- RLS — staff can read and insert; no UPDATE or DELETE (immutable audit log)
-- ---------------------------------------------------------------------------
ALTER TABLE rent_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view rent letters"
  ON rent_letters FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  ));

CREATE POLICY "Staff can create rent letters"
  ON rent_letters FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  ));

-- No UPDATE or DELETE policies — records are immutable by design.
-- Regeneration creates a new versioned record; prior versions are never modified.

-- ---------------------------------------------------------------------------
-- Storage RLS — cma-uploads bucket (private)
-- ---------------------------------------------------------------------------
CREATE POLICY "Staff upload CMAs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cma-uploads' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );

CREATE POLICY "Staff read CMAs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cma-uploads' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );

-- ---------------------------------------------------------------------------
-- Storage RLS — rent-letters bucket (private)
-- ---------------------------------------------------------------------------
CREATE POLICY "Staff upload letters"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rent-letters' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );

CREATE POLICY "Staff read letters"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rent-letters' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff')
  );
