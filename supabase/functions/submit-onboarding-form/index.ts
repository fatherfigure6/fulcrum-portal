// =============================================================================
// submit-onboarding-form/index.ts
//
// Public — no authentication required. Identity is established by the token.
//
// Responsibilities:
//   1. Server-side validation (authoritative — frontend validation is convenience only):
//      - Reject unknown response keys (not in KNOWN_QUESTION_IDS)
//      - Reject missing required fields
//      - Reject invalid option values for radio/select/checkbox questions
//      - Validation failure returns 400; token is NOT claimed
//   2. Atomic token claim via claim_onboarding_token() stored procedure
//      - Prevents double-submission race condition
//      - Returns TOKEN_INVALID if token is missing, used, revoked, or expired
//   3. Insert onboarding_submissions with question_snapshot
//   4. Update client status to 'submitted'
//   5. Fire Monday.com webhook (non-fatal — client sees success regardless)
//   6. Update monday_sync_status on the submission record
//
// monday_retry_attempted_by / monday_retry_attempted_at are written by
// retry-monday-sync, not this function.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Question config (embedded — must stay in sync with src/config/onboarding-questions.ts)
// These constants are the server-side source of truth for validation.
// When questions are added or removed, update both files and bump QUESTIONNAIRE_VERSION.
// =============================================================================

const QUESTIONNAIRE_VERSION = "2.0";

interface QuestionMeta {
  id: string;
  label: string;
  section: string;
  type: string;
  required: boolean;
  options?: string[];
}

const QUESTIONS: QuestionMeta[] = [
  // ── Ownership Structure ────────────────────────────────────────────────────
  {
    id: "ownership_arrangement",
    label: "How would you like property ownership arranged?",
    section: "Ownership Structure",
    type: "radio",
    required: true,
    options: ["Joint Tenants", "Tenants In Common"],
  },
  // ── Finance ───────────────────────────────────────────────────────────────
  {
    id: "lender_name",
    label: "Name of financial lender",
    section: "Finance",
    type: "text",
    required: true,
  },
  {
    id: "lvr",
    label: "Loan to value ratio (LVR)",
    section: "Finance",
    type: "text",
    required: true,
  },
  {
    id: "mortgage_broker",
    label: "Mortgage broker's name and company",
    section: "Finance",
    type: "text",
    required: true,
  },
  {
    id: "deposit_amount",
    label: "Please confirm your deposit amount",
    section: "Finance",
    type: "radio",
    required: true,
    options: [
      "$10,000 (purchase under $800,000)",
      "$20,000 (purchase above $800,000)",
    ],
  },
  // ── Professional Services ──────────────────────────────────────────────────
  {
    id: "conveyancer_details",
    label: "Conveyancer details",
    section: "Professional Services",
    type: "textarea",
    required: false,
  },
  {
    id: "accountant_details",
    label: "Accountant's details (if applicable)",
    section: "Professional Services",
    type: "textarea",
    required: false,
  },
];

const KNOWN_QUESTION_IDS = new Set(QUESTIONS.map(q => q.id));
const REQUIRED_IDS = new Set(QUESTIONS.filter(q => q.required).map(q => q.id));
const OPTIONS_MAP = new Map(
  QUESTIONS.filter(q => q.options).map(q => [q.id, q.options!])
);

// Build the question_snapshot stored with each submission
// Purchaser Details is prepended as a structured entry — rendered specially in ClientDetail
const QUESTION_SNAPSHOT = [
  { id: 'purchaser_details', label: 'Purchaser Details', section: 'Purchaser Details', type: 'structured_v1' },
  ...QUESTIONS.map(q => ({
    id:      q.id,
    label:   q.label,
    section: q.section,
    type:    q.type,
    ...(q.options ? { options: q.options } : {}),
  })),
];

// ── Purchaser details validation helpers ──────────────────────────────────────

const VALID_ENTITY_TYPES = new Set(['individual', 'joint_tenants', 'tenants_in_common', 'smsf']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0[2-9]\d{8}$/;

function normPhone(v: unknown): string {
  let s = (String(v ?? '')).replace(/\s+/g, '');
  if (s.startsWith('+61')) s = '0' + s.slice(3);
  else if (s.startsWith('61') && s.length === 11) s = '0' + s.slice(2);
  return s;
}

function validateClientPD(c: Record<string, unknown>, includeOwnershipPct = false): string[] {
  const errs: string[] = [];
  if (!String(c.firstName ?? '').trim())  errs.push('firstName required');
  if (!String(c.lastName  ?? '').trim())  errs.push('lastName required');
  if (!String(c.address   ?? '').trim())  errs.push('address required');
  const email = String(c.email ?? '').trim();
  if (!email)                             errs.push('email required');
  else if (!EMAIL_RE.test(email))         errs.push('email invalid');
  if (!PHONE_RE.test(normPhone(c.phone))) errs.push('phone invalid');
  if (includeOwnershipPct) {
    const n = Number(c.ownershipPct);
    if (!Number.isFinite(n) || n < 0 || n > 100) errs.push('ownershipPct invalid');
  }
  return errs;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_REQUEST", message: "Request body must be valid JSON" }, 400);
  }

  const rawToken = body.token as string | undefined;
  const responses = body.responses as Record<string, unknown> | undefined;
  const purchaserDetails = body.purchaser_details as Record<string, unknown> | undefined;

  if (!rawToken?.trim()) {
    return json({ error: "INVALID_REQUEST", message: "token is required" }, 400);
  }
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
    return json({ error: "INVALID_REQUEST", message: "responses must be an object" }, 400);
  }

  // ── Server-side validation (trust boundary) ─────────────────────────────────
  // Performed BEFORE token claim so a validation failure does not consume the token.
  const validationErrors: string[] = [];

  // ── Validate purchaser_details ──────────────────────────────────────────────
  if (!purchaserDetails || !VALID_ENTITY_TYPES.has(purchaserDetails.entityType as string)) {
    return json({ error: "VALIDATION_ERROR", message: "purchaser_details missing or invalid entityType" }, 400);
  }

  const et = purchaserDetails.entityType as string;

  if (et === 'individual') {
    const c = (purchaserDetails.individual ?? {}) as Record<string, unknown>;
    const errs = validateClientPD(c);
    for (const e of errs) validationErrors.push(`individual.${e}`);

  } else if (et === 'joint_tenants' || et === 'tenants_in_common') {
    const clients = purchaserDetails.clients;
    if (!Array.isArray(clients) || clients.length !== 2) {
      return json({ error: "VALIDATION_ERROR", message: `purchaser_details.clients must be an array of 2 for ${et}` }, 400);
    }
    const includePct = et === 'tenants_in_common';
    for (let i = 0; i < 2; i++) {
      const errs = validateClientPD(clients[i] as Record<string, unknown>, includePct);
      for (const e of errs) validationErrors.push(`clients[${i}].${e}`);
    }
    if (includePct) {
      const sum = Number(
        (Number((clients[0] as Record<string, unknown>).ownershipPct ?? 0) +
         Number((clients[1] as Record<string, unknown>).ownershipPct ?? 0)).toFixed(2)
      );
      if (sum !== 100) {
        validationErrors.push(`tenants_in_common ownershipPct must sum to 100 (got ${sum})`);
      }
    }

  } else if (et === 'smsf') {
    const smsf = (purchaserDetails.smsf ?? {}) as Record<string, unknown>;
    if (!String(smsf.entityName ?? '').trim()) {
      validationErrors.push('smsf.entityName required');
    }
  }

  // a) Reject unknown keys
  for (const key of Object.keys(responses)) {
    if (!KNOWN_QUESTION_IDS.has(key)) {
      validationErrors.push(`Unknown question id: ${key}`);
    }
  }

  // b) Required fields must be non-empty
  for (const id of REQUIRED_IDS) {
    if (isEmpty(responses[id])) {
      validationErrors.push(`Required field missing or empty: ${id}`);
    }
  }

  // c) Option-constrained fields must match allowed values
  for (const [id, allowedOptions] of OPTIONS_MAP) {
    const val = responses[id];
    if (!isEmpty(val) && !allowedOptions.includes(val as string)) {
      validationErrors.push(`Invalid value for ${id}: "${val}"`);
    }
  }

  if (validationErrors.length > 0) {
    return json({ error: "VALIDATION_ERROR", details: validationErrors }, 400);
  }

  // ── Hash token ──────────────────────────────────────────────────────────────
  const tokenHash = await sha256Hex(rawToken.trim());

  // ── Admin client ────────────────────────────────────────────────────────────
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Atomic token claim ──────────────────────────────────────────────────────
  // claim_onboarding_token() atomically marks the token as used.
  // If the token is missing, used, revoked, or expired — raises TOKEN_INVALID.
  // The UNIQUE(token_id) constraint on onboarding_submissions provides a
  // second backstop against any race that slips through.
  let claimedTokenId: string;
  let claimedClientId: string;

  try {
    const { data: claimed, error: rpcError } = await adminClient
      .rpc("claim_onboarding_token", { p_token_hash: tokenHash });

    if (rpcError) {
      if (rpcError.message?.includes("TOKEN_INVALID")) {
        return json({ error: "INVALID_OR_EXPIRED" }, 410);
      }
      throw rpcError;
    }

    if (!claimed || claimed.length === 0) {
      return json({ error: "INVALID_OR_EXPIRED" }, 410);
    }

    claimedTokenId  = claimed[0].token_id;
    claimedClientId = claimed[0].client_id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("TOKEN_INVALID")) {
      return json({ error: "INVALID_OR_EXPIRED" }, 410);
    }
    console.error("[submit-onboarding-form] claim_onboarding_token error:", err);
    return json({ error: "SERVER_ERROR", message: "Failed to process token" }, 500);
  }

  // ── Safe merge: strip any purchaser_details key smuggled inside responses ──────
  // purchaser_details is stored as a top-level key, not inside responses.
  // This prevents key collision if a malicious client sends it in both places.
  const { purchaser_details: _ignored, ...safeResponses } = responses as Record<string, unknown>;
  const allResponses = { purchaser_details: purchaserDetails, ...safeResponses };

  // ── Insert submission ───────────────────────────────────────────────────────
  const { data: submission, error: insertError } = await adminClient
    .from("onboarding_submissions")
    .insert({
      client_id:             claimedClientId,
      token_id:              claimedTokenId,
      questionnaire_version: QUESTIONNAIRE_VERSION,
      responses:             allResponses,
      question_snapshot:     QUESTION_SNAPSHOT,
      monday_sync_status:    "pending",
    })
    .select("id")
    .single();

  if (insertError || !submission) {
    // UNIQUE violation on token_id means a concurrent submission already succeeded
    if (insertError?.code === "23505") {
      return json({ error: "ALREADY_SUBMITTED" }, 409);
    }
    console.error("[submit-onboarding-form] submission insert error:", insertError);
    return json({ error: "SERVER_ERROR", message: "Failed to save submission" }, 500);
  }

  const submissionId = submission.id;

  // ── Update client status → submitted ────────────────────────────────────────
  // status_updated_by is NULL for automated system transitions.
  // Only staff-initiated changes (e.g. Mark as Active) set a user UUID.
  await adminClient
    .from("clients")
    .update({
      status:            "submitted",
      status_updated_at: new Date().toISOString(),
      status_updated_by: null,
    })
    .eq("id", claimedClientId);

  // ── Fetch client details for Monday payload ─────────────────────────────────
  const { data: clientRow } = await adminClient
    .from("clients")
    .select("first_name, last_name, email, phone")
    .eq("id", claimedClientId)
    .single();

  // ── Fire Monday.com webhook (non-fatal) ─────────────────────────────────────
  // Failure here must not affect the client-facing success response.
  // The client sees success as long as the submission record was created.
  const mondayUrl = Deno.env.get("MONDAY_WEBHOOK_URL");

  if (mondayUrl) {
    const payload = {
      submission_id:         submissionId,
      client_id:             claimedClientId,
      first_name:            clientRow?.first_name ?? "",
      last_name:             clientRow?.last_name  ?? "",
      email:                 clientRow?.email      ?? "",
      phone:                 clientRow?.phone      ?? "",
      submitted_at:          new Date().toISOString(),
      questionnaire_version: QUESTIONNAIRE_VERSION,
      purchaser_details:     purchaserDetails,
      responses:             safeResponses,
    };

    try {
      const resp = await fetch(mondayUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(8000),
      });

      await adminClient
        .from("onboarding_submissions")
        .update({
          monday_sync_status:          resp.ok ? "synced" : "failed",
          monday_webhook_attempted_at: new Date().toISOString(),
          monday_webhook_response_code: resp.status,
        })
        .eq("id", submissionId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[submit-onboarding-form] Monday webhook error:", errMsg);
      await adminClient
        .from("onboarding_submissions")
        .update({
          monday_sync_status:          "failed",
          monday_webhook_attempted_at: new Date().toISOString(),
          monday_webhook_error:        errMsg,
        })
        .eq("id", submissionId);
    }
  } else {
    // MONDAY_WEBHOOK_URL not configured — mark as failed so staff can see
    console.warn("[submit-onboarding-form] MONDAY_WEBHOOK_URL not set");
    await adminClient
      .from("onboarding_submissions")
      .update({
        monday_sync_status:          "failed",
        monday_webhook_attempted_at: new Date().toISOString(),
        monday_webhook_error:        "MONDAY_WEBHOOK_URL environment variable not set",
      })
      .eq("id", submissionId);
  }

  return json({ success: true });
});
