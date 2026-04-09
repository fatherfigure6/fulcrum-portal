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

export const QUESTIONNAIRE_VERSION = "2.1";

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
  "Purchaser Details",
  ...new Set(ONBOARDING_QUESTIONS.map(q => q.section)),
];

export const QUESTIONS_BY_SECTION: Record<string, OnboardingQuestion[]> =
  ONBOARDING_SECTIONS.reduce<Record<string, OnboardingQuestion[]>>((acc, section) => {
    acc[section] = ONBOARDING_QUESTIONS.filter(q => q.section === section);
    return acc;
  }, {});
