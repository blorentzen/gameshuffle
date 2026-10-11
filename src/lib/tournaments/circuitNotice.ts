import "server-only";

/**
 * The Circuit launch email (Terms §3.4: "email organizers using Circuit at
 * least 30 days before any charge applies"). Everyone who created a
 * tournament before the billing switch first turned on gets one email: their
 * earlier tournaments keep Circuit for good, and new ones keep every Circuit
 * feature free until the grace end (src/lib/tournaments/circuit-resolve.ts).
 *
 * Sent from Platform ▸ Switches (POST /api/admin/circuit-notice), only once
 * the switch is on so the email can name the real dates. The first send
 * stamps `organizer_circuit_notice_at`, and the grace runs from the later of
 * that and the launch, so a late email still gives the full 30 days. Who has
 * been emailed is kept in the `organizer_circuit_notice_sent` flag row (a JSON
 * list of account ids), so pressing it again only reaches anyone missed.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { ensureCircuitNoticeAt, getBillingEnabledAt, getCircuitNoticeAt, getPlatformFlag } from "@/lib/platform/flags";
import { circuitGraceEnd } from "@/lib/tournaments/circuit";
import { isStaffRole } from "@/lib/subscription";
import { sendTransactionalEmail } from "@/lib/email/mailersend";

const SENT_KEY = "organizer_circuit_notice_sent";
const SITE = "https://www.gameshuffle.co";

const pacific = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export interface CircuitNoticeStatus {
  /** The billing switch is on (the email can only go out then). */
  launched: boolean;
  launchLabel: string | null;
  /** When earlier organizers' free Circuit ends, if the email went out now. */
  graceLabel: string | null;
  noticeSentAt: string | null;
  /** Organizers who created a tournament before the launch (staff left out). */
  recipients: number;
  sent: number;
}

async function sentIds(): Promise<Set<string>> {
  const admin = createServiceClient();
  const { data } = await admin.from("gs_platform_flags").select("description").eq("key", SENT_KEY).maybeSingle();
  try {
    const list = JSON.parse((data as { description: string | null } | null)?.description ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

async function saveSentIds(ids: Set<string>): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_platform_flags").upsert(
    { key: SENT_KEY, enabled: true, description: JSON.stringify([...ids]), updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

/** Organizers who created a tournament before `before`, without staff and admins. */
async function organizersBefore(before: Date): Promise<string[]> {
  const admin = createServiceClient();
  const { data } = await admin.from("tournaments").select("organizer_id").lt("created_at", before.toISOString()).not("organizer_id", "is", null);
  const ids = [...new Set(((data ?? []) as { organizer_id: string }[]).map((r) => r.organizer_id))];
  if (!ids.length) return [];
  const { data: users } = await admin.from("users").select("id, role").in("id", ids);
  return ((users ?? []) as { id: string; role: string | null }[]).filter((u) => !isStaffRole(u.role)).map((u) => u.id);
}

export async function circuitNoticeStatus(): Promise<CircuitNoticeStatus> {
  const launched = await getPlatformFlag("organizer_billing_enabled", false);
  const anchor = launched ? await getBillingEnabledAt() : null;
  const noticeAt = await getCircuitNoticeAt();
  const cutoff = anchor ?? new Date();
  const [ids, sent] = await Promise.all([organizersBefore(cutoff), sentIds()]);
  const grace = circuitGraceEnd(cutoff.toISOString(), (noticeAt ?? new Date()).toISOString());
  return {
    launched: !!anchor,
    launchLabel: anchor ? pacific(anchor) : null,
    graceLabel: grace?.label ?? null,
    noticeSentAt: noticeAt?.toISOString() ?? null,
    recipients: ids.length,
    sent: ids.filter((id) => sent.has(id)).length,
  };
}

function noticeText(name: string, launchLabel: string, graceLabel: string): string {
  return [
    `Hi ${name},`,
    "",
    "Thanks for running tournaments on GameShuffle while Circuit was in preview. Circuit, the part of GameShuffle for bigger fields and organizer features, now has paid plans. Here is what that means for you:",
    "",
    `- Tournaments you created before ${launchLabel} keep every Circuit feature, for good.`,
    `- New tournaments you create keep every Circuit feature free until ${graceLabel}.`,
    "- After that, every format is still free for one full lobby of your game (12 players in Mario Kart 8 Deluxe, 24 in Mario Kart World). Anyone who signs up past that joins your waitlist, and upgrading to a Circuit plan offers them spots in line order. The other organizer features need a Circuit plan too.",
    "",
    "The plans:",
    "- Circuit 64: events of up to 64 players, $12 a month or $120 a year.",
    "- Circuit 256: events of up to 256 players with GameShuffle Pro included, $29 a month or $290 a year.",
    "",
    "Nothing is charged unless you choose a plan and confirm it at checkout.",
    "",
    `See the plans: ${SITE}/gs-circuit`,
    `The terms (section 3.4): ${SITE}/terms#use-of-service`,
    "",
    "Questions, or running something bigger? Reply to this email.",
    "",
    "The GameShuffle team",
  ].join("\n");
}

/**
 * Email every earlier organizer who hasn't had it yet. Only once the billing
 * switch is on. Returns how many went out and how many failed.
 */
export async function sendCircuitLaunchNotices(): Promise<{ ok: true; sent: number; failed: number; graceLabel: string } | { ok: false; error: "not_launched" }> {
  const anchor = (await getPlatformFlag("organizer_billing_enabled", false)) ? await getBillingEnabledAt() : null;
  if (!anchor) return { ok: false, error: "not_launched" };

  const noticeAt = await ensureCircuitNoticeAt();
  const grace = circuitGraceEnd(anchor.toISOString(), noticeAt.toISOString())!;
  const launchLabel = pacific(anchor);
  const already = await sentIds();
  const todo = (await organizersBefore(anchor)).filter((id) => !already.has(id));

  const admin = createServiceClient();
  let sent = 0;
  let failed = 0;
  for (const id of todo) {
    const [{ data: authUser }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(id),
      admin.from("users").select("display_name, username").eq("id", id).maybeSingle(),
    ]);
    const email = authUser?.user?.email;
    if (!email) { failed += 1; continue; }
    const p = profile as { display_name: string | null; username: string | null } | null;
    const name = p?.display_name?.trim() || p?.username || "there";
    const res = await sendTransactionalEmail({
      to: email,
      toName: p?.display_name ?? undefined,
      subject: `GameShuffle Circuit has launched: it stays free for you until ${grace.label}`,
      text: noticeText(name, launchLabel, grace.label),
      replyTo: "support@gameshuffle.co",
    });
    if (res.ok) {
      sent += 1;
      already.add(id);
      await saveSentIds(already);
    } else {
      failed += 1;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return { ok: true, sent, failed, graceLabel: grace.label };
}
