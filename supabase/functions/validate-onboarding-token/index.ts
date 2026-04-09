// =============================================================================
// validate-onboarding-token/index.ts
//
// Public — no authentication required.
// Called by the OnboardingForm component on mount to check whether a token
// is valid before rendering the questionnaire.
//
// Returns only the minimum public state needed to render the form safely.
// Token lifecycle detail is consolidated to reduce enumeration surface:
//   INVALID_OR_EXPIRED — token not found, expired, or revoked
//   ALREADY_SUBMITTED  — token has already been used
//
// On success returns { first_name } to personalise the form greeting.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // ── Read token from query param ─────────────────────────────────────────────
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token");

  if (!rawToken?.trim()) {
    return json({ error: "TOKEN_MISSING", message: "token query parameter is required" }, 400);
  }

  // ── SHA-256 hash the incoming token ────────────────────────────────────────
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken.trim())
  );
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // ── Admin client (service role — needed to read without RLS) ────────────────
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Look up token + client ──────────────────────────────────────────────────
  const { data: row, error } = await adminClient
    .from("onboarding_tokens")
    .select("id, used_at, revoked_at, expires_at, clients(first_name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("[validate-onboarding-token] lookup error:", error);
    return json({ error: "SERVER_ERROR", message: "Token validation failed" }, 500);
  }

  // ── Token not found ─────────────────────────────────────────────────────────
  if (!row) {
    return json({ error: "INVALID_OR_EXPIRED" }, 404);
  }

  // ── Token already used ──────────────────────────────────────────────────────
  if (row.used_at) {
    return json({ error: "ALREADY_SUBMITTED" }, 409);
  }

  // ── Token revoked or expired ────────────────────────────────────────────────
  if (row.revoked_at || new Date(row.expires_at) <= new Date()) {
    return json({ error: "INVALID_OR_EXPIRED" }, 410);
  }

  // ── Valid token ─────────────────────────────────────────────────────────────
  const client = row.clients as unknown as { first_name: string } | null;
  return json({ first_name: client?.first_name ?? "" });
});
