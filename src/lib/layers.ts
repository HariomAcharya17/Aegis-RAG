// Plain-language names for each safety layer, so the trace makes sense to
// someone who has never heard of RLS or prompt injection.
export const LAYER_INFO: Record<string, { plain: string; what: string }> = {
  "Prompt Guard": {
    plain: "Trick detector",
    what: "A small model scores whether the message is trying to override the assistant's instructions.",
  },
  "Safety policy": {
    plain: "Safety check",
    what: "A safety model checks the message against a written policy (violence, self-harm, crime, harassment).",
  },
  "Input guards": {
    plain: "Message checks",
    what: "Turned off in the prompt-only design.",
  },
  "Row Level Security": {
    plain: "Database permission filter",
    what: "The database only returns documents your role is cleared for. Everything else never reaches the AI.",
  },
  "Access check": {
    plain: "Access check",
    what: "The answer only exists in departments you can't read, so the AI wasn't asked at all.",
  },
  "Scope check": {
    plain: "Topic check",
    what: "Questions that have nothing to do with the company are politely declined.",
  },
  "Canary scan": {
    plain: "Secret tripwire",
    what: "The answer is scanned for hidden marker values planted in restricted documents.",
  },
  "PII redaction": {
    plain: "Personal data mask",
    what: "Emails and phone numbers are masked for roles that shouldn't see them.",
  },
};

export const OUTCOME_LABEL: Record<string, string> = {
  pass: "passed",
  block: "stopped it",
  flag: "flagged",
  skip: "skipped",
};
