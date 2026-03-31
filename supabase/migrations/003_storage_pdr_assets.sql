-- =============================================================================
-- 003_storage_pdr_assets.sql
-- Private pdr-assets bucket + staff-only RLS policies on storage.objects
-- =============================================================================

-- Create private pdr-assets bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdr-assets', 'pdr-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies to allow idempotent reruns
DROP POLICY IF EXISTS "staff_upload" ON storage.objects;
DROP POLICY IF EXISTS "staff_update" ON storage.objects;
DROP POLICY IF EXISTS "staff_select" ON storage.objects;

-- Staff can INSERT (upload) objects in pdr-assets
CREATE POLICY "staff_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pdr-assets'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
  );

-- Staff can UPDATE (overwrite) objects in pdr-assets
CREATE POLICY "staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pdr-assets'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
  );

-- Staff can SELECT (download) objects from pdr-assets
CREATE POLICY "staff_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pdr-assets'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
  );
