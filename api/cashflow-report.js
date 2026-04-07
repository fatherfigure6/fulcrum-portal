import { createClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ available: false });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
    return res.status(404).json({ available: false });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let data;
  try {
    const result = await supabase
      .from('cashflow_reports')
      .select('report_data, schema_version, status, revoked_at')
      .eq('id', id)
      .single();

    if (result.error || !result.data) {
      return res.status(404).json({ available: false });
    }

    data = result.data;
  } catch {
    return res.status(404).json({ available: false });
  }

  // Report must be complete, have data, and not be revoked
  if (
    data.status !== 'complete' ||
    data.report_data === null ||
    data.revoked_at !== null
  ) {
    return res.status(404).json({ available: false });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  return res.status(200).json({
    available:      true,
    report_data:    data.report_data,
    schema_version: data.schema_version,
  });
}
