import "server-only";

/**
 * New players joining a lounge (automation pick 5, name/web pick 7A): a player not on the lounge yet asks to join under
 * a name, from Discord (/ranked join) or the lounge's page. MKCentral is checked by their Discord id (one profile, a
 * Switch friend code, not banned, not already someone else here). With the lounge's switch on and the check passing,
 * they're added on the spot and start from their MKCentral record; otherwise staff decide on the Players tab.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";
import { MODES, modeOf } from "./modes";
import { mkcProfileFor, startFromMkc } from "./mkcStart";
import { verificationCheck, NAME_MAX, type MkcProfile } from "./playerChecks";
import { nameKey } from "./rules";
import { createRequest, logAction, BOT_ACTOR, type Actor } from "./staffStore";
import { playerByName, playerForDiscord, type LadderPlayer } from "./store";
import type { Ladder } from "./types";

const db = () => createServiceClient();

export type JoinAsk =
  | { ok: true; joined: true; player: LadderPlayer; line: string | null }
  | { ok: true; joined: false; why: string }
  | { ok: false; text: string };

const shapeOk = (name: string) => /^[\p{L}\p{N} ._-]{2,}$/u.test(name) && name.length <= NAME_MAX;

/** Adds the player (their Discord and MKCentral profile on them) and starts them from MKCentral. */
async function addPlayer(ladder: Ladder, name: string, discordId: string, mkcId: number | null, actor: Actor): Promise<{ player: LadderPlayer; line: string | null } | null> {
  const { error } = await db().from("ladder_players").insert({ ladder_id: ladder.id, name, name_key: nameKey(name), discord_id: discordId, mkc_id: mkcId || null });
  if (error) return null;
  const player = (await playerForDiscord(ladder.id, discordId))!;
  await logAction(ladder, actor, "join", { playerId: player.id, detail: { name } });
  const start = await startFromMkc(ladder, player).catch(() => null);
  return { player, line: start?.line ?? null };
}

export async function askToJoin(ladder: Ladder, by: { id: string; name: string }, wanted: string): Promise<JoinAsk> {
  const name = wanted.trim().slice(0, 32);
  const mine = await playerForDiscord(ladder.id, by.id);
  if (mine) return { ok: false, text: `You're already on ${ladder.name} as ${mine.name}.` };
  if (!shapeOk(name)) return { ok: false, text: `Names are 2 to ${NAME_MAX} letters, numbers, spaces, dots, dashes or underscores.` };
  if (isBlockedText(name)) return { ok: false, text: "Pick another name." };
  if (await playerByName(ladder.id, name)) return { ok: false, text: `Someone on ${ladder.name} already has that name. If it's you, claim it instead.` };
  const { data: open } = await db().from("ladder_requests").select("id").eq("ladder_id", ladder.id).eq("kind", "join").eq("status", "open").eq("by_id", by.id).limit(1);
  if (open?.length) return { ok: true, joined: false, why: "You already asked to join; the staff will get to it." };

  let profile: MkcProfile | null = null;
  let lookupFailed = false;
  try { profile = await mkcProfileFor(by.id, MODES[modeOf(ladder)].mkcGame); } catch { lookupFailed = true; }
  let mkcTaken = false;
  if (profile?.id) {
    const { data } = await db().from("ladder_players").select("id").eq("ladder_id", ladder.id).eq("mkc_id", profile.id).limit(1);
    mkcTaken = !!data?.length;
  }
  const check = lookupFailed ? null : verificationCheck({ profiles: profile ? [profile] : [], discordOnLadder: false, mkcIdOnLadder: mkcTaken });
  if (check?.ok && ladder.settings.staff.autoJoin) {
    const added = await addPlayer(ladder, name, by.id, profile?.id ?? null, BOT_ACTOR);
    if (added) return { ok: true, joined: true, ...added };
  }
  // Problems only the player can fix come straight back when the lounge verifies players itself.
  if (check && !check.ok && check.to === "player" && ladder.settings.staff.autoJoin) return { ok: false, text: check.text };
  await createRequest(ladder, {
    kind: "join", by, body: {
      name, discordId: by.id, mkcId: profile?.id ?? null, mkcName: profile?.name ?? null,
      why: lookupFailed ? "MKCentral didn't answer, so staff check this one." : check && !check.ok ? check.text : null,
    },
  });
  return { ok: true, joined: false, why: check && !check.ok && check.to === "staff" ? check.text : "The staff verify new players on this lounge; you'll be on it once they do." };
}

/** Staff accept a join request: the player is added and starts from MKCentral. */
export async function acceptJoin(ladder: Ladder, body: Record<string, unknown>, actor: Actor): Promise<"ok" | "taken" | "failed"> {
  const name = String(body.name ?? "").trim().slice(0, 32);
  const discordId = String(body.discordId ?? "");
  if (!name || !/^\d{5,25}$/.test(discordId)) return "failed";
  if (await playerForDiscord(ladder.id, discordId)) return "ok";
  if (await playerByName(ladder.id, name)) return "taken";
  const added = await addPlayer(ladder, name, discordId, typeof body.mkcId === "number" ? body.mkcId : null, actor);
  return added ? "ok" : "failed";
}
