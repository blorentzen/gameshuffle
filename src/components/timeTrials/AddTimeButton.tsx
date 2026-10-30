"use client";

/** "Add a time": opens the add form in a window, or sends a signed-out visitor to sign in and back. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@empac/cascadeds";
import { IconPlus } from "@tabler/icons-react";
import { TimeTrialAdd } from "./TimeTrialAdd";
import type { TtClass, TtGame } from "@/lib/timeTrials/tracks";

export function AddTimeButton({ game, track, cc, signedIn, discordLinked = true, returnTo, variant = "primary", label = "Add a time" }: {
  game: TtGame; track?: string | null; cc?: TtClass | null; signedIn: boolean; discordLinked?: boolean; returnTo: string; variant?: "primary" | "secondary"; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const router = useRouter();
  if (!signedIn) {
    return <Button variant={variant} iconBefore={IconPlus} onClick={() => router.push(`/login?redirect=${encodeURIComponent(returnTo)}`)}>{label}</Button>;
  }
  return (
    <>
      <Button variant={variant} iconBefore={IconPlus} onClick={() => setOpen(true)}>{label}</Button>
      <Modal
        isOpen={open}
        onClose={() => { setOpen(false); if (added) { setAdded(false); router.refresh(); } }}
        title="Add a time"
        size="medium"
      >
        <TimeTrialAdd game={game} track={track} cc={cc} onAdded={() => setAdded(true)} discordLinked={discordLinked} returnTo={returnTo} />
      </Modal>
    </>
  );
}
