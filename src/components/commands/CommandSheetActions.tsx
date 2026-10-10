"use client";

/** Print and Copy for Discord on a streamer's public commands page. */

import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export function CommandSheetActions({ discordText }: { discordText: string }) {
  const toast = useToast();
  return (
    <div className="cmd-sheet__actions">
      <Button variant="secondary" size="small" onClick={() => window.print()}>Print</Button>
      <Button
        variant="secondary"
        size="small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(discordText);
            toast.success("Copied. Paste it into a Discord message and pin it.");
          } catch {
            toast.error("Couldn't copy. Select the list and copy it instead.");
          }
        }}
      >
        Copy for Discord
      </Button>
    </div>
  );
}
