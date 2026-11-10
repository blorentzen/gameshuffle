"use client";

/**
 * Today's Choose button on Home (Home and dailies picks 2026-11-09): opens the "Your dailies" sheet; when it closes,
 * Home reloads its data so Today shows the dailies you picked.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { DailyPicksSheet, useDailyPicks, type DailyPicksSeed } from "@/components/originals/DailyPicks";

export function TodayChoose({ seed }: { seed: DailyPicksSeed }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { canChoose } = useDailyPicks(seed);
  if (!canChoose) return null;
  return (
    <>
      <Button variant="ghost" size="small" iconBefore={IconAdjustmentsHorizontal} onClick={() => setOpen(true)}>Choose</Button>
      <DailyPicksSheet open={open} onClose={() => { setOpen(false); router.refresh(); }} />
    </>
  );
}
