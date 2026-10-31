"use client";

/**
 * Share a lounge player's page from its header (lookup picks, 2026-10-21): the phone's share sheet
 * where there is one, else the link is copied with a toast. Anyone can share any player's page; the
 * owner's "Share my latest night" picture card (LoungeShareNight) is a separate button.
 */

import { Button } from "@empac/cascadeds";
import { IconShare2 } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";

export function LoungeShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const toast = useToast();
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        track(EVENTS.loungePlayerShared, { via: "share" });
        return;
      } catch (e) {
        // Closing the sheet isn't a failure; anything else falls back to copying.
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
      track(EVENTS.loungePlayerShared, { via: "copy" });
    } catch {
      toast.error("Couldn't copy the link. Copy it from the address bar.");
    }
  };
  return <Button variant="secondary" iconBefore={IconShare2} onClick={share}>Share</Button>;
}
