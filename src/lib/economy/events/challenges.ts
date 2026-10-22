import "server-only";

/**
 * Settling chaos challenges from the control room (Spec 04 §5's "host names
 * the winner"). A challenge pegged to one viewer pays or costs them when the
 * streamer marks it Done or Not done. An open challenge (anyone in the stream
 * could do it) pays everyone the streamer picks under "Who did it?". The same
 * picker settles open challenges a prediction market already resolved as a
 * success, which used to end with nobody paid (resolveFanout skips them).
 *
 * Rewards are event_delta tokens like every other challenge payout (the shared
 * economy, not the streamer's allowance). Each settle claims the row first, so
 * two clicks or a click racing a market can't pay twice.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { credit, spend } from "@/lib/economy/tokens";
import { announceToCommunity } from "@/lib/twitch/announce";

export interface HubChallenge {
  id: string;
  /** What chat has to do, from the event's own line. */
  text: string;
  reward: number;
  penalty: number;
  /** The viewer it's pegged to (null = anyone in the stream). */
  targetName: string | null;
  /** open = not decided yet; needs_winner = a market marked it done but nobody was paid. */
  state: "open" | "needs_winner";
  secret: boolean;
}

export interface WinnerCandidate { identityId: string; name: string; from: "lobby" | "chat" }

interface Row {
  id: string; community_id: string; stream_id: string | null; session_id: string | null; chapter: number | null;
  event_id: string; variable_type: string; condition: Record<string, unknown> | null;
  reward: number | null; penalty: number | null; visibility: string; target_identity_id: string | null;
  status: string; resolved_outcome: string | null; resolved_to: string | null; payout_event: number | null;
}

const COLS = "id, community_id, stream_id, session_id, chapter, event_id, variable_type, condition, reward, penalty, visibility, target_identity_id, status, resolved_outcome, resolved_to, payout_event";
const MAX_WINNERS = 10;

/**
 * What chat has to do, in the event's own words: its line (or the channel's
 * own wording for it) with the viewer's name filled in. Shared by the control
 * room, the overlay banner and the live page's Events tab.
 */
export function fillChallengeLine(tmpl: string | null | undefined, targetName: string | null): string | null {
  const line = tmpl?.replace(/\{user\}|\{to\}|\{from\}/g, targetName ?? "chat").replace(/\{[a-z_]+\}/g, "").replace(/\s+/g, " ").trim();
  return line || null;
}

/** Each challenge's event line, with a channel's own wording first (`gs_event_overrides`), keyed `${eventId}:${communityId}`. */
export async function challengeTemplates(rows: { event_id: string; community_id: string | null }[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!rows.length) return out;
  const admin = createServiceClient();
  const eventIds = [...new Set(rows.map((r) => r.event_id))];
  const communityIds = [...new Set(rows.map((r) => r.community_id).filter(Boolean) as string[])];
  const [{ data: events }, { data: overrides }] = await Promise.all([
    admin.from("gs_events").select("id, flavor_tmpl").in("id", eventIds),
    communityIds.length
      ? admin.from("gs_event_overrides").select("community_id, event_id, flavor_tmpl_override").in("community_id", communityIds).in("event_id", eventIds)
      : Promise.resolve({ data: [] }),
  ]);
  const base = new Map(((events ?? []) as { id: string; flavor_tmpl: string | null }[]).map((e) => [e.id, e.flavor_tmpl]));
  const own = new Map(((overrides ?? []) as { community_id: string; event_id: string; flavor_tmpl_override: string | null }[]).map((o) => [`${o.event_id}:${o.community_id}`, o.flavor_tmpl_override]));
  for (const r of rows) {
    const key = `${r.event_id}:${r.community_id}`;
    out.set(key, own.get(key) ?? base.get(r.event_id) ?? null);
  }
  return out;
}

function conditionText(variableType: string, condition: Record<string, unknown> | null): string {
  const bits = condition ? Object.values(condition).map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).filter(Boolean).join(", ") : "";
  const kind = variableType.replace(/_/g, " ");
  return bits ? `${kind}: ${bits}` : kind;
}

/** Open challenges in this stream, plus market-settled open ones still waiting for a winner. */
export async function hubChallenges(sessionId: string): Promise<HubChallenge[]> {
  const admin = createServiceClient();
  const [{ data: open }, { data: unpaid }] = await Promise.all([
    admin.from("gs_event_challenges").select(COLS).eq("session_id", sessionId).eq("status", "open").order("created_at").limit(20),
    admin.from("gs_event_challenges").select(COLS).eq("session_id", sessionId).eq("status", "resolved")
      .eq("resolved_outcome", "success").is("target_identity_id", null).is("resolved_to", null).is("payout_event", null)
      .gt("reward", 0).order("created_at").limit(20),
  ]);
  const rows = [...((open ?? []) as Row[]), ...((unpaid ?? []) as Row[])];
  if (!rows.length) return [];
  const targetIds = [...new Set(rows.map((r) => r.target_identity_id).filter(Boolean) as string[])];
  const [templates, { data: idents }] = await Promise.all([
    challengeTemplates(rows),
    targetIds.length ? admin.from("gs_identities").select("id, display_name").in("id", targetIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map(((idents ?? []) as { id: string; display_name: string | null }[]).map((i) => [i.id, i.display_name ?? "a viewer"]));
  return rows.map((r) => {
    const targetName = r.target_identity_id ? names.get(r.target_identity_id) ?? "a viewer" : null;
    const line = fillChallengeLine(templates.get(`${r.event_id}:${r.community_id}`), targetName);
    return {
      id: r.id,
      text: line || conditionText(r.variable_type, r.condition),
      reward: Number(r.reward ?? 0),
      penalty: Number(r.penalty ?? 0),
      targetName,
      state: r.status === "open" ? "open" : "needs_winner",
      secret: r.visibility === "secret",
    };
  });
}

/** Who could have done it: the lobby, then viewers active in this community's economy in the last 6 hours. */
export async function winnerCandidates(sessionId: string, communityId: string | null): Promise<WinnerCandidate[]> {
  const admin = createServiceClient();
  const out = new Map<string, WinnerCandidate>();
  const { data: lobby } = await admin.from("session_participants").select("platform, platform_user_id, display_name")
    .eq("session_id", sessionId).is("left_at", null).eq("is_broadcaster", false).limit(60);
  // Read-only lookup: listing who might have done it must not open wallets (that grants starting tokens).
  const players = ((lobby ?? []) as { platform: string; platform_user_id: string | null; display_name: string | null }[]).filter((p) => p.platform_user_id);
  for (const platform of [...new Set(players.map((p) => p.platform))]) {
    const ids = players.filter((p) => p.platform === platform).map((p) => p.platform_user_id!);
    const { data: idents } = await admin.from("gs_identities").select("id, platform_id, display_name").eq("platform", platform).in("platform_id", ids);
    for (const i of (idents ?? []) as { id: string; platform_id: string; display_name: string | null }[]) {
      const seat = players.find((p) => p.platform === platform && p.platform_user_id === i.platform_id);
      if (!out.has(i.id)) out.set(i.id, { identityId: i.id, name: seat?.display_name ?? i.display_name ?? "A viewer", from: "lobby" });
    }
  }
  if (communityId) {
    const since = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { data: recent } = await admin.from("token_events").select("identity_id").eq("community_id", communityId).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(300);
    const ids = [...new Set(((recent ?? []) as { identity_id: string }[]).map((r) => r.identity_id))].filter((id) => !out.has(id)).slice(0, 40);
    if (ids.length) {
      const { data: idents } = await admin.from("gs_identities").select("id, display_name").in("id", ids);
      for (const i of (idents ?? []) as { id: string; display_name: string | null }[]) out.set(i.id, { identityId: i.id, name: i.display_name ?? "A viewer", from: "chat" });
    }
  }
  return [...out.values()];
}

export type SettleResult = { ok: true; paid: number; winners: number } | { ok: false; error: "not_found" | "already_settled" | "pick_someone" | "too_many" };

/**
 * Done (with who did it, for an open challenge) or Not done. A pegged
 * challenge pays its viewer the reward or takes the penalty; an open one pays
 * each picked viewer the reward.
 */
export async function settleChallenge(input: { sessionId: string; challengeId: string; done: boolean; winners: string[] }): Promise<SettleResult> {
  const admin = createServiceClient();
  const { data } = await admin.from("gs_event_challenges").select(COLS).eq("id", input.challengeId).eq("session_id", input.sessionId).maybeSingle();
  const ch = data as Row | null;
  if (!ch) return { ok: false, error: "not_found" };
  const winners = [...new Set(input.winners)].slice(0, MAX_WINNERS + 1);
  const needsWinner = ch.status === "resolved" && ch.resolved_outcome === "success" && !ch.target_identity_id && !ch.resolved_to && !ch.payout_event;
  if (ch.status !== "open" && !needsWinner) return { ok: false, error: "already_settled" };
  const open = !ch.target_identity_id;
  if (input.done && open && (ch.reward ?? 0) > 0) {
    if (!winners.length) return { ok: false, error: "pick_someone" };
    if (winners.length > MAX_WINNERS) return { ok: false, error: "too_many" };
  }
  if (!input.done && needsWinner) return { ok: false, error: "already_settled" };

  // Claim the row before any money moves.
  const now = new Date().toISOString();
  const first = open ? winners[0] ?? null : ch.target_identity_id;
  let claim = admin.from("gs_event_challenges").update({
    status: "resolved",
    resolved_outcome: input.done ? "success" : "failure",
    resolved_value: needsWinner ? undefined : "manual",
    resolved_to: input.done ? first : null,
    resolved_at: needsWinner ? undefined : now,
  }).eq("id", ch.id);
  claim = needsWinner ? claim.eq("status", "resolved").is("resolved_to", null).is("payout_event", null) : claim.eq("status", "open");
  const { data: claimed } = await claim.select("id");
  if (!claimed || !claimed.length) return { ok: false, error: "already_settled" };

  const ctx = { communityId: ch.community_id, streamId: ch.stream_id, sessionId: ch.session_id, chapter: ch.chapter, refId: ch.id, meta: { source: "event", trigger: "host", challenge_id: ch.id } };
  let paid = 0;
  let firstEvent: number | null = null;
  if (input.done && (ch.reward ?? 0) > 0) {
    const payees = open ? winners : [ch.target_identity_id!];
    for (const identityId of payees) {
      const r = await credit({ identityId, amount: Number(ch.reward), type: "event_delta", ctx }).catch(() => null);
      if (r?.ok) { paid += Number(ch.reward); firstEvent ??= r.eventId ?? null; }
    }
  } else if (!input.done && !open && (ch.penalty ?? 0) > 0) {
    const r = await spend({ identityId: ch.target_identity_id!, amount: Number(ch.penalty), type: "event_delta", ctx }).catch(() => null);
    if (r?.ok) firstEvent = r.eventId ?? null;
  }
  if (firstEvent) await admin.from("gs_event_challenges").update({ payout_event: firstEvent }).eq("id", ch.id);

  if (input.done && paid > 0 && ch.visibility !== "secret") {
    const { data: idents } = await admin.from("gs_identities").select("display_name").in("id", open ? winners : [ch.target_identity_id!]);
    const who = ((idents ?? []) as { display_name: string | null }[]).map((i) => i.display_name ?? "someone");
    const list = who.length > 3 ? `${who.slice(0, 3).join(", ")} and ${who.length - 3} more` : who.join(", ");
    void announceToCommunity(ch.community_id, `✅ Challenge done! ${list} ${who.length === 1 ? "gets" : "each get"} ${ch.reward} tokens.`);
  }
  return { ok: true, paid, winners: input.done ? (open ? winners.length : 1) : 0 };
}
