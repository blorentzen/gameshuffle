"use client";

/**
 * "Message" affordance on a public profile — starts (or opens) a DM thread and
 * pops the floating Messenger. Signed-in only, hidden on your own profile.
 * Messaging requires a mutual follow (both people follow each other); block
 * enforcement is server-side. Both surface as a toast.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { useMessenger } from "@/components/social/MessengerProvider";
import { useToast } from "@/components/toast/ToastProvider";

export function MessageButton({ targetUserId }: { targetUserId: string }) {
  const { user } = useAuth();
  const { openConversation } = useMessenger();
  const toast = useToast();
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
      const b = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && b.id) openConversation(b.id);
      else if (b.error === "not_mutual") toast.error("You can message each other once you both follow.");
      else if (b.error === "blocked") toast.error("You can't message this person.");
      else toast.error("Couldn't open the chat. Try again.");
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
