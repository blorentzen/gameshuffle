import "server-only";

/**
 * The match read on the server: look up each pasted name, read the room and keep the last
 * room a signed-in player checked (`lounge_rooms`, supabase/lounge-m2.sql) for the overlay's
 * "Tonight's room" piece and !odds. Dashboard additions picks, 2026-10-20.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { divisionSteps, loungeBasic } from "@/lib/mmr/mkcentral";
import { standing, type MmrGame } from "@/lib/mmr/rules";
import { readRoom, type RoomPlayer, type RoomRead } from "./room";

export interface SavedRoom { game: MmrGame; teamSize: number; me: string | null; players: RoomPlayer[][]; checkedAt: string }

/** Look up every name (four at a time) and read the room for `me`. */
export async function lookUpRoom(teams: string[][], game: MmrGame, me: string | null, teamSize: number): Promise<{ players: RoomPlayer[][]; read: RoomRead; meName: string | null }> {
  const steps = await divisionSteps(game);
  const flat = teams.flat();
  const found = new Map<string, RoomPlayer>();
  for (let i = 0; i < flat.length; i += 4) {
    await Promise.all(flat.slice(i, i + 4).map(async (name) => {
      const b = await loungeBasic({ name }, game).catch(() => null);
      found.set(name, b ? { name: b.name, mmr: b.mmr, division: b.mmr != null ? standing(b.mmr, steps).division : null, found: true } : { name, mmr: null, division: null, found: false });
    }));
  }
  const players = teams.map((t) => t.map((n) => found.get(n)!));
  // The lounge's own spelling of the name the read is for.
  const meName = me ? players.flat().find((p) => p.name.toLowerCase() === me.toLowerCase())?.name ?? me : null;
  return { players, read: readRoom(players, meName, teamSize), meName };
}

export async function saveRoom(userId: string, room: Omit<SavedRoom, "checkedAt">): Promise<void> {
  const { error } = await createServiceClient().from("lounge_rooms").upsert({
    user_id: userId, game: room.game, team_size: room.teamSize, me: room.me, players: room.players, checked_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error && !/lounge_rooms/.test(error.message)) console.error("[lounge] saveRoom:", error.message);
}

export async function savedRoom(userId: string): Promise<SavedRoom | null> {
  const { data, error } = await createServiceClient().from("lounge_rooms").select("game, team_size, me, players, checked_at").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  const r = data as { game: MmrGame; team_size: number; me: string | null; players: RoomPlayer[][]; checked_at: string };
  return { game: r.game, teamSize: r.team_size, me: r.me, players: r.players, checkedAt: r.checked_at };
}

/** A saved room's read, or null when it's older than six hours (a night's play). */
export async function tonightsRoom(userId: string): Promise<(SavedRoom & { read: RoomRead }) | null> {
  const room = await savedRoom(userId);
  if (!room || Date.now() - Date.parse(room.checkedAt) > 6 * 60 * 60_000) return null;
  return { ...room, read: readRoom(room.players, room.me, room.teamSize) };
}

// ── The overlay's "Tonight's room" piece (GS Pro) ────────────────────────

export interface RoomOverlayData {
  game: MmrGame;
  name: string;
  seed: number;
  of: number;
  likely: number;
  breakEven: number | null;
  /** What 1st, the break-even place and last pay. */
  pays: { place: number; delta: number }[];
  average: number | null;
}

const overlayCache = new Map<string, { at: number; value: RoomOverlayData | null }>();

/** The streamer's last checked room for the overlay, while it's tonight's (cached 10s per streamer, polled every 2s). */
export async function roomOverlayFor(ownerUserId: string): Promise<RoomOverlayData | null> {
  const hit = overlayCache.get(ownerUserId);
  if (hit && Date.now() - hit.at < 10_000) return hit.value;
  let value: RoomOverlayData | null = null;
  try {
    const { isProUser } = await import("@/lib/subscription-server");
    if (await isProUser(ownerUserId)) {
      const room = await tonightsRoom(ownerUserId);
      const me = room?.read.me;
      if (room && me) {
        const n = me.pay.length;
        const places = [...new Set([1, me.breakEven ?? Math.round(me.likely), n])].sort((a, b) => a - b);
        value = {
          game: room.game, name: room.me ?? "", seed: me.seed, of: n, likely: me.likely, breakEven: me.breakEven,
          pays: places.map((p) => ({ place: p, delta: me.pay[p - 1] })), average: room.read.average,
        };
      }
    }
  } catch (e) { console.error("[lounge] room overlay:", e); }
  overlayCache.set(ownerUserId, { at: Date.now(), value });
  if (overlayCache.size > 2000) overlayCache.delete(overlayCache.keys().next().value as string);
  return value;
}
