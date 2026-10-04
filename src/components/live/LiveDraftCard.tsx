"use client";

/**
 * LiveDraftCard: a chat draft on /live. The picks so far, and the current vote
 * as tap-to-vote buttons (one vote per browser, changeable while the pick is
 * open), fed into the same poll as chat's !vote. Hidden when no draft is up.
 *
 * Captain drafts show sign-ups, then the board. The captain on the clock
 * (signed in, recognized by their linked Twitch) gets the picker on their phone.
 */

import { useEffect, useState } from "react";
import { Badge, Chip } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { CaptainBoard } from "@/components/drafts/CaptainBoard";
import { useAnonViewerId } from "./useAnonViewerId";
import type { StreamDraftView } from "@/lib/drafts/store";

export function LiveDraftCard({ communityId }: { communityId: string | null }) {
  const anonId = useAnonViewerId();
  const toast = useToast();
  const [draft, setDraft] = useState<StreamDraftView | null>(null);
  const [you, setYou] = useState<{ onClock: boolean; streamer: boolean } | null>(null);
  const [mine, setMine] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!communityId) return;
    let active = true;
    const load = async () => {
      const d = await fetch(`/api/drafts/community/${communityId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (active && d?.ok) { setDraft(d.draft ?? null); setYou(d.you ?? null); }
    };
    void load();
    const iv = window.setInterval(() => { void load(); setNow(Date.now()); }, 3000);
    return () => { active = false; window.clearInterval(iv); };
  }, [communityId]);

  if (!draft) return null;
  if (draft.mode === "captains" && draft.captains) {
    const cap = draft.captains;
    const pick = async (key: string) => {
      const res = await fetch(`/api/drafts/${draft.id}/pick`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const d = await res.json().catch(() => null);
      if (d?.ok) { setDraft(d.draft); setYou((y) => (y ? { ...y, onClock: false } : y)); }
      else toast.error(d?.error === "not_your_turn" ? "It's not your pick anymore." : "That pick didn't go through. Try again.");
    };
    return (
      <section className="live-poll live-draft" aria-label="Team draft">
        <div className="live-poll__head">
          <span className="live-poll__eyebrow">Team draft{draft.status === "signup" ? " · sign-ups open" : draft.status === "done" ? " · complete" : ""}</span>
          <h2 className="live-poll__question">{draft.status === "signup" ? `${cap.pool.length} signed up` : cap.teams.map((t) => t.name).join(" vs ")}</h2>
        </div>
        {draft.status === "signup" ? (
          <>
            <div className="cap-setup__chips">{cap.pool.map((e) => <Chip key={e.key} label={e.name} size="medium" variant="outline" />)}</div>
            <p className="live-poll__foot">Type !draft in in chat to get picked. Captains pick on this page (signed in with Twitch) or with !pick name.</p>
          </>
        ) : (
          <>
            <CaptainBoard c={cap} status={draft.status} youOnClock={!!you?.onClock} onPick={you?.onClock ? pick : undefined} />
            {draft.status === "open" && !you && <p className="live-poll__foot">Captain? Sign in with Twitch to pick here, or type !pick name in chat.</p>}
          </>
        )}
      </section>
    );
  }
  const c = draft.current;
  const secs = c?.closesAt ? Math.max(0, Math.ceil((Date.parse(c.closesAt) - now) / 1000)) : null;

  const vote = async (optionId: string) => {
    if (!c || !anonId) return;
    setMine((m) => ({ ...m, [c.pollId]: optionId }));
    await fetch(`/api/polls/${c.pollId}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId, anonSessionId: anonId }) }).catch(() => {});
  };

  return (
    <section className="live-poll live-draft" aria-label="Chat draft">
      <div className="live-poll__head">
        <span className="live-poll__eyebrow">Chat draft · {draft.picks.length} of {draft.slots.length}{draft.status === "done" ? " · complete" : ""}</span>
        <h2 className="live-poll__question">{draft.title}</h2>
      </div>
      <ol className="live-draft__slots">
        {draft.slots.map((s, i) => {
          const p = draft.picks[i];
          return (
            <li key={s.key} className={p ? "is-filled" : ""}>
              <span className="live-draft__label">{s.label}</span>
              <strong>{p ? p.label : i === draft.picks.length && c ? "Voting now" : "…"}</strong>
              {p?.detail && <span className="live-draft__detail">{p.detail}</span>}
            </li>
          );
        })}
      </ol>
      {c && (
        <>
          <p className="live-draft__q">{c.question}{secs !== null && <Badge variant="info" size="small">{secs}s left</Badge>}</p>
          <ul className="live-poll__options">
            {c.options.map((o) => {
              const pct = c.total ? Math.round((o.votes / c.total) * 100) : 0;
              const picked = mine[c.pollId] === o.id;
              return (
                <li key={o.id}>
                  <button type="button" className={`live-poll__opt${picked ? " live-poll__opt--mine" : ""}`} aria-pressed={picked} onClick={() => void vote(o.id)}>
                    <span className="live-poll__opt-fill" style={{ width: `${pct}%` }} aria-hidden />
                    <span className="live-poll__opt-label">{o.label}{o.detail ? ` · ${o.detail}` : ""}</span>
                    <span className="live-poll__opt-pct">{pct}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="live-poll__foot">{c.total} vote{c.total === 1 ? "" : "s"} · tap to vote, or type !vote {c.options.map((o) => o.id).join("/")} in chat</p>
        </>
      )}
    </section>
  );
}
