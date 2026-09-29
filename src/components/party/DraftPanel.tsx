"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Chip, Progress, Select } from "@empac/cascadeds";

/**
 * Draft Night on a phone inside a live night (a GameShuffle Original). The
 * table snake-drafts characters; each player plays only from their pool for the
 * rest of the night. When the pick clock runs out, whichever phone notices asks
 * the server to auto-pick (the server checks the clock really has run out).
 */

export interface DraftActivityView {
  slug: "draft-night";
  label: string;
  ready: boolean;
  players: number[];
  rosters: { slug: string; label: string; size: number }[];
  pickSeconds: number;
  me: number | null;
  current: null | {
    roster: string;
    rosterLabel: string;
    items: { name: string; img?: string }[];
    picks: number;
    order: number[];
    taken: { seat: number; name: string }[];
    onTheClock: number | null;
    turnStartedAt: string;
    phase: "drafting" | "done";
    pools: { seat: number; names: string[] }[];
  };
}

export function DraftPanel({ activity: a, me, seatName, busy, act }: {
  activity: DraftActivityView;
  me: { isHost: boolean; seat: number | null };
  seatName: (i: number) => string;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [roster, setRoster] = useState(a.rosters[0]?.slug ?? "");
  const [picks, setPicks] = useState("3");
  const [left, setLeft] = useState(a.pickSeconds);
  const autoFor = useRef<string | null>(null);
  const c = a.current;

  // The pick clock, and the auto-pick when it runs out (once per turn).
  useEffect(() => {
    if (!c || c.phase !== "drafting") return;
    const tick = () => {
      const remaining = Math.max(0, a.pickSeconds - Math.floor((Date.now() - Date.parse(c.turnStartedAt)) / 1000));
      setLeft(remaining);
      if (remaining === 0 && autoFor.current !== c.turnStartedAt) {
        autoFor.current = c.turnStartedAt;
        void act({ action: "dn_auto" });
      }
    };
    const t = window.setInterval(tick, 1000);
    const first = window.setTimeout(tick, 0);
    return () => { window.clearInterval(t); window.clearTimeout(first); };
  }, [c, a.pickSeconds, act]);

  if (!a.ready) return <Alert variant="info" title="Draft Night is almost here">It needs a database update before it can run in a live night.</Alert>;

  const takenBy = new Map((c?.taken ?? []).map((t) => [t.name, t.seat]));
  const myTurn = !!c && c.phase === "drafting" && c.onTheClock !== null && c.onTheClock === me.seat;
  const myPool = c?.pools.find((p) => p.seat === me.seat)?.names ?? [];

  return (
    <section className="party-section oddone">
      <div className="oddone__head">
        <h3 className="party-h3">Draft Night</h3>
        {c && <span className="party-muted">{c.rosterLabel} · {c.picks} picks each</span>}
      </div>

      {!c && (
        <>
          <p className="party-muted">Snake-draft characters on your phones. For the rest of tonight, everyone plays only from the pool they drafted.</p>
          {a.players.length < 2 && <Alert variant="warning" title="Needs two players">Draft Night needs at least two people in seats.</Alert>}
          {me.isHost && (
            <div className="party-row">
              <Select floatingLabel="Roster" value={roster} onChange={(v) => setRoster(String(v))} options={a.rosters.map((r) => ({ value: r.slug, label: r.label }))} />
              <Select floatingLabel="Picks each" value={picks} onChange={(v) => setPicks(String(v))} options={["2", "3", "4", "5"].map((n) => ({ value: n, label: `${n} picks` }))} />
              <Button variant="primary" size="small" disabled={busy || a.players.length < 2 || !roster} onClick={() => act({ action: "dn_start", roster, picks: Number(picks) })}>Start the draft</Button>
            </div>
          )}
          {!me.isHost && <p className="party-muted">Waiting for the host to start the draft.</p>}
        </>
      )}

      {c && c.phase === "drafting" && c.onTheClock !== null && (
        <div className={`likely__prompt${myTurn ? "" : " draft__clock--waiting"}`}>
          <span className="oddone__label">Pick {c.taken.length + 1} of {c.order.length * c.picks} · on the clock</span>
          <strong className="likely__text">{myTurn ? "Your pick" : seatName(c.onTheClock)}</strong>
          <Progress value={left} max={a.pickSeconds} size="small" />
          <span className="party-muted draft__secs">{left}s left, then it picks at random</span>
        </div>
      )}

      {c && c.phase === "drafting" && (
        <>
          <div className="party-chips draft__roster">
            {c.items.map((it) => {
              const who = takenBy.get(it.name);
              return (
                <Chip key={it.name} clickable={myTurn && who === undefined} disabled={who !== undefined}
                  variant={who === me.seat && who !== undefined ? "primary" : "default"} selected={who === me.seat && who !== undefined}
                  label={who !== undefined ? `${it.name} · ${seatName(who)}` : it.name}
                  onClick={() => { if (myTurn && who === undefined && !busy) void act({ action: "dn_pick", name: it.name }); }} />
              );
            })}
          </div>
          {me.isHost && !myTurn && <Button variant="ghost" size="small" disabled={busy} onClick={() => act({ action: "dn_auto" })}>Pick at random for {c.onTheClock !== null ? seatName(c.onTheClock) : "them"}</Button>}
        </>
      )}

      {c && myPool.length > 0 && c.phase === "drafting" && (
        <p className="party-muted">Your pool so far: <strong>{myPool.join(", ")}</strong></p>
      )}

      {c && c.phase === "done" && (
        <div className="oddone__reveal">
          <p className="oddone__verdict">The draft is done. Play only from your pool for the rest of the night.</p>
          <DraftPools pools={c.pools} seatName={seatName} me={me.seat} items={c.items} />
        </div>
      )}
    </section>
  );
}

/** Everyone's pools; used after the draft and in every game that follows. */
export function DraftPools({ pools, seatName, me, items }: {
  pools: { seat: number; names: string[] }[];
  seatName: (i: number) => string;
  me: number | null;
  items?: { name: string; img?: string }[];
}) {
  const art = new Map((items ?? []).map((it) => [it.name, it.img]));
  return (
    <ul className="draft__pools">
      {pools.map((p) => (
        <li key={p.seat} className="draft__pool">
          <span className="draft__pool-name">{seatName(p.seat)}{p.seat === me && <> <Badge variant="info" size="small">You</Badge></>}</span>
          <span className="draft__pool-picks">
            {p.names.map((n) => (
              <span key={n} className="tierwars__tile">
                {art.get(n) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={art.get(n)} alt="" className="tierwars__img" loading="lazy" />
                )}
                {n}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
