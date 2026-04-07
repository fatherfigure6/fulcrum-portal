import { createClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setNoCache(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

function html404() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Report Not Available | Fulcrum Australia</title>
  <style>
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f5f7fa; color: #2b3240;
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
    <p>This report is not available.</p>
    <p>The link may be incorrect or the report may not have been published.</p>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCache(res);
    return res.status(404).send(html404());
  }

  const appOrigin =
    process.env.PUBLIC_APP_URL ||
    `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let data;
  try {
    const result = await supabase
      .from('cashflow_reports')
      .select('status, revoked_at, property_address')
      .eq('id', id)
      .single();

    if (result.error || !result.data) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      setNoCache(res);
      return res.status(404).send(html404());
    }

    data = result.data;
  } catch {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCache(res);
    return res.status(404).send(html404());
  }

  if (data.status !== 'complete' || data.revoked_at !== null) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCache(res);
    return res.status(404).send(html404());
  }

  const address     = (data.property_address || '').trim();
  const shareUrl    = `${appOrigin}/share/report/${id}`;
  const reportUrl   = `${appOrigin}/report?id=${id}`;
  const imageUrl    = `${appOrigin}/og-image.png`;
  const titleRaw    = address
    ? `Cashflow Analysis \u2014 ${address} | Fulcrum Australia`
    : 'Cashflow Analysis Report | Fulcrum Australia';
  const title       = escHtml(titleRaw);
  const description = escHtml('View this Fulcrum Australia cashflow analysis report.');
  const reportUrlEsc = escHtml(reportUrl);

  const successHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="robots" content="noindex, nofollow" />
  <link rel="canonical" href="${escHtml(shareUrl)}" />

  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url"         content="${escHtml(shareUrl)}" />
  <meta property="og:image"       content="${escHtml(imageUrl)}" />
  <meta property="og:image:alt"   content="Fulcrum Australia logo on dark background" />
  <meta property="og:site_name"   content="Fulcrum Australia" />

  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image"       content="${escHtml(imageUrl)}" />

  <meta http-equiv="refresh" content="0; url=${reportUrlEsc}" />
  <script>window.location.replace(${JSON.stringify(reportUrl)});</script>
</head>
<body style="font-family:Inter,Arial,sans-serif;text-align:center;padding:60px 20px;color:#2b3240;background:#f5f7fa;">
  <p style="font-size:1.1rem;margin-bottom:16px;">Opening report\u2026</p>
  <a href="${reportUrlEsc}" style="color:#2b3240;font-size:0.95rem;">Click here if you are not redirected</a>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  setNoCache(res);

  return res.status(200).send(successHtml);
}
