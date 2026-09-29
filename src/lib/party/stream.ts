import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { TwitchAdapter } from "@/lib/adapters/twitch";
import { createPoll, isPollError, tally } from "@/lib/polls/store";
import { dealChaos, loadNight, runAction, showOnOverlay, type Loaded } from "@/lib/party/nights";
import { CHAOS_MODIFIERS } from "@/data/originals/chaos-cup";

/**
 * Stream mode for live party nights: chat votes on who gets the next Chance
 * card. The vote is an ordinary GS poll (so it shows on /live, the overlay and
 * Discord like any other); when it closes, the winner is dealt the card.
 */

const VOTE_SECONDS = 45;

export interface PendingVote { pollId: string; effect: "help" | "crutch" | "both"; seats: number[]; /** Chaos Cup: modifier ids, in option order. */ chaos?: string[] }

/** Open a "who gets it?" poll over the seated people. */
export async function startChanceVote(l: Loaded, communityId: string, effect: PendingVote["effect"]): Promise<{ ok: true; names: string[] } | { ok: false; reason: string }> {
  const people = l.seats.filter((s) => !s.is_cpu && (s.user_id || s.guest_key_hash || s.identity_id));
  if (people.length < 2) return { ok: false, reason: "need_two" };
  const what = effect === "help" ? "a help" : effect === "crutch" ? "a crutch" : "a Chance card";
  const poll = await createPoll({
    communityId, question: `Who gets ${what}?`, options: people.map((s) => s.display_name), open: true,
    closesAt: new Date(Date.now() + VOTE_SECONDS * 1000).toISOString(), allowChange: true,
  });
  if (isPollError(poll)) return { ok: false, reason: poll.error };
  const pending: PendingVote = { pollId: poll.id, effect, seats: people.map((s) => s.seat_index) };
  const { error } = await createServiceClient().from("party_nights").update({ pending_vote: pending }).eq("id", l.night.id);
  if (error) return { ok: false, reason: "unavailable" };
  return { ok: true, names: people.map((s) => s.display_name) };
}

/** Chaos Cup: chat votes between the three modifiers rolled for this race. */
export async function startChaosVote(l: Loaded, communityId: string, options: string[]): Promise<{ ok: true } | { ok: false; reason: string }> {
  const labels = options.map((id) => CHAOS_MODIFIERS.find((c) => c.id === id)?.title ?? id);
  const poll = await createPoll({
    communityId, question: "Chaos Cup: what happens this race?", options: labels, open: true,
    closesAt: new Date(Date.now() + VOTE_SECONDS * 1000).toISOString(), allowChange: true,
  });
  if (isPollError(poll)) return { ok: false, reason: poll.error };
  const pending: PendingVote = { pollId: poll.id, effect: "both", seats: [], chaos: options };
  const { error } = await createServiceClient().from("party_nights").update({ pending_vote: pending }).eq("id", l.night.id);
  if (error) return { ok: false, reason: "unavailable" };
  return { ok: true };
}

/**
 * Called when any poll closes. If it was a party vote, deal the card to the
 * winner (ties go to a random one of the leaders) and announce it.
 */
export async function resolvePartyVote(pollId: string): Promise<void> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("party_nights").select("join_code, pending_vote").eq("pending_vote->>pollId", pollId).limit(1);
  if (error || !data?.length) return;
  const row = data[0] as { join_code: string; pending_vote: PendingVote };
  // Clear first, so a second close event can't deal twice.
  const { data: claimed } = await svc.from("party_nights").update({ pending_vote: null }).eq("join_code", row.join_code).eq("pending_vote->>pollId", pollId).select("id");
  if (!claimed?.length) return;
  const l = await loadNight(row.join_code);
  if (!l) return;
  const t = await tally(pollId);
  // Chaos Cup: the most-voted modifier goes into play (ties: a random leader).
  if (row.pending_vote.chaos?.length) {
    const opts = row.pending_vote.chaos.map((id, i) => ({ id, votes: t.byOption[String(i + 1)] ?? 0 }));
    const most = Math.max(0, ...opts.map((o) => o.votes));
    const tied = opts.filter((o) => o.votes === most);
    const pick = tied[Math.floor(Math.random() * tied.length)];
    const card = pick ? await dealChaos(l, pick.id).catch(() => undefined) : undefined;
    if (card) {
      await new TwitchAdapter({ sessionId: "no-session", ownerUserId: l.night.host_user_id })
        .postChatMessage(`🌀 Chaos Cup: chat picked ${card.title} (${most} vote${most === 1 ? "" : "s"}). ${card.text}`)
        .catch(() => {});
    }
    return;
  }
  const counts = row.pending_vote.seats.map((seat, i) => ({ seat, votes: t.byOption[String(i + 1)] ?? 0 }));
  const top = Math.max(0, ...counts.map((c) => c.votes));
  const leaders = counts.filter((c) => c.votes === top);
  const winner = leaders[Math.floor(Math.random() * leaders.length)]?.seat ?? null;
  if (winner === null) return;
  const out = await runAction(l, { isHost: true, seat: null }, { action: "draw", effect: row.pending_vote.effect, seat: winner }).catch(() => null);
  if (!out?.card) return;
  await showOnOverlay(l, out.card, "chat vote");
  const label = out.card.effect === "help" ? "Help" : out.card.effect === "crutch" ? "Crutch" : "Card";
  await new TwitchAdapter({ sessionId: "no-session", ownerUserId: l.night.host_user_id })
    .postChatMessage(`🎴 Chat picked ${l.seats.find((s) => s.seat_index === winner)?.display_name ?? "a player"} (${top} vote${top === 1 ? "" : "s"}). ${label}: ${out.card.title}. ${out.card.text}`)
    .catch(() => {});
}
