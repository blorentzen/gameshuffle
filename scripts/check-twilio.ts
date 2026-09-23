/**
 * Twilio preflight: is the SMS setup actually wired the way the code and the
 * toll-free registration assume?
 *
 * Every one of these has burned someone before: credentials in the wrong
 * project, the number never attached to the Messaging Service, webhooks pointing
 * at a preview deployment, or sending opened up while the toll-free number is
 * still pending verification. Run it the moment the env vars land, and again
 * after verification clears.
 *
 *   npx tsx -r dotenv/config scripts/check-twilio.ts
 *   BASE_URL=https://www.gameshuffle.co npx tsx -r dotenv/config scripts/check-twilio.ts
 */

import "dotenv/config";
import twilio from "twilio";

const BASE = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.gameshuffle.co";
const WANT_INBOUND = `${BASE}/api/sms/inbound`;
const WANT_STATUS = `${BASE}/api/sms/status`;
/** Must match src/app/api/sms/inbound/route.ts and the toll-free registration. */
const WANT_HELP = "GameShuffle: event reminders, organizer messages and security alerts. Manage at gameshuffle.co/account or support@gameshuffle.co. Reply STOP to opt out.";

let failures = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const warn = (m: string) => console.log(`  warn  ${m}`);
const bad = (m: string) => { failures++; console.log(`  FAIL  ${m}`); };

async function main() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const msSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const vSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  console.log(`\nTwilio preflight (base URL ${BASE})\n`);
  console.log("credentials");
  for (const [name, v] of [["TWILIO_ACCOUNT_SID", sid], ["TWILIO_AUTH_TOKEN", token], ["TWILIO_MESSAGING_SERVICE_SID", msSid], ["TWILIO_VERIFY_SERVICE_SID", vSid]] as const) {
    v ? ok(`${name} set`) : bad(`${name} missing`);
  }
  if (!sid || !token) { console.log("\nCannot continue without account credentials.\n"); process.exit(1); }

  const client = twilio(sid, token);

  const account = await client.api.v2010.accounts(sid).fetch().catch((e: Error) => { bad(`credentials rejected: ${e.message}`); return null; });
  if (!account) { process.exit(1); }
  ok(`authenticated as "${account.friendlyName}" (${account.status})`);

  // ── Messaging Service ─────────────────────────────────────────────────────
  console.log("\nmessaging service");
  let senders: string[] = [];
  if (msSid) {
    const svc = await client.messaging.v1.services(msSid).fetch().catch((e: Error) => { bad(`cannot fetch messaging service: ${e.message}`); return null; });
    if (svc) {
      ok(`"${svc.friendlyName}"`);
      svc.inboundRequestUrl === WANT_INBOUND ? ok(`inbound webhook → ${WANT_INBOUND}`) : bad(`inbound webhook is "${svc.inboundRequestUrl || "unset"}", expected ${WANT_INBOUND}`);
      svc.statusCallback === WANT_STATUS ? ok(`status callback → ${WANT_STATUS}`) : bad(`status callback is "${svc.statusCallback || "unset"}", expected ${WANT_STATUS}`);
      if (svc.useInboundWebhookOnNumber) warn("useInboundWebhookOnNumber is on: the NUMBER's webhook wins over the service's");

      const nums = await client.messaging.v1.services(msSid).phoneNumbers.list({ limit: 50 }).catch(() => []);
      senders = nums.map((n) => n.phoneNumber);
      senders.length ? ok(`senders: ${senders.join(", ")}`) : bad("no phone numbers attached to the messaging service");
    }
  }

  // ── Toll-free verification ────────────────────────────────────────────────
  console.log("\ntoll-free verification");
  const tfvs = await client.messaging.v1.tollfreeVerifications.list({ limit: 20 }).catch((e: Error) => { warn(`could not list verifications: ${e.message}`); return []; });
  if (tfvs.length === 0) warn("no toll-free verification submissions found on this account");
  for (const v of tfvs) {
    const status = String(v.status ?? "unknown");
    const line = `${v.tollfreePhoneNumberSid ?? "?"} → ${status}`;
    if (status === "TWILIO_APPROVED") ok(`${line} (clear to send)`);
    else if (status.includes("REJECTED")) bad(`${line}${v.rejectionReason ? ` — ${v.rejectionReason}` : ""}`);
    else warn(`${line} (do not send production traffic yet)`);
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  console.log("\nverify service (phone confirmation codes)");
  if (vSid) {
    const v = await client.verify.v2.services(vSid).fetch().catch((e: Error) => { bad(`cannot fetch verify service: ${e.message}`); return null; });
    if (v) {
      ok(`"${v.friendlyName}"`);
      // Attaching the messaging service routes codes over the toll-free number,
      // which is only wanted AFTER verification clears.
      const approved = tfvs.some((t) => String(t.status) === "TWILIO_APPROVED");
      if (!approved) warn("leave the messaging service unattached until verification clears, so codes send from Twilio's pool");
    }
  }

  // ── Our endpoints ─────────────────────────────────────────────────────────
  console.log("\nour endpoints");
  for (const url of [WANT_INBOUND, WANT_STATUS]) {
    const res = await fetch(url, { method: "POST", body: new URLSearchParams({ ping: "1" }) }).catch(() => null);
    if (!res) bad(`${url} unreachable`);
    // 403 is the CORRECT answer: the route rejects an unsigned request.
    else if (res.status === 403) ok(`${url} live and rejecting unsigned requests`);
    else if (res.status === 404) bad(`${url} returns 404 — not deployed to ${BASE} yet`);
    else warn(`${url} returned ${res.status} (expected 403 for an unsigned POST)`);
  }

  console.log("\nhelp message");
  console.log(`  The Advanced Opt-Out HELP text on the messaging service must read exactly:\n    ${WANT_HELP}`);
  console.log("  (not readable over the API — check it in the console)");

  console.log(failures === 0 ? "\nAll automated checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("preflight crashed:", e instanceof Error ? e.message : e); process.exit(1); });
