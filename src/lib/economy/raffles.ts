import "server-only";

/**
 * Community raffles — the repeatable token sink. A community runs a raffle;
 * members burn tokens to buy weighted entries; the owner draws a random winner.
 * Burns flow through `gs_raffle_enter` (atomic, advisory-locked). Closed-loop
 * safe: prizes are organizer-defined non-cash rewards. See economy-raffles-m1.sql.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet, getAccountBalance } from "@/lib/economy/accountWallet";

export interface Raffle {
  id: string;
  communityId: string;
  title: string;
  prize: string;
  entryCost: number;
  status: "open" | "drawn" | "cancelled";
  winnerName: string | null;
  createdAt: string;
  drawnAt: string | null;
}

export interface RaffleSummary extends Raffle {
  totalEntries: number;
  entrants: number;
  pot: number; // tokens burned so far (entryCost * totalEntries)
  yourEntries: number;
}

function mapRow(r: Record<string, unknown>): Raffle {
  return {
    id: r.id as string,
    communityId: r.community_id as string,
    title: r.title as string,
    prize: r.prize as string,
    entryCost: Number(r.entry_cost),
    status: r.status as Raffle["status"],
    winnerName: (r.winner_name as string | null) ?? null,
    createdAt: r.created_at as string,
    drawnAt: (r.drawn_at as string | null) ?? null,
  };
}

/** The community's current open raffle, if any. Guarded (table may be pre-migration). */
export async function getOpenRaffle(communityId: string): Promise<Raffle | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_raffles")
    .select("*")
    .eq("community_id", communityId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export interface RaffleWin { id: string; title: string; prize: string; winnerName: string | null; drawnAt: string | null }

/** Recent drawn raffles for a community (social proof / past winners). */
export async function listRaffleHistory(communityId: string, limit = 5): Promise<RaffleWin[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_raffles")
    .select("id, title, prize, winner_name, drawn_at")
    .eq("community_id", communityId)
    .eq("status", "drawn")
    .order("drawn_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    prize: r.prize as string,
    winnerName: (r.winner_name as string | null) ?? null,
    drawnAt: (r.drawn_at as string | null) ?? null,
  }));
}

export async function getRaffle(id: string): Promise<Raffle | null> {
  const admin = createServiceClient();
  const { data, error } = await admin.from("gs_raffles").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

/** Summary for display: totals + the viewer's own entry count. */
export async function getRaffleSummary(raffle: Raffle, viewerAccountId?: string | null): Promise<RaffleSummary> {
  const admin = createServiceClient();
  const { data: entries } = await admin
    .from("gs_raffle_entries")
    .select("identity_id, account_id, entries")
    .eq("raffle_id", raffle.id);
  const rows = (entries ?? []) as { identity_id: string; account_id: string | null; entries: number }[];
  const totalEntries = rows.reduce((s, r) => s + (r.entries ?? 0), 0);
  const yourEntries = viewerAccountId ? rows.filter((r) => r.account_id === viewerAccountId).reduce((s, r) => s + r.entries, 0) : 0;
  return {
    ...raffle,
    totalEntries,
    entrants: rows.length,
    pot: totalEntries * raffle.entryCost,
    yourEntries,
  };
}

/** Create a raffle (closes any other open one in the community first). */
export async function createRaffle(
  communityId: string,
  input: { title: string; prize: string; entryCost: number },
  createdBy: string,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const title = input.title.trim().slice(0, 120);
  const prize = input.prize.trim().slice(0, 200);
  const entryCost = Math.max(1, Math.min(1_000_000, Math.round(input.entryCost)));
  if (!title || !prize) return { ok: false, reason: "missing_fields" };
  const admin = createServiceClient();
  await admin.from("gs_raffles").update({ status: "cancelled" }).eq("community_id", communityId).eq("status", "open");
  const { data, error } = await admin
    .from("gs_raffles")
    .insert({ community_id: communityId, title, prize, entry_cost: entryCost, created_by: createdBy })
    .select("id")
    .single();
  if (error) return { ok: false, reason: /relation|column|schema cache/i.test(error.message) ? "migration_pending" : error.message };
  return { ok: true, id: (data as { id: string }).id };
}

/** Buy one entry for the signed-in account. Atomic burn + increment. */
export async function buyEntry(raffleId: string, accountId: string): Promise<{ ok: boolean; balance?: number; entries?: number; reason?: string }> {
  const wallet = await ensureAccountWallet(accountId).catch(() => null);
  if (!wallet) return { ok: false, reason: "wallet_unavailable" };
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_raffle_enter", {
    p_raffle_id: raffleId,
    p_identity_id: wallet.identityId,
    p_account_id: accountId,
  });
  if (error) return { ok: false, reason: /function|does not exist|schema cache/i.test(error.message) ? "migration_pending" : error.message };
  const r = data as { ok: boolean; reason?: string; balance?: number; entries?: number };
  return { ok: r.ok, balance: r.balance, entries: r.entries, reason: r.reason };
}

/** Draw a weighted-random winner and close the raffle. Owner/mod gated by caller. */
export async function drawRaffle(raffleId: string): Promise<{ ok: boolean; winnerName?: string; reason?: string }> {
  const admin = createServiceClient();
  const raffle = await getRaffle(raffleId);
  if (!raffle) return { ok: false, reason: "not_found" };
  if (raffle.status !== "open") return { ok: false, reason: "not_open" };

  const { data: entries } = await admin
    .from("gs_raffle_entries")
    .select("identity_id, account_id, entries")
    .eq("raffle_id", raffleId);
  const rows = (entries ?? []) as { identity_id: string; account_id: string | null; entries: number }[];
  const total = rows.reduce((s, r) => s + (r.entries ?? 0), 0);
  if (total === 0) return { ok: false, reason: "no_entries" };

  // Weighted pick: each entry is one ticket.
  let ticket = Math.floor(Math.random() * total);
  let winner = rows[0];
  for (const r of rows) { if (ticket < r.entries) { winner = r; break; } ticket -= r.entries; }

  // Resolve the winner's display name from their account.
  let winnerName = "A member";
  if (winner.account_id) {
    const { data: u } = await admin.from("users").select("display_name, username").eq("id", winner.account_id).maybeSingle();
    const uu = u as { display_name: string | null; username: string | null } | null;
    winnerName = uu?.display_name || (uu?.username ? `@${uu.username}` : "A member");
  }

  await admin
    .from("gs_raffles")
    .update({ status: "drawn", winner_identity_id: winner.identity_id, winner_name: winnerName, drawn_at: new Date().toISOString() })
    .eq("id", raffleId);
  return { ok: true, winnerName };
}

export { getAccountBalance };
