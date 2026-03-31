const chromium = require('@sparticuz/chromium');
const { chromium: playwright } = require('playwright-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let browser = null;
  try {
    const { html, requestId } = req.body ?? {};

    if (!html || typeof html !== 'string' || html.trim().length < 50) {
      return res.status(400).json({ error: 'Missing or invalid html field' });
    }

    browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // Force screen media — page.pdf() defaults to print media.
    // The report is designed for screen rendering, so this is the safer first pass.
    await page.emulateMedia({ media: 'screen' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="pdr-${requestId || 'report'}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    return res.status(200).send(pdf);
  } catch (err) {
    console.error('[render-pdr-pdf] error:', err);
    return res.status(500).json({ error: 'PDF generation failed' });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
