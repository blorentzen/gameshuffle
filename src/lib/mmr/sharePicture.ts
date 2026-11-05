import "server-only";

/**
 * A shared MMR card's picture (/r/<code>/card and its link preview): the owner's card as it is now, in the look
 * that was shared. Null when the card can't be read right now (MKCentral not answering, the card removed).
 */

import { sharePlayer } from "@/lib/share/store";
import type { MmrPart } from "@/lib/share/types";
import { parsePlayer } from "@/lib/daily/boardRules";
import { ownPicture } from "./pictureData";
import { renderMmrPicture, type PictureSize } from "./picture";

/** Kept 5 minutes in the browser and 10 at the edge (pick 7A: the link shows the card as it is now). */
export const MMR_PICTURE_CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=600";

export async function sharedMmrPicture(code: string, part: MmrPart, size: PictureSize): Promise<Buffer | null> {
  const owner = parsePlayer((await sharePlayer(code)) ?? "");
  if (owner?.kind !== "u") return null;
  const input = await ownPicture(owner.id, part.look);
  return input ? renderMmrPicture(input, size) : null;
}
