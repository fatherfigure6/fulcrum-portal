-- =============================================================================
-- 004_storage_pdr_reports.sql
-- Private pdr-reports bucket + staff-only RLS policies on storage.objects
-- =============================================================================

-- Create private pdr-reports bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdr-reports', 'pdr-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies to allow idempotent reruns
DROP POLICY IF EXISTS "staff_upload_reports" ON storage.objects;
DROP POLICY IF EXISTS "staff_update_reports" ON storage.objects;
DROP POLICY IF EXISTS "staff_select_reports" ON storage.objects;

-- Staff can INSERT (upload) objects in pdr-reports
CREATE POLICY "staff_upload_reports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pdr-reports'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
  );

-- Staff can UPDATE (overwrite) objects in pdr-reports
CREATE POLICY "staff_update_reports" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pdr-reports'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
  );

-- Staff can SELECT (download) objects from pdr-reports
CREATE POLICY "staff_select_reports" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pdr-reports'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
  );
