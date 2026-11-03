import "server-only";

/**
 * The war on a GS Pro streamer's GameShuffle overlay (overlay looks pick 3A: "GS Pro also gets it inside their
 * GameShuffle overlay"). A streamer adds one war channel from that channel's overlay setup page; the overlay piece
 * `war` then follows that channel's wars in the streamer's saved look. Stored like tool looks, in
 * `streamer_module_defaults` (game_slug "*", module "war_overlay"), so no migration: { token, lookId }.
 * Adding it turns the piece on in the streamer's layouts; it draws only while the streamer has GS Pro.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getLayoutProfiles, saveLayoutProfile } from "@/lib/overlay/layouts";
import type { OverlayFormat } from "@/lib/overlay/format";

const TABLE = "streamer_module_defaults";
const GAME = "*";
const MODULE = "war_overlay";

export interface StreamWar { token: string; lookId: string | null }

const clean = (raw: unknown): StreamWar | null => {
  const c = (raw ?? {}) as { token?: unknown; lookId?: unknown };
  if (typeof c.token !== "string" || !/^[a-f0-9]{24}$/.test(c.token)) return null;
  return { token: c.token, lookId: typeof c.lookId === "string" && /^[0-9a-f-]{36}$/.test(c.lookId) ? c.lookId : null };
};

/** The war channel on an account's GameShuffle overlay, if one was added. */
export async function streamWarFor(userId: string): Promise<StreamWar | null> {
  const { data } = await createServiceClient().from(TABLE).select("config")
    .eq("owner_user_id", userId).eq("module_id", MODULE).eq("game_slug", GAME).maybeSingle();
  return clean((data as { config?: unknown } | null)?.config);
}

/** Puts a war channel on the account's GameShuffle overlay (replacing any other) and turns the piece on. */
export async function setStreamWar(userId: string, war: StreamWar): Promise<boolean> {
  const { error } = await createServiceClient().from(TABLE).upsert(
    { owner_user_id: userId, module_id: MODULE, game_slug: GAME, config: { token: war.token, lookId: war.lookId }, updated_at: new Date().toISOString() },
    { onConflict: "owner_user_id,module_id,game_slug" },
  );
  if (error) { console.error("[wars] stream piece save failed:", error.message); return false; }
  cache.delete(userId);
  // Off by default in format.ts (most streamers never add one); adding a channel is the yes.
  const profiles = await getLayoutProfiles(userId);
  for (const format of ["landscape", "portrait"] as OverlayFormat[]) {
    const cur = profiles[format] ?? { safeArea: null, elements: {} };
    if (cur.elements.war?.enabled) continue;
    await saveLayoutProfile(userId, format, { ...cur, elements: { ...cur.elements, war: { ...cur.elements.war, enabled: true } } });
  }
  return true;
}

export async function clearStreamWar(userId: string): Promise<void> {
  await createServiceClient().from(TABLE).delete().eq("owner_user_id", userId).eq("module_id", MODULE).eq("game_slug", GAME);
  cache.delete(userId);
}

const cache = new Map<string, { at: number; value: StreamWar | null }>();
/** For the overlay's 2-second read: the war channel to show, only while the owner has GS Pro (cached 10s). */
export async function warPieceFor(ownerUserId: string): Promise<StreamWar | null> {
  const hit = cache.get(ownerUserId);
  if (hit && Date.now() - hit.at < 10_000) return hit.value;
  let value: StreamWar | null = null;
  try {
    const war = await streamWarFor(ownerUserId);
    if (war) {
      const { isProUser } = await import("@/lib/subscription-server");
      if (await isProUser(ownerUserId)) value = war;
    }
  } catch (e) { console.error("[wars] stream piece read:", e); }
  cache.set(ownerUserId, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return value;
}
