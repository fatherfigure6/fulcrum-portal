// =============================================================================
// generate-cashflow-report/index.ts
//
// Called by the staff completion form to generate a cashflow report.
//
// Responsibilities:
//   - Verify caller is staff — broker sessions rejected with INSUFFICIENT_ROLE
//   - Validate inputs_final payload
//   - Run the calculation engine (pure, no side effects)
//   - Update cashflow_reports row: inputs_final, report_data, status, is_public,
//     staff_id, generated_at
//   - Return { id: uuid }
//
// Also handles staff-initiated reports (no prior broker request):
//   If request_id is provided: update the existing row.
//   If request_id is null/absent: insert a new row (staff-initiated).
//
// Notifications (broker completion email) are triggered client-side after
// a successful response — not sent from this function.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateInputsFinal } from "./schema.ts";
import { calculate, InputsFinal } from "./calculator.ts";

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

  // ── Parse Authorization header ──────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "AUTH_REQUIRED", message: "Authorization header required" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");

  // ── Admin client (service role — bypasses RLS) ──────────────────────────────
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

  // ── Verify caller is staff — reject brokers with INSUFFICIENT_ROLE ──────────
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, name")
    .eq("id", callerId)
    .single();

  if (profileError || !callerProfile) {
    return json({ error: "AUTH_REQUIRED", message: "User profile not found" }, 401);
  }
  if (callerProfile.role !== "staff") {
    return json({
      error: "INSUFFICIENT_ROLE",
      message: "Only staff may generate cashflow reports",
    }, 403);
  }

  // ── Parse request body ──────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_REQUEST", message: "Request body must be valid JSON" }, 400);
  }

  const { request_id, inputs_final, entity_type, property_address } = body;

  // ── Validate inputs_final ───────────────────────────────────────────────────
  const validationError = validateInputsFinal(inputs_final);
  if (validationError) {
    return json({ error: "VALIDATION_ERROR", message: validationError }, 400);
  }

  const finalPayload = inputs_final as unknown as InputsFinal;

  // ── Run calculation engine (pure, no side effects) ──────────────────────────
  const generatedAt = new Date().toISOString();
  let reportData: Record<string, unknown>;
  try {
    reportData = calculate(finalPayload, generatedAt) as Record<string, unknown>;
  } catch (calcError) {
    console.error("[calculator] error:", calcError);
    return json({ error: "CALCULATION_ERROR", message: "Report calculation failed" }, 500);
  }

  // ── Persist to database ─────────────────────────────────────────────────────
  const resolvedEntityType = (entity_type as string) || finalPayload.entity_type;
  const resolvedAddress    = (property_address as string) ||
    (finalPayload.property_address as Record<string, string>)?.formatted_address || '';

  let recordId: string;

  if (request_id && typeof request_id === 'string') {
    // ── Update existing broker-submitted request ──────────────────────────────
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(request_id)) {
      return json({ error: "INVALID_REQUEST", message: "request_id must be a valid UUID" }, 400);
    }

    const { data: updated, error: updateError } = await adminClient
      .from("cashflow_reports")
      .update({
        inputs_final:    finalPayload,
        report_data:     reportData,
        staff_id:        callerId,
        status:          "complete",
        is_public:       true,
        generated_at:    generatedAt,
        updated_at:      generatedAt,
      })
      .eq("id", request_id)
      .select("id")
      .single();

    if (updateError || !updated) {
      console.error("[update] error:", updateError);
      return json({ error: "SERVER_ERROR", message: "Failed to save report" }, 500);
    }

    recordId = updated.id;
  } else {
    // ── Insert new staff-initiated report ─────────────────────────────────────
    const { data: inserted, error: insertError } = await adminClient
      .from("cashflow_reports")
      .insert({
        broker_id:        callerId,   // staff member is the "broker" for self-initiated reports
        staff_id:         callerId,
        property_address: resolvedAddress,
        entity_type:      resolvedEntityType,
        inputs_broker:    {},         // empty — no broker submission for staff-initiated reports
        inputs_final:     finalPayload,
        report_data:      reportData,
        schema_version:   1,
        status:           "complete",
        is_public:        true,
        generated_at:     generatedAt,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[insert] error:", insertError);
      return json({ error: "SERVER_ERROR", message: "Failed to create report" }, 500);
    }

    recordId = inserted.id;
  }

  // ── Return success ──────────────────────────────────────────────────────────
  // Client is responsible for triggering broker completion notification (EmailJS)
  // after receiving a successful response.
  return json({ id: recordId });
});
