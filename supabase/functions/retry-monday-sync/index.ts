// =============================================================================
// retry-monday-sync/index.ts
//
// Staff-only. Re-fires the Monday.com webhook for a specific submission.
//
// This function:
//   - Retries ONLY the Monday webhook step
//   - Does NOT create a new onboarding_submissions record
//   - Does NOT touch the token (used_at remains set)
//   - Records retry actor (monday_retry_attempted_by) and timestamp
//
// Monday automations should deduplicate by submission_id where possible,
// as retries send the same payload again.
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
    return json({ error: "INSUFFICIENT_ROLE", message: "Only staff may retry Monday sync" }, 403);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_REQUEST", message: "Request body must be valid JSON" }, 400);
  }

  const submissionId = body.submission_id as string | undefined;
  if (!submissionId?.trim()) {
    return json({ error: "VALIDATION_ERROR", message: "submission_id is required" }, 400);
  }

  // ── Fetch submission + client ───────────────────────────────────────────────
  const { data: submission, error: fetchError } = await adminClient
    .from("onboarding_submissions")
    .select(`
      id,
      responses,
      questionnaire_version,
      clients(first_name, last_name, email, phone)
    `)
    .eq("id", submissionId)
    .single();

  if (fetchError || !submission) {
    return json({ error: "NOT_FOUND", message: "Submission not found" }, 404);
  }

  const client = submission.clients as unknown as {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  } | null;

  // ── Fire Monday webhook ─────────────────────────────────────────────────────
  const mondayUrl = Deno.env.get("MONDAY_WEBHOOK_URL");
  const now = new Date().toISOString();

  if (!mondayUrl) {
    await adminClient
      .from("onboarding_submissions")
      .update({
        monday_sync_status:          "failed",
        monday_webhook_attempted_at: now,
        monday_webhook_error:        "MONDAY_WEBHOOK_URL environment variable not set",
        monday_retry_attempted_by:   callerId,
        monday_retry_attempted_at:   now,
      })
      .eq("id", submissionId);

    return json({ success: false, sync_status: "failed", error: "MONDAY_WEBHOOK_URL not configured" });
  }

  const payload = {
    submission_id:         submissionId,
    client_id:             (submission as unknown as Record<string, unknown>).client_id,
    first_name:            client?.first_name            ?? "",
    last_name:             client?.last_name             ?? "",
    email:                 client?.email                 ?? "",
    phone:                 client?.phone                 ?? "",
    submitted_at:          now,
    questionnaire_version: submission.questionnaire_version,
    responses:             submission.responses,
  };

  try {
    const resp = await fetch(mondayUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(8000),
    });

    const syncStatus = resp.ok ? "synced" : "failed";

    await adminClient
      .from("onboarding_submissions")
      .update({
        monday_sync_status:           syncStatus,
        monday_webhook_attempted_at:  now,
        monday_webhook_response_code: resp.status,
        monday_webhook_error:         resp.ok ? null : `HTTP ${resp.status}`,
        monday_retry_attempted_by:    callerId,
        monday_retry_attempted_at:    now,
      })
      .eq("id", submissionId);

    return json({ success: resp.ok, sync_status: syncStatus, response_code: resp.status });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[retry-monday-sync] webhook error:", errMsg);

    await adminClient
      .from("onboarding_submissions")
      .update({
        monday_sync_status:          "failed",
        monday_webhook_attempted_at: now,
        monday_webhook_error:        errMsg,
        monday_retry_attempted_by:   callerId,
        monday_retry_attempted_at:   now,
      })
      .eq("id", submissionId);

    return json({ success: false, sync_status: "failed", error: errMsg });
  }
});
