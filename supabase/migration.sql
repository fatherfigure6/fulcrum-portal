-- ── Profiles table ────────────────────────────────────────────────────────────
-- Stores user metadata alongside Supabase Auth.
-- Email is duplicated here because auth.users is not queryable from the client.

CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT        NOT NULL UNIQUE,
  name                TEXT        NOT NULL,
  role                TEXT        NOT NULL CHECK (role IN ('staff', 'broker')),
  status              TEXT        CHECK (status IN ('pending', 'approved')),
  company             TEXT,
  phone               TEXT,
  must_change_password BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "users_read_own"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Staff can read all profiles
CREATE POLICY "staff_read_all"
  ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'staff'
    )
  );

-- Users can insert their own profile (used during broker self-registration)
CREATE POLICY "users_insert_own"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile (e.g. must_change_password after forced change)
CREATE POLICY "users_update_own"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Staff can update any profile (e.g. approving brokers)
CREATE POLICY "staff_update_all"
  ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'staff'
    )
  );
