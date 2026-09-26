"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import type { RsvpStatus } from "@/lib/game-nights/types";

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
      <Link href={`/login?redirect=/game-nights/${nightId}`} style={{ textDecoration: "none" }}>
        <Button variant="primary">Sign in to RSVP</Button>
      </Link>
    );
  }

  async function set(next: RsvpStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/game-nights/${nightId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as { status?: RsvpStatus } | null;
        setStatus(j?.status ?? next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bgn-rsvp">
      {status === "waitlisted" && (
        <p className="bgn-rsvp__note">
          This night is full. You&rsquo;re on the waitlist and will be moved in automatically if a spot opens.
        </p>
      )}
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          variant={status === o.value || (o.value === "going" && status === "waitlisted") ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => set(o.value)}
        >
          {o.value === "going" && status === "waitlisted" ? "On the waitlist" : o.label}
        </Button>
      ))}
    </div>
  );
}
