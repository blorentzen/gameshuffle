"use client";

/** Review access on a player's time trials page (picks 2026-11-05, 1A): staff and reviewers only, accounts only. */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconShieldCheck } from "@tabler/icons-react";
import { TtAccessWindow } from "./TtAccessWindow";

export function TtAccessButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" iconBefore={IconShieldCheck} onClick={() => setOpen(true)}>Review access</Button>
      {open && <TtAccessWindow userId={userId} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
