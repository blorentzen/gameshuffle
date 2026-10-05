"use client";

import { useEffect, useRef } from "react";
import { EVENTS, track } from "@/lib/analytics/events";

/** Sends "Deck Viewed" once when a deck guide mounts (the page is a server component). */
export function DeckViewTracker({ deck }: { deck: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(EVENTS.deckViewed, { deck });
  }, [deck]);
  return null;
}
