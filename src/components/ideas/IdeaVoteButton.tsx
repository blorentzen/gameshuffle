"use client";

/**
 * Vote toggle for an idea. Optimistic; reverts on failure. Only interactive on
 * `public` ideas (voting closes once an idea leaves public, §5.1) — otherwise
 * it renders the frozen count. Anonymous users are routed to login.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export function IdeaVoteButton({
  ideaId,
  voted,
  count,
  votable,
}: {
  ideaId: string;
  voted: boolean;
  count: number;
  votable: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [v, setV] = useState(voted);
  const [c, setC] = useState(count);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!user) {
      router.push(`/login?redirect=/ideas/${ideaId}`);
      return;
    }
    if (!votable || busy) return;
    const prevV = v;
    const prevC = c;
    const next = !v;
    setV(next);
    setC(c + (next ? 1 : -1));
    setBusy(true);
    const res = await fetch(`/api/ideas/${ideaId}/vote`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setV(prevV);
      setC(prevC);
      return;
    }
    const d = (await res.json().catch(() => null)) as { voted?: boolean } | null;
    if (d && typeof d.voted === "boolean") setV(d.voted);
  }

  return (
    <button
      type="button"
      className={`idea-vote${v ? " idea-vote--on" : ""}`}
      onClick={() => void toggle()}
      disabled={busy || !votable}
      aria-pressed={v}
      aria-label={votable ? (v ? "Remove your vote" : "Vote for this idea") : `${c} votes`}
    >
      <span className="idea-vote__arrow" aria-hidden>
        ▲
      </span>
      <span className="idea-vote__count">{c}</span>
    </button>
  );
}
