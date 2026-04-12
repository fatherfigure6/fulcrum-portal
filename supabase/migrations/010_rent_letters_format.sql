-- Add letter_format column so the endpoint knows which Content-Type to serve.
-- Existing rows are assumed to be PDF (the only format generated before this migration).
ALTER TABLE rent_letters
  ADD COLUMN letter_format TEXT NOT NULL DEFAULT 'pdf'
  CHECK (letter_format IN ('pdf', 'html'));

-- Enforce uniqueness of version numbers per request so latest-version resolution
-- via ORDER BY version_number DESC is deterministic.
ALTER TABLE rent_letters
  ADD CONSTRAINT rent_letters_request_version_unique
  UNIQUE (request_id, version_number);
