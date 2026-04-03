import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const { id } = req.query;

  // Expect UUID request id
  if (!id || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).send('Invalid report ID.');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data, error } = await supabase.storage
    .from('pdr-reports')
    .download(`pdr/${id}/report.html`);

  if (error || !data) {
    console.error(`[report] report.html not found for id=${id}:`, error?.message ?? 'no data');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.status(404).send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Report Not Found</title>
          <style>
            body {
              margin: 0;
              font-family: Inter, Arial, sans-serif;
              background: #f5f7fa;
              color: #2c3e50;
              display: grid;
              place-items: center;
              min-height: 100vh;
            }
            .card {
              background: #fff;
              border: 1px solid #d9e1e8;
              border-radius: 16px;
              padding: 32px;
              max-width: 520px;
              box-shadow: 0 8px 24px rgba(0,0,0,0.06);
            }
            h1 { margin: 0 0 12px; font-size: 28px; }
            p { margin: 0; line-height: 1.6; color: #5b6773; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Report not found</h1>
            <p>This report may not exist yet, or the link may be incorrect.</p>
          </div>
        </body>
      </html>
    `);
  }

  const html = await data.text();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  return res.status(200).send(html);
}
