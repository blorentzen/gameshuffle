/**
 * Why people leave: the shared reason list, the Before you go body check, Stripe's cancellation details
 * and how they merge with our answer, and the staff tally. Pure, no database or Stripe.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-leave-reasons.ts
 */

import type Stripe from "stripe";
import {
  LEAVE_COMMENT_MAX,
  LEAVE_REASONS,
  LEAVE_REASON_OPTIONS,
  STRIPE_FEEDBACK_REASON,
  cancellationKey,
  cleanLeaveComment,
  cleanLeaveReason,
  leaveReasonLabel,
  parseLeaveFeedback,
  reasonFromStripe,
} from "../src/lib/account/leaveReasons";
import { cancellationOf } from "../src/lib/stripe/payload";
import { cancellationsMissing, stripeCancellationRow, summarizeCancellations, type CancellationRow } from "../src/lib/billing/cancellations";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed += 1;
  else { failed += 1; console.error(`FAIL ${name}`, detail ?? ""); }
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

// ── The list ───────────────────────────────────────────────────────────────
eq("keys kept", LEAVE_REASONS.map((r) => r.value), ["not_using", "missing_features", "too_expensive", "found_alternative", "just_testing", "other"]);
eq("labels", LEAVE_REASONS.map((r) => r.label), ["Not using it enough", "Missing something I need", "Too expensive", "Found something else", "Just trying it out", "Something else"]);
eq("select starts with prefer not to say", LEAVE_REASON_OPTIONS[0], { value: "none", label: "Prefer not to say" });
check("no dashes in labels", LEAVE_REASON_OPTIONS.every((o) => !/[–—]/.test(o.label)));

eq("clean reason key", cleanLeaveReason("too_expensive"), "too_expensive");
eq("clean reason none", cleanLeaveReason("none"), null);
eq("clean reason junk", cleanLeaveReason("drop table"), null);
eq("clean reason number", cleanLeaveReason(4), null);
eq("clean comment trims", cleanLeaveComment("  hi there \n"), "hi there");
eq("clean comment empty", cleanLeaveComment("   "), null);
eq("clean comment not text", cleanLeaveComment({ a: 1 }), null);
eq("clean comment caps", cleanLeaveComment("x".repeat(1500))?.length, LEAVE_COMMENT_MAX);

// ── Stripe's words ─────────────────────────────────────────────────────────
for (const f of ["too_expensive", "switched_service", "unused", "missing_features", "other", "customer_service", "low_quality", "too_complex"] as const) {
  check(`stripe ${f} maps`, !!STRIPE_FEEDBACK_REASON[f]);
}
eq("switched_service", reasonFromStripe("switched_service"), "found_alternative");
eq("unused", reasonFromStripe("unused"), "not_using");
eq("too_complex folds", reasonFromStripe("too_complex"), "other");
eq("unknown future word folds", reasonFromStripe("brand_new_word"), "other");
eq("no feedback", reasonFromStripe(null), null);
eq("label ours", leaveReasonLabel("just_testing"), "Just trying it out");
eq("label ours beats stripe", leaveReasonLabel("too_expensive", "unused"), "Too expensive");
eq("label stripe mapped", leaveReasonLabel(null, "switched_service"), "Found something else");
eq("label stripe word kept", leaveReasonLabel(null, "customer_service"), "Something else (customer service, from Stripe)");
eq("label none", leaveReasonLabel(null, null), "Not specified");
eq("label old free text", leaveReasonLabel("moving away"), "moving away");
eq("key ours", cancellationKey("not_using", "too_complex"), "not_using");
eq("key stripe", cancellationKey(null, "unused"), "not_using");
eq("key stripe other word", cancellationKey(null, "low_quality"), "other:low_quality");
eq("key stripe plain other", cancellationKey(null, "other"), "other");
eq("key nothing", cancellationKey(null, null), "unspecified");

// ── The Before you go body ─────────────────────────────────────────────────
eq("body ok", parseLeaveFeedback({ product: "pro", reason: "too_expensive", comment: " pricey " }), { ok: true, value: { product: "pro", reason: "too_expensive", comment: "pricey", subscriptionId: null } });
eq("body none reason", parseLeaveFeedback({ product: "support", reason: "none" }), { ok: true, value: { product: "support", reason: null, comment: null, subscriptionId: null } });
eq("body bad product", parseLeaveFeedback({ product: "gold" }), { ok: false, error: "bad_product" });
eq("body no body", parseLeaveFeedback(null), { ok: false, error: "bad_product" });
eq("body bad reason", parseLeaveFeedback({ product: "pro", reason: "hate it" }), { ok: false, error: "bad_reason" });
eq("body bad comment", parseLeaveFeedback({ product: "circuit", comment: 12 }), { ok: false, error: "bad_comment" });
eq("body bad sub", parseLeaveFeedback({ product: "pro", subscriptionId: "cus_123" }), { ok: false, error: "bad_subscription" });
eq("body sub", parseLeaveFeedback({ product: "pro", subscriptionId: "sub_1AbCdEfGh" }).ok, true);
eq("body long comment capped", (parseLeaveFeedback({ product: "pro", comment: "y".repeat(5000) }) as { value: { comment: string } }).value.comment.length, LEAVE_COMMENT_MAX);

// ── cancellationOf (dahlia payloads) ───────────────────────────────────────
const NOW = 1_800_000_000;
function sub(over: Record<string, unknown>): Stripe.Subscription {
  return {
    id: "sub_test", object: "subscription", status: "active", cancel_at: null, cancel_at_period_end: false, canceled_at: null, ended_at: null,
    cancellation_details: { comment: null, feedback: null, reason: null },
    items: { object: "list", data: [{ current_period_end: NOW + 86_400 * 20 }] },
    metadata: {},
    ...over,
  } as unknown as Stripe.Subscription;
}
eq("live not ending", cancellationOf(sub({})).ending, false);
const atEnd = cancellationOf(sub({ cancel_at_period_end: true, cancellation_details: { comment: "  meh ", feedback: "too_expensive", reason: "cancellation_requested" } }));
eq("period end cancel", atEnd, { ending: true, cancelAt: NOW + 86_400 * 20, feedback: "too_expensive", comment: "meh", reason: "cancellation_requested" });
eq("cancel_at wins", cancellationOf(sub({ cancel_at: NOW + 5, cancel_at_period_end: true })).cancelAt, NOW + 5);
eq("deleted uses ended_at", cancellationOf(sub({ status: "canceled", ended_at: NOW - 10, canceled_at: NOW - 20 })).cancelAt, NOW - 10);
eq("no details object", cancellationOf(sub({ cancellation_details: undefined, cancel_at_period_end: true })).feedback, null);

// ── Merging Stripe into ours ──────────────────────────────────────────────
const incoming = { subscriptionId: "sub_x", product: "pro" as const, userId: "u1", feedback: "unused", comment: "stripe says", cancelAt: NOW };
const at = new Date(NOW * 1000).toISOString();
eq("nothing to save", stripeCancellationRow(null, { ...incoming, feedback: null, comment: null }), null);
eq("stripe only row", stripeCancellationRow(null, incoming), { user_id: "u1", subscription_id: "sub_x", product: "pro", reason: null, stripe_feedback: "unused", comment: "stripe says", source: "stripe", cancel_at: at });
const ours = { user_id: "u1", product: "pro" as const, reason: "too_expensive", stripe_feedback: null, comment: "ours first", source: "ours" as const, cancel_at: null };
eq("merge keeps ours", stripeCancellationRow(ours, incoming), { user_id: "u1", subscription_id: "sub_x", product: "pro", reason: "too_expensive", stripe_feedback: "unused", comment: "ours first", source: "ours", cancel_at: at });
eq("stripe comment fills an empty one", stripeCancellationRow({ ...ours, comment: null }, incoming)?.comment, "stripe says");
eq("ours row, stripe silent: still confirmed", stripeCancellationRow(ours, { ...incoming, feedback: null, comment: null })?.cancel_at, at);
eq("earlier stripe feedback kept", stripeCancellationRow({ ...ours, stripe_feedback: "too_complex" }, { ...incoming, feedback: null })?.stripe_feedback, "too_complex");
eq("stripe comment capped", stripeCancellationRow(null, { ...incoming, comment: "z".repeat(3000) })?.comment?.length, LEAVE_COMMENT_MAX);

// ── Missing table ─────────────────────────────────────────────────────────
check("missing 42P01", cancellationsMissing({ code: "42P01" }));
check("missing PGRST205", cancellationsMissing({ code: "PGRST205", message: "Could not find the table 'public.subscription_cancellations' in the schema cache" }));
check("not missing on other errors", !cancellationsMissing({ code: "23505", message: "duplicate key" }));
check("not missing on null", !cancellationsMissing(null));

// ── Staff tally ───────────────────────────────────────────────────────────
const row = (over: Partial<CancellationRow>): CancellationRow => ({ user_id: null, subscription_id: Math.random().toString(36), product: "pro", reason: null, stripe_feedback: null, comment: null, source: "ours", cancel_at: at, created_at: at, ...over });
const summary = summarizeCancellations([
  row({ reason: "too_expensive", product: "pro" }),
  row({ reason: "too_expensive", product: "support" }),
  row({ stripe_feedback: "unused", source: "stripe", product: "circuit" }),
  row({ reason: "not_using", product: "pro", comment: "never streamed", created_at: new Date((NOW + 10) * 1000).toISOString() }),
  row({ stripe_feedback: "low_quality", source: "stripe", comment: "buggy" }),
  row({ reason: "too_expensive", cancel_at: null, comment: "changed my mind" }),
  row({}),
], (NOW - 100) * 1000);
eq("cancelled count", summary.cancelled, 6);
eq("stayed count", summary.stayed, 1);
eq("tally order", summary.tally.map((t) => [t.key, t.pro, t.circuit, t.support, t.total]), [
  ["not_using", 1, 1, 0, 2],
  ["too_expensive", 1, 0, 1, 2],
  ["other:low_quality", 1, 0, 0, 1],
  ["unspecified", 1, 0, 0, 1],
]);
eq("tally label keeps stripe word", summary.tally.find((t) => t.key === "other:low_quality")?.label, "Something else (quality, from Stripe)");
eq("latest newest first", summary.latest.map((c) => c.comment), ["never streamed", "buggy", "changed my mind"]);
eq("latest status", summary.latest.map((c) => c.status), ["ending", "ending", "stayed"]);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
