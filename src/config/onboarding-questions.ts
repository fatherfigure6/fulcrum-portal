// =============================================================================
// onboarding-questions.ts
// Client Onboarding Questionnaire — question configuration
//
// RULES:
//   - Never rename an `id` in production. IDs are stable keys stored in
//     onboarding_submissions.responses and question_snapshot. Renaming breaks
//     historical rendering.
//   - Bump QUESTIONNAIRE_VERSION whenever questions are added, removed, or
//     reworded. Question changes require a redeploy but no schema changes.
//   - Do not hardcode question labels anywhere else in the codebase.
//     Always import from this file.
//   - The server-side validation constants in submit-onboarding-form/index.ts
//     must be kept in sync with this file manually when questions change.
// =============================================================================

export const QUESTIONNAIRE_VERSION = "1.0";

export interface OnboardingQuestion {
  id: string;         // Stable snake_case key — NEVER rename in production
  label: string;
  type: "text" | "email" | "textarea" | "select" | "radio" | "checkbox" | "date" | "number";
  required: boolean;
  options?: string[]; // For radio / select / checkbox types
  helpText?: string;
  section: string;    // Wizard step grouping label
  placeholder?: string;
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [

  // ── Purchaser Details ──────────────────────────────────────────────────────
  {
    id:          "purchaser_names",
    label:       "Full name/s to appear on the Contract of Sale for all purchasers (including middle names)",
    type:        "textarea",
    required:    true,
    section:     "Purchaser Details",
    helpText:    "Please ensure spelling is correct — incorrect names on contracts can result in penalties in WA.",
    placeholder: "e.g. John Michael Smith\nJane Elizabeth Smith",
  },
  {
    id:          "entity_name",
    label:       "SMSF / Trust / Company name to appear on the contract (if applicable)",
    type:        "text",
    required:    false,
    section:     "Purchaser Details",
    helpText:    "Please ensure spelling is correct — incorrect names on contracts can result in penalties in WA.",
    placeholder: "Leave blank if not applicable",
  },
  {
    id:          "residential_address",
    label:       "Current residential address",
    type:        "textarea",
    required:    true,
    section:     "Purchaser Details",
    placeholder: "Street address, suburb, state, postcode",
  },
  {
    id:          "purchaser_emails",
    label:       "Email address/es for all purchasers",
    type:        "textarea",
    required:    true,
    section:     "Purchaser Details",
    placeholder: "e.g. john@email.com\njane@email.com",
  },

  // ── Ownership Structure ────────────────────────────────────────────────────
  {
    id:       "ownership_arrangement",
    label:    "How would you like property ownership arranged?",
    type:     "radio",
    required: true,
    section:  "Ownership Structure",
    options:  ["Joint Tenants", "Tenants In Common"],
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    id:          "lender_name",
    label:       "Name of financial lender",
    type:        "text",
    required:    true,
    section:     "Finance",
    placeholder: "e.g. Commonwealth Bank, ANZ",
  },
  {
    id:          "lvr",
    label:       "Loan to value ratio (LVR)",
    type:        "text",
    required:    true,
    section:     "Finance",
    placeholder: "e.g. 80%",
  },
  {
    id:          "mortgage_broker",
    label:       "Mortgage broker's name and company",
    type:        "text",
    required:    true,
    section:     "Finance",
    placeholder: "e.g. Jane Smith — Smith Finance Group",
  },
  {
    id:       "deposit_amount",
    label:    "Please confirm your deposit amount",
    type:     "radio",
    required: true,
    section:  "Finance",
    helpText: "This deposit is payable within 3 days of the property going under offer.",
    options:  [
      "$10,000 (purchase under $800,000)",
      "$20,000 (purchase above $800,000)",
    ],
  },

  // ── Professional Services ──────────────────────────────────────────────────
  {
    id:          "conveyancer_details",
    label:       "Conveyancer details",
    type:        "textarea",
    required:    false,
    section:     "Professional Services",
    helpText:    "If you don't have a preferred conveyancer, leave this blank and we can provide some recommendations.",
    placeholder: "Name, company, phone, email",
  },
  {
    id:          "accountant_details",
    label:       "Accountant's details (if applicable)",
    type:        "textarea",
    required:    false,
    section:     "Professional Services",
    placeholder: "Name, company, phone, email",
  },
];

// Derived helpers — import these rather than computing them inline
export const KNOWN_QUESTION_IDS: ReadonlySet<string> =
  new Set(ONBOARDING_QUESTIONS.map(q => q.id));

export const ONBOARDING_SECTIONS: string[] = [
  ...new Set(ONBOARDING_QUESTIONS.map(q => q.section)),
];

export const QUESTIONS_BY_SECTION: Record<string, OnboardingQuestion[]> =
  ONBOARDING_SECTIONS.reduce<Record<string, OnboardingQuestion[]>>((acc, section) => {
    acc[section] = ONBOARDING_QUESTIONS.filter(q => q.section === section);
    return acc;
  }, {});
