"use client";

/**
 * LivePollCard — the viewer face of a live poll on /live. Shows the community's
 * currently-open poll; tap an option to vote (one vote per browser via the anon
 * sessionStorage id, changeable while open). Light interval refresh keeps the
 * tally current; hidden entirely when nothing is open.
 */

import { useEffect, useState } from "react";
import { useAnonViewerId } from "./useAnonViewerId";
import type { Poll, PollTally } from "@/lib/polls/types";

export function LivePollCard({ communityId }: { communityId: string | null }) {
  const anonId = useAnonViewerId();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [tally, setTally] = useState<PollTally | null>(null);
  const [voted, setVoted] = useState<Record<string, string>>({});
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (!communityId) return;
    let active = true;
    const fetchPoll = async () => {
      const d = await fetch(`/api/polls/community/${communityId}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
      if (!active || !d?.ok) return;
      setPoll(d.poll ?? null);
      setTally(d.tally ?? null);
    };
    void fetchPoll();
    const iv = window.setInterval(fetchPoll, 3500);
    return () => {
      active = false;
      window.clearInterval(iv);
    };
  }, [communityId]);

  if (!poll) return null;
  const myVote = voted[poll.id] ?? null;
  const total = tally?.total ?? 0;

  async function vote(optionId: string) {
    if (!poll || !anonId || voting) return;
    setVoting(true);
    setVoted((v) => ({ ...v, [poll.id]: optionId })); // optimistic highlight
    const res = await fetch(`/api/polls/${poll.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId, anonSessionId: anonId }),
    });
    setVoting(false);
    if (res.ok) {
      const d = await res.json().catch(() => null);
      if (d?.tally) setTally(d.tally as PollTally);
    }
  }

  return (
    <section className="live-poll" aria-label="Live poll">
      <div className="live-poll__head">
        <span className="live-poll__eyebrow">Poll</span>
        <h2 className="live-poll__question">{poll.question}</h2>
      </div>
      <ul className="live-poll__options">
        {poll.options.map((o) => {
          const count = tally?.byOption[o.id] ?? 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const mine = myVote === o.id;
          return (
            <li key={o.id}>
              <button
                type="button"
                className={`live-poll__opt${mine ? " live-poll__opt--mine" : ""}`}
                onClick={() => void vote(o.id)}
                disabled={voting}
                aria-pressed={mine}
              >
                <span className="live-poll__opt-fill" style={{ width: `${pct}%` }} aria-hidden />
                <span className="live-poll__opt-label">{o.label}</span>
                <span className="live-poll__opt-pct">{pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="live-poll__foot">
        {total} vote{total === 1 ? "" : "s"}
        {myVote ? " · tap another option to change your vote" : " · tap to vote"}
      </p>
    </section>
  );
}
