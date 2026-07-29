"use client";

/**
 * "Turn info" affordance — lives with the coin/dice utilities on the battle
 * line (it's reference info you reach for mid-turn, not a top-of-app control).
 * Self-contained: owns its modal open state.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconInfoCircle } from "@tabler/icons-react";
import { TurnInfoModal } from "./TurnInfoModal";

export function TurnInfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="small"
        iconBefore={IconInfoCircle}
        onClick={() => setOpen(true)}
        title="Turn information"
      >
        Turn info
      </Button>
      <TurnInfoModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
