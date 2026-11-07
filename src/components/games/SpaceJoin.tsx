"use client";

/**
 * Join a game space (phone picks 2026-11-05, 5A and 7A). Joining puts the game in your games (the home's doors, the
 * profile's Plays); the button says Joined after. A visitor gets the sign-up sheet and comes back joined (journeys 4A).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { JoinSheet, useThen } from "@/components/games/JoinSheet";

export function SpaceJoin({ space, name, joined: initial, signedIn, size = "medium" }: {
  space: string; name: string; joined: boolean; signedIn: boolean; size?: "small" | "medium";
}) {
  const router = useRouter();
  const toast = useToast();
  const [joined, setJoined] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);

  async function toggle() {
    if (!signedIn) { setAsk(true); return; }
    const next = !joined;
    setBusy(true);
    setJoined(next);
    const r = await fetch(`/api/games/${space}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ join: next }) }).catch(() => null);
    setBusy(false);
    const j = (await r?.json().catch(() => null)) as { error?: string } | null;
    if (!r?.ok) {
      setJoined(!next);
      toast.error(j?.error === "full" ? "Your games are full (12). Take one out on your profile first." : "That didn't save. Try again.");
      return;
    }
    track(EVENTS.homeSectionClicked, { to: next ? `space-join-${space}` : `space-leave-${space}`, from: "space" });
    router.refresh();
  }

  // Back from the sign-up sheet with ?then=join: join the space they tapped Join on (journeys 4A).
  useThen("join", signedIn, () => { if (!joined) void toggle(); });

  return (
    <>
      <Button
        variant={joined ? "secondary" : "primary"} size={size} iconBefore={joined ? IconCheck : IconPlus}
        onClick={() => void toggle()} disabled={busy} aria-pressed={signedIn ? joined : undefined}
        className={joined ? "space-join space-join--on" : "space-join"}
      >
        {joined ? "Joined" : signedIn ? "Join" : "Join free"}<span className="sr-only"> the {name} space</span>
      </Button>
      {!signedIn && (
        <JoinSheet
          open={ask} onClose={() => setAsk(false)} space={space} action="join"
          heading={`Join the ${name} space`}
          body="Free. Your times, builds and streaks stay here, and you hear when a cup or a night starts."
        />
      )}
    </>
  );
}
