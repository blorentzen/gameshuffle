import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { PARTY_GAMES } from "@/data/party";
import { rollSetup } from "@/lib/party/roll";
import { collectionForUser } from "@/lib/collection/server";
import { createNight, identify, loadNight, PartyError, runAction, type NewSeat } from "@/lib/party/nights";
import { partyModuleOf, readModules, type NightModule } from "@/lib/game-nights/modules";

/**
 * Game night modules, server side: saving a night's modules (the host only,
 * service role) and starting the Mario Party module as a live night.
 */

export class ModuleError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

async function hostedNight(nightId: string, userId: string) {
  const { data, error } = await createServiceClient().from("board_game_nights").select("id, host_id, title, modules").eq("id", nightId).maybeSingle();
  if (error) throw new ModuleError(/modules/.test(error.message) ? "unavailable" : "db_error", /modules/.test(error.message) ? 503 : 500);
  if (!data) throw new ModuleError("not_found", 404);
  if ((data as { host_id: string }).host_id !== userId) throw new ModuleError("host_only", 403);
  return data as { id: string; host_id: string; title: string; modules: unknown };
}

export async function saveModules(nightId: string, userId: string, modules: unknown): Promise<NightModule[]> {
  await hostedNight(nightId, userId);
  const clean = readModules(modules);
  const { error } = await createServiceClient().from("board_game_nights").update({ modules: clean, updated_at: new Date().toISOString() }).eq("id", nightId);
  if (error) throw new ModuleError(/modules/.test(error.message) ? "unavailable" : "db_error", /modules/.test(error.message) ? 503 : 500);
  return clean;
}

/** The game night's live night that's still going, if any. */
export async function liveNightForEvent(nightId: string): Promise<{ code: string } | null> {
  const { data, error } = await createServiceClient().from("party_nights").select("join_code").eq("event_id", nightId).eq("status", "open")
    .order("created_at", { ascending: false }).limit(1);
  if (error) return null;
  const code = (data as { join_code: string }[] | null)?.[0]?.join_code;
  return code ? { code } : null;
}

/**
 * Start the Mario Party module: RSVPs who are going get seats with their
 * accounts (the host first, if they're playing), then open seats up to a full
 * table for guests to take by code. The first Mario Party game's board and
 * rules are rolled from what the host owns, then house rules and hands are
 * dealt the way the module says.
 */
export async function startPartyModule(nightId: string, userId: string): Promise<{ code: string }> {
  const night = await hostedNight(nightId, userId);
  const mod = partyModuleOf(night.modules);
  if (!mod) throw new ModuleError("no_module", 409);
  const running = await liveNightForEvent(nightId);
  if (running) return running;

  const svc = createServiceClient();
  const { data: rsvps } = await svc.from("board_game_night_rsvps").select("user_id").eq("night_id", nightId).eq("status", "going");
  const going = ((rsvps ?? []) as { user_id: string }[]).map((r) => r.user_id).filter((id) => id !== userId);
  const people = [...(mod.hostPlays ? [userId] : []), ...going].slice(0, 8);
  const { data: users } = people.length ? await svc.from("users").select("id, display_name, username").in("id", people) : { data: [] };
  const nameOf = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u.display_name || u.username || "Player"]));
  const seats: NewSeat[] = people.map((id) => ({ name: nameOf.get(id) ?? "Player", isCpu: false, character: null, userId: id }));
  while (seats.length < 4) seats.push({ name: "", isCpu: false, character: null });

  const first = mod.games[0];
  const game = PARTY_GAMES[first];
  let config: Record<string, unknown> = {};
  if (game) {
    const col = await collectionForUser(userId, first).catch(() => null);
    const off = new Set(col?.enabled ? col.off.boards ?? [] : game.boards.filter((b) => b.unlockable).map((b) => b.id));
    const edition = (col?.prefs.edition as "switch1" | "switch2" | undefined) ?? "switch1";
    const setup = rollSetup(game, { edition, boardIds: game.boards.filter((b) => !off.has(b.id)).map((b) => b.id), rulesetIds: [] });
    config = { edition, setup, moments: ["homestretch", "catch-up"] };
  }

  let made: { id: string; code: string };
  try {
    made = await createNight({
      hostId: userId, gameSlug: first, config, visibility: mod.visibility, seats,
      hostSeat: mod.hostPlays ? 0 : null, lineup: mod.games.slice(1),
    });
  } catch (e) {
    throw e instanceof PartyError ? new ModuleError(e.code, e.status) : e;
  }
  await svc.from("party_nights").update({ event_id: nightId }).eq("id", made.id);

  // Deal the way the module says: house rules for the table, then hands.
  const l = await loadNight(made.code);
  if (l) {
    const host = identify(l, userId, null);
    if (mod.cards.rules > 0) await runAction(l, host, { action: "rules", count: mod.cards.rules, spicy: mod.cards.spicy }).catch(() => null);
    const l2 = await loadNight(made.code);
    if (l2 && (mod.cards.chance > 0 || mod.cards.missions > 0)) {
      await runAction(l2, identify(l2, userId, null), { action: "deal", chance: mod.cards.chance, mix: mod.cards.mix, missions: mod.cards.missions, carryover: mod.carryover }).catch(() => null);
    }
  }
  return { code: made.code };
}
