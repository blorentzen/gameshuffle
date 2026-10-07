"use client";

/**
 * "Block" affordance on a public profile. Signed-in only, hidden on your own
 * profile. On success refreshes so the now-blocked profile renders its
 * hidden state. Unblocking happens in account → Security.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";

export function BlockProfileButton({ targetUserId }: { targetUserId: string }) {
  const confirm = useConfirm();
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!user || user.id === targetUserId) return null;

  async function block() {
    if (!(await confirm({ title: "Block this account?", body: "You won’t see each other’s profiles.", confirmLabel: "Block" }))) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedUserId: targetUserId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="report-profile-trigger"
      disabled={busy}
      onClick={() => void block()}
    >
      🚫 Block
    </button>
  );
}
