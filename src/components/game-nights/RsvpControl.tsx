"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
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
  const toast = useToast();
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
      const j = (await res.json().catch(() => null)) as { status?: RsvpStatus; error?: string; pay?: boolean } | null;
      if (res.ok) {
        setStatus(j?.status ?? next);
        if (j?.status === "waitlisted") toast.info("It's full, so you're on the waitlist.");
        router.refresh();
      } else if (j?.pay) {
        toast.info("Pick your ticket to claim the spot. It's held for you.");
        document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        toast.error(j?.error ?? "Couldn't save your RSVP. Try again.");
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
          variant={status === o.value || (o.value === "going" && (status === "waitlisted" || status === "offered")) ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => set(o.value)}
        >
          {o.value === "going" && status === "waitlisted" ? "On the waitlist" : o.value === "going" && status === "offered" ? "Claim my spot" : o.label}
        </Button>
      ))}
    </div>
  );
}
