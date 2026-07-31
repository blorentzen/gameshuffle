/** Report reason taxonomy — shared by the report UI and server validation.
 *  Client-safe (no server deps). */

export const REPORT_REASONS = [
  { id: "hate_harassment", label: "Hate or harassment" },
  { id: "sexual", label: "Sexual or explicit content" },
  { id: "violence_threats", label: "Violence or threats" },
  { id: "spam", label: "Spam or scam" },
  { id: "impersonation", label: "Impersonation" },
  { id: "self_harm", label: "Self-harm" },
  { id: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export const reportReasonIds: string[] = REPORT_REASONS.map((r) => r.id);

export function reportReasonLabel(id: string): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
}

/** Reasons that route to `elevated` severity — queue-first + out-of-band alert
 *  (Spec 4 §6.2). Kept on the existing reason ids (no rename migration). */
export const ELEVATED_REASONS: readonly string[] = ["sexual", "self_harm"];

export type ReportSeverity = "standard" | "elevated";

/** Severity is derived from reason at write time — never user-selected (§6.2). */
export function reportSeverity(reason: string): ReportSeverity {
  return ELEVATED_REASONS.includes(reason) ? "elevated" : "standard";
}
