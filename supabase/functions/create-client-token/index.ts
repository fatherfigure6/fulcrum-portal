// =============================================================================
// create-client-token/index.ts
//
// Staff-only. Creates a new client record and generates a tokenised onboarding
// link. The raw 256-bit token is returned exactly once — only the SHA-256 hash
// is stored in the database.
//
// Responsibilities:
//   - Verify caller is staff
//   - Validate required client fields
//   - Generate 32-byte cryptographically secure raw token
//   - Store only the SHA-256 hex digest in onboarding_tokens
//   - Return { client_id, token_id, raw_token } — raw_token shown once to staff
//
// The caller (ClientsSection UI) builds the full onboarding URL:
//   https://<host>/onboard?token=<raw_token>
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

  // ── Parse Authorization header ──────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "AUTH_REQUIRED", message: "Authorization header required" }, 401);
  }
  const bearerToken = authHeader.replace("Bearer ", "");

  // ── Admin client (service role — bypasses RLS) ──────────────────────────────
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Validate caller token ───────────────────────────────────────────────────
  const { data: userData, error: authError } = await adminClient.auth.getUser(bearerToken);
  if (authError || !userData?.user) {
    return json({ error: "AUTH_REQUIRED", message: "Invalid or expired token" }, 401);
  }
  const callerId = userData.user.id;

  // ── Verify caller is staff ──────────────────────────────────────────────────
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();

  if (profileError || !callerProfile) {
    return json({ error: "AUTH_REQUIRED", message: "User profile not found" }, 401);
  }
  if (callerProfile.role !== "staff") {
    return json({ error: "INSUFFICIENT_ROLE", message: "Only staff may create client records" }, 403);
  }

  // ── Parse and validate request body ────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_REQUEST", message: "Request body must be valid JSON" }, 400);
  }

  const { first_name, last_name, email, phone } = body as Record<string, string>;

  if (!first_name?.trim()) return json({ error: "VALIDATION_ERROR", message: "first_name is required" }, 400);
  if (!last_name?.trim())  return json({ error: "VALIDATION_ERROR", message: "last_name is required" }, 400);
  if (!email?.trim())      return json({ error: "VALIDATION_ERROR", message: "email is required" }, 400);
  if (!phone?.trim())      return json({ error: "VALIDATION_ERROR", message: "phone is required" }, 400);

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return json({ error: "VALIDATION_ERROR", message: "email format is invalid" }, 400);
  }

  // ── Generate cryptographically secure token ─────────────────────────────────
  // 32 bytes = 256 bits of entropy. Encoded as 64-char hex string.
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = Array.from(rawBytes).map(b => b.toString(16).padStart(2, "0")).join("");

  // SHA-256 hash — the only form stored in the database
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken)
  );
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // ── Insert client row ───────────────────────────────────────────────────────
  const { data: newClient, error: clientError } = await adminClient
    .from("clients")
    .insert({
      first_name: first_name.trim(),
      last_name:  last_name.trim(),
      email:      email.trim().toLowerCase(),
      phone:      phone.trim(),
      created_by: callerId,
    })
    .select("id")
    .single();

  if (clientError || !newClient) {
    console.error("[create-client-token] client insert error:", clientError);
    return json({ error: "SERVER_ERROR", message: "Failed to create client record" }, 500);
  }

  const clientId = newClient.id;

  // ── Insert token row ────────────────────────────────────────────────────────
  const { data: newToken, error: tokenError } = await adminClient
    .from("onboarding_tokens")
    .insert({
      client_id:  clientId,
      token_hash: tokenHash,
      created_by: callerId,
      // expires_at defaults to NOW() + 14 days in the schema
    })
    .select("id")
    .single();

  if (tokenError || !newToken) {
    console.error("[create-client-token] token insert error:", tokenError);
    // Roll back the client row to avoid orphaned records
    await adminClient.from("clients").delete().eq("id", clientId);
    return json({ error: "SERVER_ERROR", message: "Failed to generate onboarding token" }, 500);
  }

  // ── Return raw token (shown once — never stored) ────────────────────────────
  return json({
    client_id: clientId,
    token_id:  newToken.id,
    raw_token: rawToken,
  });
});
