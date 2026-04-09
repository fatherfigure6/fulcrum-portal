// =============================================================================
// regenerate-onboarding-token/index.ts
//
// Staff-only. Revokes all currently active (unused, unrevoked) tokens for a
// client and generates a fresh one. The raw token is returned exactly once.
//
// The DB partial unique index (uq_onboarding_tokens_one_active_per_client)
// enforces that only one active token can exist per client at any time.
//
// regenerated_from_token_id on the new token records the audit chain.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "AUTH_REQUIRED", message: "Authorization header required" }, 401);
  }
  const bearerToken = authHeader.replace("Bearer ", "");

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: userData, error: authError } = await adminClient.auth.getUser(bearerToken);
  if (authError || !userData?.user) {
    return json({ error: "AUTH_REQUIRED", message: "Invalid or expired token" }, 401);
  }
  const callerId = userData.user.id;

  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();

  if (profileError || !callerProfile) {
    return json({ error: "AUTH_REQUIRED", message: "User profile not found" }, 401);
  }
  if (callerProfile.role !== "staff") {
    return json({ error: "INSUFFICIENT_ROLE", message: "Only staff may regenerate tokens" }, 403);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_REQUEST", message: "Request body must be valid JSON" }, 400);
  }

  const clientId = body.client_id as string | undefined;
  if (!clientId?.trim()) {
    return json({ error: "VALIDATION_ERROR", message: "client_id is required" }, 400);
  }

  // ── Find current active token (for audit chain) ─────────────────────────────
  const { data: activeToken } = await adminClient
    .from("onboarding_tokens")
    .select("id")
    .eq("client_id", clientId)
    .is("used_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  const oldTokenId = activeToken?.id ?? null;

  // ── Revoke all active tokens for this client ────────────────────────────────
  await adminClient
    .from("onboarding_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .is("used_at", null)
    .is("revoked_at", null);

  // ── Generate new raw token (32 bytes / 256 bits) ────────────────────────────
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = Array.from(rawBytes).map(b => b.toString(16).padStart(2, "0")).join("");

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken)
  );
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // ── Insert new token ────────────────────────────────────────────────────────
  const { data: newToken, error: insertError } = await adminClient
    .from("onboarding_tokens")
    .insert({
      client_id:                 clientId,
      token_hash:                tokenHash,
      created_by:                callerId,
      regenerated_from_token_id: oldTokenId,
      // expires_at defaults to NOW() + 14 days
    })
    .select("id")
    .single();

  if (insertError || !newToken) {
    console.error("[regenerate-onboarding-token] insert error:", insertError);
    return json({ error: "SERVER_ERROR", message: "Failed to generate new token" }, 500);
  }

  return json({ raw_token: rawToken, token_id: newToken.id });
});
