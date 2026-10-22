import "server-only";

/**
 * The night's lounge run as one field on the Discord end-of-stream recap (GS Pro, MMR card
 * owners; competitive dashboard picks 2026-10-20). Null when there's nothing to say.
 */

import { isProUser } from "@/lib/subscription-server";
import { cardFor, liveFor } from "@/lib/mmr/store";
import { MMR_GAMES, fmtMmr, signed } from "@/lib/mmr/rules";
import { nightRecap } from "./recap";

export async function loungeRecapField(ownerUserId: string, sinceIso: string): Promise<{ name: string; value: string; inline: boolean } | null> {
  const card = await cardFor(ownerUserId);
  if (!card || (!card.loungeName && !card.loungePlayerId)) return null;
  if (!(await isProUser(ownerUserId))) return null;
  const live = await liveFor(card, { since: sinceIso });
  if (!live.ok) return null;
  const r = nightRecap(live.source);
  if (!r.events) return null;
  const parts = [
    `${signed(r.net)} · ${r.wins}-${r.losses}`,
    `now ${r.mmr != null ? fmtMmr(r.mmr) : "?"} ${r.division}`,
    r.newDivisions.length ? `into ${r.newDivisions[r.newDivisions.length - 1]}` : null,
  ].filter(Boolean);
  return { name: `Lounge tonight · ${MMR_GAMES[live.source.game].short}`, value: parts.join(" · "), inline: false };
}
