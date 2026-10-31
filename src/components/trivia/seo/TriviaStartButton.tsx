"use client";

/**
 * "Host a trivia night" on the trivia pages for search: starts a night from a
 * template (or from a game's questions) and opens the builder. Signed out, it
 * goes to sign-up first and comes back to the page it was pressed on.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";

export function TriviaStartButton({ templateId = "party", topic, label, returnTo, variant = "primary" }: {
  templateId?: string;
  /** A question topic slug: the night is filled with that game's questions. */
  topic?: string;
  label: string;
  /** Where sign-up brings them back to. */
  returnTo: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/trivia/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, topic }) });
      if (res.status === 401) { router.push(`/signup?redirect=${encodeURIComponent(returnTo)}`); return; }
      const d = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null;
      if (d?.ok && d.id) {
        track(EVENTS.triviaNightCreated, { template: topic ? `topic:${topic}` : templateId });
        router.push(`/trivia/host/${d.id}`);
        return;
      }
      toast.error(d?.error === "not_ready" ? "Trivia needs a quick update on our side first." : "Couldn't start a night. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return <Button variant={variant} loading={busy} onClick={() => void start()}>{label}</Button>;
}
