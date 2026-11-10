import "server-only";

/**
 * Live war cards after a team card changes (its tags, name, logo setting or MKCentral link), from Discord or the
 * Teams page: each live war in the server showing one of the team's tags takes the team as its card now says, then
 * redraws.
 */

import { liveWarsIn, setSide } from "./store";
import { editCard } from "./discord";
import { teamFromTag } from "./typed";
import { tagKey } from "./tags";
import type { WarGame } from "./rules";

export async function redrawSides(guildId: string, tags: string[], game: WarGame = "mk8dx"): Promise<void> {
  const keys = tags.map(tagKey);
  for (const w of await liveWarsIn(guildId)) {
    let touched = false;
    for (const side of ["us", "them"] as const) {
      if (!keys.includes(tagKey(w[side].tag))) continue;
      await setSide(w.id, side, await teamFromTag(guildId, w[side].tag, w.game ?? game));
      touched = true;
    }
    if (touched) await editCard(w.id);
  }
}
