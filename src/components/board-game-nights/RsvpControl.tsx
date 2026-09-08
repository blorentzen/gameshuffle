"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import type { RsvpStatus } from "@/lib/board-game-nights/types";

const OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "declined", label: "Can't make it" },
];

export function RsvpControl({
  nightId,
  initial,
  signedIn,
}: {
  nightId: string;
  initial: RsvpStatus | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<RsvpStatus | null>(initial);
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <Link href={`/login?redirect=/board-game-nights/${nightId}`} style={{ textDecoration: "none" }}>
        <Button variant="primary">Sign in to RSVP</Button>
      </Link>
    );
  }

  async function set(next: RsvpStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/board-game-nights/${nightId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setStatus(next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bgn-rsvp">
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          variant={status === o.value ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => set(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
