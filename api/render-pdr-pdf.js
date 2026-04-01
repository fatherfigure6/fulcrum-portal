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

    const page = await browser.newPage({
      viewport: { width: 1100, height: 1600 },
    });

    // Let content and linked assets settle.
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Force screen media — the report is designed for screen layout, not print layout.
    await page.emulateMedia({ media: 'screen' });

    // Wait for fonts to fully load before capture.
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });

    // Allow one additional frame for layout to settle after font metrics apply.
    await page.evaluate(() => new Promise(requestAnimationFrame));

    await page.waitForTimeout(300);

    // DEBUG: uncomment to capture screenshot and return PNG instead of PDF
    // const png = await page.screenshot({ fullPage: true });
    // res.setHeader('Content-Type', 'image/png');
    // return res.status(200).send(png);

    // PDF page width matches viewport width exactly — no shrink-to-fit scaling.
    // Height uses the A4 aspect ratio equivalent of 1100px width: 1100 * (297 / 210) ≈ 1557px.
    const pdf = await page.pdf({
      width: '1100px',
      height: '1557px',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
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
