// =============================================================================
// api/rent-letter.js
//
// Serves a generated rent letter from private Supabase storage.
// The durable URL is: /api/rent-letter?id={requestId}
//
// Always resolves the latest version for the given request, so the URL
// remains stable across regenerations.
//
// No authentication required — requestId is a UUID (non-guessable).
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Letter Not Found | Fulcrum Australia</title>
  <style>
    body { margin: 0; font-family: Helvetica, Arial, sans-serif; background: #f5f7fa; color: #2b3240;
           display: grid; place-items: center; min-height: 100vh; text-align: center; padding: 20px; }
    .card { background: #fff; border: 1px solid #d9e1e8; border-radius: 16px; padding: 40px 32px;
            max-width: 480px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
    h1 { margin: 0 0 12px; font-size: 1.4rem; }
    p  { margin: 8px 0 0; line-height: 1.6; color: #6b7280; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Fulcrum Australia</h1>
    <p>This rent letter is not available.</p>
    <p>The link may be incorrect, or the letter may not have been generated yet.</p>
  </div>
</body>
</html>`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
    return notFound(res);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Resolve the latest version for this request
  const { data: letter, error: dbError } = await supabase
    .from('rent_letters')
    .select('letter_storage_path, letter_format')
    .eq('request_id', id)
    .order('version_number', { ascending: false })
    .order('created_at',     { ascending: false })
    .limit(1)
    .single();

  if (dbError || !letter) {
    console.error(`[rent-letter] no record for request_id=${id}:`, dbError?.message ?? 'no data');
    return notFound(res);
  }

  const { letter_storage_path, letter_format } = letter;

  const { data: fileBlob, error: storageError } = await supabase.storage
    .from('rent-letters')
    .download(letter_storage_path);

  if (storageError || !fileBlob) {
    console.error(`[rent-letter] storage download failed for path=${letter_storage_path}:`, storageError?.message ?? 'no data');
    return res.status(500).send('Internal Server Error');
  }

  const contentType = letter_format === 'pdf'
    ? 'application/pdf'
    : 'text/html; charset=utf-8';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (letter_format === 'pdf') {
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    res.setHeader('Content-Disposition', 'inline; filename="rent-letter.pdf"');
    return res.status(200).send(buffer);
  }

  const html = await fileBlob.text();
  res.setHeader('Content-Disposition', 'inline');
  return res.status(200).send(html);
}
