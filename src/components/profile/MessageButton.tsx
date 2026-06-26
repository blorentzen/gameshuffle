"use client";

/**
 * "Message" affordance on a public profile — starts (or opens) a DM thread and
 * routes to /messages. Signed-in only, hidden on your own profile. Block
 * enforcement is server-side (start returns 403 if blocked).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";

export function MessageButton({ targetUserId }: { targetUserId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!user || user.id === targetUserId) return null;

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/messages/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: targetUserId }),
      });
      const b = (await res.json().catch(() => ({}))) as { id?: string };
      if (res.ok && b.id) router.push(`/comms?tab=messages&c=${b.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" size="small" disabled={busy} onClick={() => void start()}>
      Message
    </Button>
  );
}
