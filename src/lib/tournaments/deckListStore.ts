import "server-only";

/**
 * Tournament deck lists on the server (Pokémon TCG events). A player sends one
 * of their saved lists (My Stuff ▸ Deck lists) or pastes one; we keep a copy in
 * `tournament_deck_lists`, matched to catalog cards, so editing the saved list
 * later doesn't change what they registered. Changing a sent list clears the
 * organizer's "checked" mark. Lists lock once the event starts.
 *
 * Privacy: the player sees their own; organizers and co-organizers see all;
 * the public sees them only after the event, and only what the organizer chose
 * (the top cut's or everyone's). Checks are worked out on read against the
 * tournament's format, never stored.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { matchLines, viewOf, type DeckView } from "@/lib/tcg/decks";
import { parseDeckText, type DeckLine } from "@/lib/tcg/deckList";
import { deckListSettingsOf, deckListsLocked, isDeckListGame, type DeckListSettings } from "./deckLists";
import { isSwissState } from "./swiss";

const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);
const COLS = "id, participant_id, user_id, deck_id, name, cards, submitted_at, updated_at, checked_at";

export type DeckListError = "missing" | "not_found" | "off" | "locked" | "not_playing" | "no_deck" | "empty" | "bad_name" | "busy";
export const DECK_LIST_ERRORS: Record<DeckListError, string> = {
  missing: "Deck lists need a database update first.",
  not_found: "We couldn't find that tournament.",
  off: "This tournament doesn't take deck lists.",
  locked: "Deck lists are locked: the event has started.",
  not_playing: "Join the tournament first, then send your list.",
  no_deck: "We couldn't find that deck in your lists.",
  empty: "That list has no cards we could read.",
  bad_name: "Give the deck a name.",
  busy: "Something went wrong saving your list. Try again.",
};

interface TRow { id: string; title: string; status: string; format: string | null; game_slug: string | null; settings: Record<string, unknown> | null; organizer_id: string; swiss: unknown }
interface ListRow { id: string; participant_id: string; user_id: string | null; deck_id: string | null; name: string; cards: DeckLine[]; submitted_at: string; updated_at: string; checked_at: string | null }
type Result<T> = { ok: true; value: T } | { ok: false; error: DeckListError };
const fail = <T>(error: DeckListError): Result<T> => ({ ok: false, error });

const db = () => createServiceClient();

async function tournament(id: string): Promise<TRow | null> {
  const { data } = await db().from("tournaments").select("id, title, status, format, game_slug, settings, organizer_id, swiss").eq("id", id).maybeSingle();
  return (data as unknown as TRow | null) ?? null;
}

const listView = (row: ListRow, s: DeckListSettings): Promise<DeckView> =>
  viewOf({ id: row.id, name: row.name, format: s.format, source: row.deck_id ? "saved" : "paste", updatedAt: row.updated_at }, row.cards ?? [], { userId: null, spend: false });

const cleanName = (raw: unknown) => String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

/** The signed-in player's entry and list. */
export async function myDeckList(id: string, userId: string): Promise<Result<{ participantId: string | null; deck: (DeckView & { checkedAt: string | null }) | null; locked: boolean; settings: DeckListSettings }>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const settings = deckListSettingsOf(t.settings);
  if (!isDeckListGame(t.game_slug) || settings.when === "off") return fail("off");
  const { data: p } = await db().from("tournament_participants").select("id").eq("tournament_id", id).eq("user_id", userId).maybeSingle();
  const participantId = (p as { id: string } | null)?.id ?? null;
  if (!participantId) return { ok: true, value: { participantId: null, deck: null, locked: deckListsLocked(t.status), settings } };
  const { data, error } = await db().from("tournament_deck_lists").select(COLS).eq("participant_id", participantId).maybeSingle();
  if (error) return fail(error.code && MISSING.has(error.code) ? "missing" : "busy");
  const row = data as ListRow | null;
  return { ok: true, value: { participantId, deck: row ? { ...(await listView(row, settings)), checkedAt: row.checked_at } : null, locked: deckListsLocked(t.status), settings } };
}

/**
 * Send (or swap) a player's list: one of their saved decks by id, or a paste
 * with a name. `asParticipant` lets the join route attach the list to the seat
 * it just created.
 */
export async function submitDeckList(id: string, userId: string, input: { deckId?: unknown; name?: unknown; text?: unknown }, opts: { asParticipant?: string } = {}): Promise<Result<DeckView>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const settings = deckListSettingsOf(t.settings);
  if (!isDeckListGame(t.game_slug) || settings.when === "off") return fail("off");
  if (deckListsLocked(t.status)) return fail("locked");
  let participantId = opts.asParticipant ?? null;
  if (!participantId) {
    const { data: p } = await db().from("tournament_participants").select("id, status").eq("tournament_id", id).eq("user_id", userId).maybeSingle();
    const row = p as { id: string; status: string } | null;
    if (!row || row.status === "dropped") return fail("not_playing");
    participantId = row.id;
  }

  let name: string, lines: DeckLine[], deckId: string | null = null;
  if (typeof input.deckId === "string" && input.deckId) {
    const { data, error } = await db().from("tcg_decks").select("id, name, cards").eq("id", input.deckId).eq("user_id", userId).maybeSingle();
    if (error) return fail(error.code && MISSING.has(error.code) ? "missing" : "busy");
    if (!data) return fail("no_deck");
    const d = data as { id: string; name: string; cards: DeckLine[] };
    name = d.name; lines = d.cards ?? []; deckId = d.id;
  } else {
    name = cleanName(input.name);
    if (!name) return fail("bad_name");
    lines = (await matchLines(parseDeckText(String(input.text ?? "").slice(0, 20_000)).lines, { spend: true })).lines;
  }
  if (!lines.length) return fail("empty");

  const now = new Date().toISOString();
  const { data, error } = await db().from("tournament_deck_lists").upsert(
    { tournament_id: id, participant_id: participantId, user_id: userId, deck_id: deckId, name, cards: lines, updated_at: now, checked_at: null, checked_by: null },
    { onConflict: "participant_id" },
  ).select(COLS).single();
  if (error) return fail(error.code && MISSING.has(error.code) ? "missing" : "busy");
  return { ok: true, value: await listView(data as ListRow, settings) };
}

export interface OrganizerDeckRow {
  participantId: string;
  player: string;
  status: string;
  hasAccount: boolean;
  deck: { name: string; total: number; legal: boolean; unchecked: number; problems: number; checkedAt: string | null; updatedAt: string } | null;
}

/** Every entrant and their list's status, for the organizer's Deck lists tab. */
export async function organizerDeckLists(id: string): Promise<Result<{ rows: OrganizerDeckRow[]; settings: DeckListSettings; locked: boolean }>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const settings = deckListSettingsOf(t.settings);
  if (!isDeckListGame(t.game_slug)) return fail("off");
  const [{ data: ppl }, lists] = await Promise.all([
    db().from("tournament_participants").select("id, user_id, display_name, status").eq("tournament_id", id).order("joined_at", { ascending: true }),
    db().from("tournament_deck_lists").select(COLS).eq("tournament_id", id),
  ]);
  if (lists.error) return fail(lists.error.code && MISSING.has(lists.error.code) ? "missing" : "busy");
  const byParticipant = new Map(((lists.data ?? []) as ListRow[]).map((r) => [r.participant_id, r]));
  const rows: OrganizerDeckRow[] = [];
  for (const p of (ppl ?? []) as { id: string; user_id: string | null; display_name: string | null; status: string }[]) {
    if (p.status === "waitlisted" || p.status === "offered" || p.status === "withdrawn") continue;
    const row = byParticipant.get(p.id);
    const v = row ? await listView(row, settings) : null;
    rows.push({
      participantId: p.id, player: p.display_name || "Player", status: p.status, hasAccount: !!p.user_id,
      deck: v && row ? { name: v.name, total: v.totals.all, legal: v.legal, unchecked: v.unchecked, problems: v.checks.filter((c) => c.level === "bad").length, checkedAt: row.checked_at, updatedAt: row.updated_at } : null,
    });
  }
  return { ok: true, value: { rows, settings, locked: deckListsLocked(t.status) } };
}

/** One entrant's full list (organizer). */
export async function deckListDetail(id: string, participantId: string): Promise<Result<DeckView & { checkedAt: string | null; player: string }>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const settings = deckListSettingsOf(t.settings);
  const [{ data, error }, { data: p }] = await Promise.all([
    db().from("tournament_deck_lists").select(COLS).eq("tournament_id", id).eq("participant_id", participantId).maybeSingle(),
    db().from("tournament_participants").select("display_name").eq("id", participantId).maybeSingle(),
  ]);
  if (error) return fail(error.code && MISSING.has(error.code) ? "missing" : "busy");
  if (!data) return fail("no_deck");
  const row = data as ListRow;
  return { ok: true, value: { ...(await listView(row, settings)), checkedAt: row.checked_at, player: (p as { display_name: string | null } | null)?.display_name || "Player" } };
}

export async function setDeckChecked(id: string, participantId: string, userId: string, checked: boolean): Promise<Result<true>> {
  const { error } = await db().from("tournament_deck_lists")
    .update(checked ? { checked_at: new Date().toISOString(), checked_by: userId } : { checked_at: null, checked_by: null })
    .eq("tournament_id", id).eq("participant_id", participantId);
  if (error) return fail(error.code && MISSING.has(error.code) ? "missing" : "busy");
  return { ok: true, value: true };
}

/** A nudge to an entrant who hasn't sent a list (in-app, accounts only). */
export async function remindDeckList(id: string, participantId: string): Promise<Result<boolean>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const { data } = await db().from("tournament_participants").select("user_id").eq("id", participantId).eq("tournament_id", id).maybeSingle();
  const userId = (data as { user_id: string | null } | null)?.user_id;
  if (!userId) return { ok: true, value: false };
  await createNotification({
    userId, type: "tournament_update", title: "Send your deck list",
    message: `${t.title} needs your deck list before round 1. Pick one of your saved lists or paste one on the tournament page.`,
    link: `/tournament/${id}#deck-list`, data: { eventType: "tournament", eventId: id },
  });
  return { ok: true, value: true };
}

export interface PublicDeckList { placement: number; player: string; deck: DeckView }

/** After the event: the lists the organizer chose to show, best placement first. */
export async function publicDeckLists(id: string): Promise<Result<{ lists: PublicDeckList[]; scope: "top_cut" | "all" } | null>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const settings = deckListSettingsOf(t.settings);
  if (!isDeckListGame(t.game_slug) || settings.when === "off" || settings.after === "private" || t.status !== "complete") return { ok: true, value: null };
  const cut = isSwissState(t.swiss) && t.swiss.topCut ? t.swiss.topCut : 4;
  const [{ data: res }, lists, { data: ppl }] = await Promise.all([
    db().from("tournament_results").select("participant_id, placement").eq("tournament_id", id),
    db().from("tournament_deck_lists").select(COLS).eq("tournament_id", id),
    db().from("tournament_participants").select("id, display_name").eq("tournament_id", id),
  ]);
  if (lists.error) return fail(lists.error.code && MISSING.has(lists.error.code) ? "missing" : "busy");
  const place = new Map(((res ?? []) as { participant_id: string; placement: number | null }[]).filter((r) => r.placement != null).map((r) => [r.participant_id, r.placement as number]));
  const names = new Map(((ppl ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name || "Player"]));
  const out: PublicDeckList[] = [];
  for (const row of (lists.data ?? []) as ListRow[]) {
    const placement = place.get(row.participant_id);
    if (placement == null || (settings.after === "top_cut" && placement > cut)) continue;
    out.push({ placement, player: names.get(row.participant_id) ?? "Player", deck: await listView(row, settings) });
  }
  out.sort((a, b) => a.placement - b.placement);
  return { ok: true, value: { lists: out, scope: settings.after } };
}
