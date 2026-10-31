"use client";

/** Confirm (or check again) the signed-in account's lounge names by its Discord account. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";

export function LoungeConfirm({ again = false }: { again?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/lounge/confirm", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { links?: unknown[]; error?: string };
      if (j.error === "no_discord") toast.warning("Link your Discord account first, in Settings ▸ Sign-in & security.");
      else if (j.error === "slow_down") toast.warning("Give it a minute before checking again.");
      else if (j.error === "unavailable") toast.warning("MKCentral didn't answer for every game. Try again in a minute.");
      else if (!res.ok) toast.error("Couldn't check right now. Try again in a minute.");
      else if (!j.links?.length) toast.warning("Your Discord account isn't on the lounge yet. Register with MKCentral, then check again.");
      else { toast.success(`Confirmed in ${j.links.length} ${j.links.length === 1 ? "game" : "games"}.`); track(EVENTS.loungeConfirmed, { games: j.links.length }); }
      router.refresh();
    } finally { setBusy(false); }
  };
  return <Button variant={again ? "secondary" : "primary"} size={again ? "small" : "medium"} loading={busy} onClick={go}>{again ? "Check again" : "Confirm with Discord"}</Button>;
}
