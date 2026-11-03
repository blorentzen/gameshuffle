"use client";

/**
 * The Layout editor's line under the War score piece: which channel's wars it follows (and a way to stop), or how to
 * add one, since the piece is set up from a war channel's overlay page rather than here.
 */

import { Button } from "@empac/cascadeds";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";

export interface StreamWarView { token: string; lookId: string | null; channel: string | null; server: string | null; setupUrl: string }

export function WarPieceNote({ war, pro, onRemoved }: { war: StreamWarView | null; pro: boolean; onRemoved: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const where = war?.channel ? `#${war.channel}${war.server ? ` in ${war.server}` : ""}` : "your war channel";

  const remove = async () => {
    const ok = await confirm({ title: "Stop showing the war?", body: `Wars from ${where} leave your GameShuffle overlay. Its own OBS link keeps working.`, confirmLabel: "Stop showing it" });
    if (!ok) return;
    const res = await fetch("/api/war/stream", { method: "DELETE" }).catch(() => null);
    if (res?.ok) { toast.success("The war is off your overlay."); onRemoved(); }
    else toast.error("Couldn't change it. Try again in a moment.");
  };

  if (!war) {
    return (
      <p className="overlay-piece-note">
        This is a made-up war. To show your team&apos;s, press <strong>Overlay link</strong> on a war card in Discord, then <strong>Add to my GameShuffle overlay</strong>.
      </p>
    );
  }
  return (
    <div className="overlay-piece-note">
      <p>
        Follows every war in {where}, in the look you saved there{pro ? "" : ". It shows again once you have GS Pro"}. Between wars the preview shows a made-up one.
      </p>
      <div className="overlay-piece-note__actions">
        <ArrowLink href={war.setupUrl}>Change the look</ArrowLink>
        <Button variant="ghost" size="small" onClick={remove}>Stop showing it</Button>
      </div>
    </div>
  );
}
