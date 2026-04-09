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

const QUESTIONNAIRE_VERSION = "1.0";

interface QuestionMeta {
  id: string;
  label: string;
  section: string;
  type: string;
  required: boolean;
  options?: string[];
}

const QUESTIONS: QuestionMeta[] = [
  // ── Purchaser Details ──────────────────────────────────────────────────────
  {
    id: "purchaser_names",
    label: "Full name/s to appear on the Contract of Sale for all purchasers (including middle names)",
    section: "Purchaser Details",
    type: "textarea",
    required: true,
  },
  {
    id: "entity_name",
    label: "SMSF / Trust / Company name to appear on the contract (if applicable)",
    section: "Purchaser Details",
    type: "text",
    required: false,
  },
  {
    id: "residential_address",
    label: "Current residential address",
    section: "Purchaser Details",
    type: "textarea",
    required: true,
  },
  {
    id: "purchaser_emails",
    label: "Email address/es for all purchasers",
    section: "Purchaser Details",
    type: "textarea",
    required: true,
  },
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
const QUESTION_SNAPSHOT = QUESTIONS.map(q => ({
  id:      q.id,
  label:   q.label,
  section: q.section,
  type:    q.type,
  ...(q.options ? { options: q.options } : {}),
}));

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

  if (!rawToken?.trim()) {
    return json({ error: "INVALID_REQUEST", message: "token is required" }, 400);
  }
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
    return json({ error: "INVALID_REQUEST", message: "responses must be an object" }, 400);
  }

  // ── Server-side validation (trust boundary) ─────────────────────────────────
  // Performed BEFORE token claim so a validation failure does not consume the token.
  const validationErrors: string[] = [];

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

  // ── Insert submission ───────────────────────────────────────────────────────
  const { data: submission, error: insertError } = await adminClient
    .from("onboarding_submissions")
    .insert({
      client_id:             claimedClientId,
      token_id:              claimedTokenId,
      questionnaire_version: QUESTIONNAIRE_VERSION,
      responses,
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
      responses,
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
