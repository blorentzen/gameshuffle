"use client";

/**
 * Settle chaos challenges from the control room. Each challenge gets Done or
 * Not done. A challenge pegged to one viewer pays them (or takes the penalty)
 * straight away; an open one asks "Who did it?" and pays each person picked.
 * Data from /api/hub/challenges (the streamer, or a Full mod on their page).
 */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Checkbox, EmptyState, Modal } from "@empac/cascadeds";
import { IconFlag } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";

interface Challenge { id: string; text: string; reward: number; penalty: number; targetName: string | null; state: "open" | "needs_winner"; secret: boolean }
interface Candidate { identityId: string; name: string; from: "lobby" | "chat" }

const ERRORS: Record<string, string> = {
  pick_someone: "Pick who did it first.",
  too_many: "Pick up to 10 people.",
  already_settled: "That challenge was already settled.",
  not_found: "That challenge is gone.",
};

export function ChallengesModal({ sessionId, isOpen, onClose, onSettled }: { sessionId: string; isOpen: boolean; onClose: () => void; onSettled: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ challenges: Challenge[]; candidates: Candidate[] } | null>(null);
  const [picking, setPicking] = useState<Challenge | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/hub/challenges?session=${encodeURIComponent(sessionId)}`, { cache: "no-store" }).then((res) => res.json()).catch(() => null);
    setData(r?.ok ? { challenges: r.challenges, candidates: r.candidates } : { challenges: [], candidates: [] });
  }, [sessionId]);
  useEffect(() => { if (isOpen) void Promise.resolve().then(load); }, [isOpen, load]);

  const settle = async (c: Challenge, done: boolean, winners: string[] = []) => {
    setBusy(true);
    const r = await fetch("/api/hub/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: sessionId, challengeId: c.id, done, winners }) })
      .then(async (res) => ({ ok: res.ok, j: await res.json().catch(() => ({})) })).catch(() => ({ ok: false, j: {} as { error?: string } }));
    setBusy(false);
    if (!r.ok) { toast.error(ERRORS[(r.j as { error?: string }).error ?? ""] ?? "That didn't go through. Try again."); return; }
    const paid = (r.j as { paid?: number }).paid ?? 0;
    toast.success(done ? (paid ? `Paid ${paid} tokens.` : "Marked done.") : "Marked not done.");
    setPicking(null);
    setChosen(new Set());
    onSettled();
    void load();
  };

  const done = (c: Challenge) => {
    // An open challenge with a reward needs to know who did it.
    if (!c.targetName && c.reward > 0) { setPicking(c); setChosen(new Set()); return; }
    void settle(c, true);
  };

  const toggle = (id: string) => setChosen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { setPicking(null); onClose(); }}
      title={picking ? "Who did it?" : "Challenges"}
      size="medium"
      primaryAction={picking ? { label: busy ? "Paying…" : chosen.size ? `Pay ${chosen.size} ${chosen.size === 1 ? "person" : "people"}` : "Pick who did it", onClick: () => { if (!busy && chosen.size) void settle(picking, true, [...chosen]); } } : undefined}
      secondaryAction={picking ? { label: "Back", onClick: () => setPicking(null) } : undefined}
    >
      {!data ? (
        <LoadingLines label="Loading challenges" />
      ) : picking ? (
        <div className="hub-challenges">
          <p className="hub-challenges__lead"><strong>{picking.text}</strong>. Everyone you pick gets {picking.reward} tokens.</p>
          {data.candidates.length === 0 ? (
            <p className="hub-challenges__empty">Nobody in the lobby or chat has a wallet yet, so there&apos;s nobody to pay.</p>
          ) : (
            <ul className="hub-challenges__people">
              {data.candidates.map((p) => (
                <li key={p.identityId}>
                  <Checkbox id={`ch-${p.identityId}`} label={`${p.name}${p.from === "lobby" ? " · lobby" : ""}`} checked={chosen.has(p.identityId)} onChange={() => toggle(p.identityId)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : data.challenges.length === 0 ? (
        <EmptyState variant="bordered" icon={<IconFlag size={28} />} title="Nothing to settle" description="Challenges from !chaos and !random show up here while they're waiting on you." />
      ) : (
        <ul className="hub-challenges__list">
          {data.challenges.map((c) => (
            <li key={c.id} className="hub-challenges__row">
              <div className="hub-challenges__text">
                <p className="hub-challenges__title">{c.text}</p>
                <p className="hub-challenges__meta">
                  {c.targetName ? `For ${c.targetName}` : "Anyone in the stream"}
                  {c.reward ? ` · ${c.reward} tokens if done` : ""}
                  {c.penalty && c.targetName ? ` · costs ${c.penalty} if not` : ""}
                  {c.secret && <> · <Badge size="small" variant="default">Secret</Badge></>}
                  {c.state === "needs_winner" && <> · <Badge size="small" variant="warning">Done, nobody paid yet</Badge></>}
                </p>
              </div>
              <div className="hub-challenges__actions">
                <Button size="small" variant="secondary" disabled={busy} onClick={() => done(c)}>{c.state === "needs_winner" ? "Pick who did it" : "Done"}</Button>
                {c.state === "open" && <Button size="small" variant="ghost" disabled={busy} onClick={() => void settle(c, false)}>Not done</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
