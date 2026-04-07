// =============================================================================
// submit-cashflow-request/index.ts
//
// Called by the broker request form on submit.
//
// Responsibilities:
//   - Verify caller is an approved broker (not staff, not anon)
//   - Rate-limit: max 20 submissions per broker per day
//   - Validate inputs_broker payload
//   - Insert new cashflow_reports row with status = 'pending', is_public = false
//   - Return { id: uuid }
//
// Notifications (EmailJS + WhatsApp) are triggered client-side after a
// successful response — they are not sent from this function.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateInputsBroker } from "./schema.ts";

const DAILY_SUBMISSION_LIMIT = 20;

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
  const token = authHeader.replace("Bearer ", "");

  // ── Admin client (service role — bypasses RLS for privileged operations) ────
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Validate caller token ───────────────────────────────────────────────────
  const { data: userData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !userData?.user) {
    return json({ error: "AUTH_REQUIRED", message: "Invalid or expired token" }, 401);
  }
  const callerId = userData.user.id;

  // ── Verify caller is an approved broker (not staff) ─────────────────────────
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, status, name, email, company")
    .eq("id", callerId)
    .single();

  if (profileError || !callerProfile) {
    return json({ error: "AUTH_REQUIRED", message: "User profile not found" }, 401);
  }
  if (callerProfile.role !== "broker") {
    return json({ error: "INSUFFICIENT_ROLE", message: "Only brokers may submit cashflow requests" }, 403);
  }
  if (callerProfile.status !== "approved") {
    return json({ error: "ACCOUNT_NOT_APPROVED", message: "Broker account is not approved" }, 403);
  }

  // ── Rate limiting: max 20 submissions per broker per calendar day ───────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: submissionsToday, error: countError } = await adminClient
    .from("cashflow_reports")
    .select("id", { count: "exact", head: true })
    .eq("broker_id", callerId)
    .gte("created_at", todayStart.toISOString());

  if (countError) {
    console.error("[rate-limit] count error:", countError);
    return json({ error: "SERVER_ERROR", message: "Failed to check rate limit" }, 500);
  }

  if ((submissionsToday ?? 0) >= DAILY_SUBMISSION_LIMIT) {
    return json(
      {
        error: "RATE_LIMIT_EXCEEDED",
        message: `Maximum ${DAILY_SUBMISSION_LIMIT} cashflow requests per day. Please try again tomorrow.`,
      },
      429
    );
  }

  // ── Parse and validate request body ────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_REQUEST", message: "Request body must be valid JSON" }, 400);
  }

  const { inputs_broker } = body;

  const validationError = validateInputsBroker(inputs_broker);
  if (validationError) {
    return json({ error: "VALIDATION_ERROR", message: validationError }, 400);
  }

  const payload = inputs_broker as Record<string, unknown>;

  // Extract entity_type and property_address for top-level columns
  const entityType      = payload.entity_type as string;
  const propertyAddress = (payload.property_address as Record<string, unknown>).formatted_address as string;

  // ── Insert cashflow_reports row ─────────────────────────────────────────────
  const { data: inserted, error: insertError } = await adminClient
    .from("cashflow_reports")
    .insert({
      broker_id:        callerId,
      property_address: propertyAddress,
      entity_type:      entityType,
      inputs_broker:    payload,
      schema_version:   1,
      status:           "pending",
      is_public:        false,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[insert] error:", insertError);
    return json({ error: "SERVER_ERROR", message: "Failed to create cashflow request" }, 500);
  }

  // ── Return the new record ID ────────────────────────────────────────────────
  // Client is responsible for triggering staff notifications (EmailJS + WhatsApp)
  // after receiving a successful response.
  return json({ id: inserted.id });
});
