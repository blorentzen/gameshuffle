/**
 * Send the policy-update notice email blast.
 *
 * Usage:
 *   npx tsx scripts/send-policy-update-blast.ts <doc> <effective-date> <summary>
 *
 * Examples:
 *   # Dry run (no emails sent — just counts recipients)
 *   DRY_RUN=1 npx tsx scripts/send-policy-update-blast.ts privacy 2026-06-01 "Updated to add details about new analytics processor."
 *
 *   # Real send
 *   npx tsx scripts/send-policy-update-blast.ts terms 2026-06-15 "Clarified subscription cancellation language and added DMCA agent contact."
 *
 * Effective date must be at least 30 days in the future per the policy
 * commitment. Use it in tandem with the env-var-driven <PolicyUpdateBanner>
 * (set NEXT_PUBLIC_POLICY_UPDATE_URL + NEXT_PUBLIC_POLICY_UPDATE_EFFECTIVE
 * in Vercel) so users see the in-product banner during the same window.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { sendPolicyUpdateBlast, type PolicyDocSlug } from "../src/lib/email/policy-update";

const VALID_DOCS: PolicyDocSlug[] = ["privacy", "terms", "cookie-policy"];

const [, , docArg, dateArg, ...summaryParts] = process.argv;
const summary = summaryParts.join(" ");

if (!docArg || !dateArg || !summary) {
  console.error("Usage: tsx scripts/send-policy-update-blast.ts <doc> <effective-date YYYY-MM-DD> <summary>");
  console.error(`  doc must be one of: ${VALID_DOCS.join(", ")}`);
  process.exit(1);
}

if (!VALID_DOCS.includes(docArg as PolicyDocSlug)) {
  console.error(`Invalid doc "${docArg}". Must be one of: ${VALID_DOCS.join(", ")}`);
  process.exit(1);
}

const effectiveDate = new Date(dateArg);
if (Number.isNaN(effectiveDate.getTime())) {
  console.error(`Invalid date "${dateArg}". Use YYYY-MM-DD.`);
  process.exit(1);
}

const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

(async () => {
  console.log(`Doc: ${docArg}`);
  console.log(`Effective: ${effectiveDate.toDateString()}`);
  console.log(`Summary: ${summary}`);
  console.log(`Dry run: ${dryRun}`);
  console.log("---");

  try {
    const result = await sendPolicyUpdateBlast({
      doc: docArg as PolicyDocSlug,
      effectiveDate,
      summary,
      dryRun,
    });
    console.log("---");
    console.log(`Recipients: ${result.totalRecipients}`);
    console.log(`Sent: ${result.sent}`);
    console.log(`Failed: ${result.failed}`);
    if (result.failedEmails.length > 0) {
      console.log("Failed emails:");
      for (const e of result.failedEmails) console.log(`  - ${e}`);
    }
  } catch (err) {
    console.error("Blast failed:", err);
    process.exit(1);
  }
})();
