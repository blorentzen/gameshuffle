"use client";

/**
 * "Share the night" (free, lounge night picks 2026-10-20): one Share button that hands a picture
 * card of a lounge night (+180, 5-1, into Master, the division's emblem) and its link
 * gameshuffle.co/r/<code> to the phone's share sheet, or our share window on a computer.
 *
 * Only for the signed-in owner of a confirmed lounge player (lounge_links) in that game: the
 * server works the card out from MKCentral and refuses anyone else, and the button then falls
 * back to sharing the text and the lounge page. Render it on the owner's own views only.
 */

import { useCallback, useMemo } from "react";
import { ShareButton } from "@/components/share/ShareButton";
import type { MmrGame } from "@/lib/mmr/rules";
import { loungePagePath } from "@/lib/lounge/lines";
import { loungeShareText } from "@/lib/lounge/night";
import type { NightRecap } from "@/lib/lounge/recap";
import type { ShareRequest } from "@/lib/share/types";

export function LoungeShareNight({ game, name, night = null, recap = null, label = "Share the night", variant = "secondary" }: {
  /** The lounge game the night was played in. */
  game: MmrGame;
  /** The player's lounge name (for the text and the fallback link). */
  name: string;
  /** The night's Pacific day (YYYY-MM-DD, 6am to 6am); the latest night with events when left out. */
  night?: string | null;
  /** That night's recap, for the text beside the picture (`nightFor(...).recap` or `nightRecap(...)`). */
  recap?: Pick<NightRecap, "net" | "wins" | "losses" | "squares" | "newDivisions"> | null;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const request = useMemo<ShareRequest>(() => ({ kind: "lounge", lounge: { game, night } }), [game, night]);
  const text = useCallback((url: string) => loungeShareText(name, recap, url), [name, recap]);
  return (
    <ShareButton
      request={request}
      text={text}
      game="lounge"
      fallbackUrl={`https://www.gameshuffle.co${loungePagePath(name, game)}`}
      title="My lounge night"
      label={label}
      variant={variant}
    />
  );
}
