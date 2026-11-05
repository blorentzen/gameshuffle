import "server-only";

/**
 * What the MMR card's picture draws (picks 2026-11-04): an account's own card in its own look, or any lounge
 * player by MKCentral id, in the look of the GameShuffle account whose card shows that player (else ours).
 * The second is the public one: Discord's /mmr and a shared card's link.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { cardFor, liveFor, type MmrCard } from "./store";
import { LoungeUnavailable, loungePlayer, loungeStats } from "./mkcentral";
import { DEFAULT_LOOK } from "./look";
import { viewOf, type MmrGame } from "./rules";
import { goalProgress } from "./goal";
import type { PictureInput } from "./picture";

/** The card in one of its looks (the look in use when left out). Null when the card can't be read right now. */
export async function cardPicture(card: MmrCard, lookId?: string | null): Promise<PictureInput | null> {
  const live = await liveFor(card, { look: lookId ?? null });
  if (!live.ok) return null;
  const v = viewOf(live.source);
  // Tonight's goal counts from tonight's starting number, as on the live card.
  const goal = live.goal != null ? goalProgress(live.goal, v.mmr, v.mmr != null ? v.mmr - v.tonight.delta : null) : null;
  return { source: live.source, look: live.look, goal };
}

/** The signed-in account's own card. */
export async function ownPicture(userId: string, lookId?: string | null): Promise<PictureInput | null> {
  const card = await cardFor(userId);
  return card ? cardPicture(card, lookId) : null;
}

/** Any lounge player by MKCentral id. Null when MKCentral has no such player in that game. Throws LoungeUnavailable. */
export async function playerPicture(game: MmrGame, playerId: number): Promise<PictureInput | null> {
  const { data } = await createServiceClient().from("mmr_cards").select("user_id").eq("lounge_player_id", playerId).limit(1).maybeSingle();
  const owner = (data as { user_id: string } | null)?.user_id;
  if (owner) {
    const card = await cardFor(owner);
    const look = card?.looks.find((l) => !l.ladder && l.game === game);
    if (card && look) {
      const p = await cardPicture(card, look.id);
      if (p) return p;
    }
  }
  const [player, stats] = await Promise.all([loungePlayer({ id: playerId }, game), loungeStats(game)]);
  if (!player) return null;
  return {
    source: {
      name: player.name, country: player.country, game, mmr: player.mmr, maxMmr: player.maxMmr, division: player.division,
      worldRank: player.worldRank, steps: stats.steps, changes: player.changes, since: null, avatar: null, totalPlayers: stats.totalPlayers,
    },
    look: { ...DEFAULT_LOOK, game },
  };
}

export { LoungeUnavailable };
