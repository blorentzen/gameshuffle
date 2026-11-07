"use client";

/**
 * "Add a time": opens the add form in a window. Signed out, a game space's button opens the sign-up sheet and the form
 * opens by itself on the way back (`sheet`, journeys 4A); elsewhere it sends the visitor to make an account and back.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@empac/cascadeds";
import { IconPlus } from "@tabler/icons-react";
import { TimeTrialAdd, type TtChallenge } from "./TimeTrialAdd";
import { JoinSheet, useThen, type SheetContext } from "@/components/games/JoinSheet";
import type { TtClass, TtGame } from "@/lib/timeTrials/tracks";
import type { TtItems, TtVehicle } from "@/lib/timeTrials/categories";

export function AddTimeButton({ game, track, cc, items, vehicle, signedIn, returnTo, variant = "primary", label = "Add a time", challenge, title = "Add a time", sheet }: {
  game: TtGame; track?: string | null; cc?: TtClass | null; items?: TtItems; vehicle?: TtVehicle; signedIn: boolean; returnTo: string; variant?: "primary" | "secondary"; label?: string;
  /** A game space's time trial challenge (the form's game, tracks, speed and items are fixed). */
  challenge?: TtChallenge;
  title?: string;
  /** In a game space: the sign-up sheet for visitors, and the action name the space comes back with. */
  sheet?: { space: string; then: string; context?: SheetContext };
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [asking, setAsking] = useState(false);
  const router = useRouter();
  useThen(sheet?.then ?? "", signedIn && !!sheet, () => setOpen(true));
  if (!signedIn) {
    if (sheet) {
      return (
        <>
          <Button variant={variant} iconBefore={IconPlus} onClick={() => setAsking(true)} aria-haspopup="dialog">{label}</Button>
          <JoinSheet
            open={asking} onClose={() => setAsking(false)} space={sheet.space} action={sheet.then}
            heading="Add your time" context={sheet.context ?? { title }}
            body="Free. Your time goes on the board with its screenshot, and your best times stay on your You tab."
          />
        </>
      );
    }
    return <Button variant={variant} iconBefore={IconPlus} onClick={() => router.push(`/signup?redirect=${encodeURIComponent(returnTo)}`)}>{label}</Button>;
  }
  return (
    <>
      <Button variant={variant} iconBefore={IconPlus} onClick={() => setOpen(true)}>{label}</Button>
      <Modal
        isOpen={open}
        onClose={() => { setOpen(false); if (added) { setAdded(false); router.refresh(); } }}
        title={title}
        size="medium"
      >
        <TimeTrialAdd game={game} track={track} cc={cc} items={items} vehicle={vehicle} onAdded={() => setAdded(true)} challenge={challenge} />
      </Modal>
    </>
  );
}
