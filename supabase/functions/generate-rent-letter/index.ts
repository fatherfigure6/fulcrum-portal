// =============================================================================
// generate-rent-letter/index.ts
//
// Generates a branded Perth Rental Management rent letter PDF.
//
// Responsibilities:
//   - Verify caller is authenticated and has staff role
//   - Validate the generation payload
//   - Fetch the PRM letterhead PNG from prm-assets/ (public bucket)
//   - Build the PDF using pdf-lib and return the raw bytes
//
// The client handles all storage uploads and DB record insertion —
// this function only generates and returns the PDF.
// =============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, PDFFont, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEAL        = rgb(0 / 255, 128 / 255, 128 / 255);
const BODY_DARK   = rgb(51 / 255, 51 / 255, 51 / 255);
const FOOTER_GREY = rgb(102 / 255, 102 / 255, 102 / 255);

interface GenerateLetterPayload {
  propertyAddress: string;
  rentLow: number;
  rentHigh: number;
  signatoryName: string;
  signatoryPhone: string;
  signatoryEmail: string;
  letterDate: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validatePayload(p: unknown): p is GenerateLetterPayload {
  if (!p || typeof p !== "object") return false;
  const pl = p as Record<string, unknown>;
  if (!pl.propertyAddress || typeof pl.propertyAddress !== "string" || !pl.propertyAddress.trim()) return false;
  if (!Number.isInteger(pl.rentLow) || (pl.rentLow as number) < 50 || (pl.rentLow as number) > 10000) return false;
  if (!Number.isInteger(pl.rentHigh) || (pl.rentHigh as number) < (pl.rentLow as number)) return false;
  if (!pl.signatoryName || typeof pl.signatoryName !== "string" || !pl.signatoryName.trim()) return false;
  if (!pl.signatoryPhone || typeof pl.signatoryPhone !== "string" || !pl.signatoryPhone.trim()) return false;
  if (!pl.signatoryEmail || typeof pl.signatoryEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pl.signatoryEmail as string)) return false;
  if (!pl.letterDate || typeof pl.letterDate !== "string" || isNaN(Date.parse(pl.letterDate as string))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Ordinal date formatting (Perth timezone)
// Correctly handles 11th, 12th, 13th edge cases
// ---------------------------------------------------------------------------
function formatOrdinalDate(isoDate: string, timeZone = "Australia/Perth"): string {
  const date = new Date(isoDate);
  const day = parseInt(new Intl.DateTimeFormat("en-AU", { day: "numeric", timeZone }).format(date));
  const month = new Intl.DateTimeFormat("en-AU", { month: "long", timeZone }).format(date);
  const year = new Intl.DateTimeFormat("en-AU", { year: "numeric", timeZone }).format(date);
  const suffix = (day >= 11 && day <= 13)
    ? "th"
    : day % 10 === 1 ? "st"
    : day % 10 === 2 ? "nd"
    : day % 10 === 3 ? "rd"
    : "th";
  return `${day}${suffix} of ${month} ${year}`;
}

// ---------------------------------------------------------------------------
// Text wrapping
// ---------------------------------------------------------------------------
function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // 1. Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    // 2. Authorisation — must be staff
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "staff") {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    // 3. Parse and validate payload
    const raw = await req.json();
    if (!validatePayload(raw)) {
      return json({ error: "Invalid payload. Check all fields." }, 400);
    }
    const payload = raw as GenerateLetterPayload;

    // 4. Fetch letterhead asset — fail explicitly if missing
    const { data: assetData } = supabase.storage
      .from("prm-assets")
      .getPublicUrl("prm-letterhead-header.png");

    const headerResponse = await fetch(assetData.publicUrl);
    if (!headerResponse.ok) {
      return json(
        { error: "Letterhead asset not found. Contact system administrator." },
        500,
      );
    }
    const headerPngBytes = await headerResponse.arrayBuffer();

    // 5. Build PDF
    const pdfDoc = await PDFDocument.create();
    const page   = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const marginLeft   = 60;
    const marginRight  = 60;
    const contentWidth = width - marginLeft - marginRight;
    const FOOTER_Y     = 70;
    const MIN_Y        = FOOTER_Y + 30;

    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Draw header image
    const headerImage  = await pdfDoc.embedPng(headerPngBytes);
    const headerHeight = 130;
    page.drawImage(headerImage, { x: 0, y: height - headerHeight, width, height: headerHeight });

    let y = height - headerHeight - 50;
    const lineH    = 18;
    const bodySize = 11;

    const drawLine = (text: string, font: PDFFont = regular, size = bodySize) => {
      page.drawText(text, { x: marginLeft, y, size, font, color: BODY_DARK });
      y -= lineH;
    };

    const drawWrapped = (text: string, font: PDFFont = regular, size = bodySize) => {
      for (const line of wrapText(text, contentWidth, size, font)) {
        if (y < MIN_Y) throw new Error("OVERFLOW");
        drawLine(line, font, size);
      }
    };

    try {
      // Date
      drawLine(formatOrdinalDate(payload.letterDate));
      y -= lineH;

      // Salutation
      drawLine("To Whom it may concern,");
      y -= lineH;

      // RE line
      drawLine(`RE: ${payload.propertyAddress}`, bold);
      y -= lineH;

      // Body paragraph 1
      drawWrapped(
        `We refer to the property mentioned above and advise that the property would conservatively obtain a rent return of $${payload.rentLow} - $${payload.rentHigh} per week in the current rental market.`,
      );
      y -= lineH;

      // Body paragraph 2
      drawWrapped(
        `The information provided in this appraisal letter is intended to assist you in understanding the potential rental return for the property mentioned above. While we have conducted a thorough assessment based on current market conditions, please be aware that rental returns can vary and are subject to factors such as property demand, and market fluctuations.`,
      );
      y -= lineH;

      // Body paragraph 3
      drawWrapped(
        `This appraisal serves as a valuable tool for informational purposes and should not be considered as a definitive guarantee of the actual rental return. Should you require further information, please do not hesitate to call our office at 08 6158 9924.`,
      );
      y -= lineH * 2;

      // Sign-off
      drawLine("Warm regards,");
      drawLine(payload.signatoryName, bold);
      drawLine("Perth Rental Management");
      drawLine(payload.signatoryPhone);
      drawLine(payload.signatoryEmail);

    } catch (e) {
      if ((e as Error).message === "OVERFLOW") {
        return json(
          { error: "Letter content exceeds single page. Shorten the property address." },
          422,
        );
      }
      throw e;
    }

    // Footer rule
    page.drawLine({
      start: { x: marginLeft,          y: FOOTER_Y + 22 },
      end:   { x: width - marginRight, y: FOOTER_Y + 22 },
      thickness: 0.5,
      color: TEAL,
    });

    const footerLines = [
      "Perth Rental Management Pty Ltd ABN 14 672 302 653 TA Perth Rental Management, Licensee Perth Rental Management Pty Ltd RA:66696",
      "PH: 08 6158 9924  W: perthrm.com.au  ADDRESS: 7/28 Robinson Avenue, Perth 6000",
    ];
    const footerSize = 7.5;
    for (const [i, line] of footerLines.entries()) {
      const tw = regular.widthOfTextAtSize(line, footerSize);
      page.drawText(line, {
        x: (width - tw) / 2,
        y: FOOTER_Y + 10 - i * 10,
        size: footerSize,
        font: regular,
        color: FOOTER_GREY,
      });
    }

    const pdfBytes = await pdfDoc.save();

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="rent-letter.pdf"',
      },
    });

  } catch (err) {
    console.error("generate-rent-letter error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
