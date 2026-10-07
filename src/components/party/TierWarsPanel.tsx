"use client";

import { useState } from "react";
import { Alert, Button, Chip, Select } from "@empac/cascadeds";

/**
 * Tier Wars on a phone inside a live night (a GameShuffle Original). Everyone
 * ranks the same items S to D; the reveal builds the room's tier list and you
 * score a point for every item you put where the room did.
 */

type Item = { id: string; label: string; image?: string };

export interface TierActivityView {
  slug: "tier-wars";
  label: string;
  ready: boolean;
  players: number[];
  totalRounds: number;
  tiers: string[];
  topics: { id: string; label: string }[];
  current: null | {
    round: number;
    title: string;
    items: Item[];
    phase: "ranking" | "done";
    votesIn: number;
    voters: number;
    voted: number[];
    mine: Record<string, number> | null;
    reveal: null | {
      room: Record<string, number>;
      points: { seat: number; points: number }[];
      hottest: { voter: number; item: string; tier: number; room: number } | null;
    };
  };
  totals: { seat: number; points: number }[];
  history: { round: number; title: string }[];
}

const MIXED = "mixed";

export function TierWarsPanel({ activity: a, me, seatName, busy, act, gameDone }: {
  activity: TierActivityView;
  me: { isHost: boolean; seat: number | null };
  seatName: (i: number) => string;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<unknown>;
  gameDone: boolean;
}) {
  const [topic, setTopic] = useState(MIXED);
  // Unsent picks for this round, layered over what's already locked in.
  const [draft, setDraft] = useState<{ round: number; ranks: Record<string, number> } | null>(null);

  if (!a.ready) return <Alert variant="info" title="Tier Wars is almost here">It needs a database update before it can run in a live night.</Alert>;

  const c = a.current;
  const playing = me.seat !== null && a.players.includes(me.seat);
  const betweenRounds = !c || c.phase === "done";
  const standings = [...a.totals].sort((x, y) => y.points - x.points || x.seat - y.seat);
  const ranks = c ? { ...(c.mine ?? {}), ...(draft?.round === c.round ? draft.ranks : {}) } : {};
  const complete = !!c && c.items.every((it) => ranks[it.id] !== undefined);
  const changed = !!c && draft?.round === c.round && Object.keys(draft.ranks).length > 0;
  const itemLabel = (id: string) => c?.items.find((it) => it.id === id)?.label ?? "";

  return (
    <section className="party-section oddone">
      <div className="oddone__head">
        <h3 className="party-h3">Tier Wars</h3>
        <span className="party-muted">{c ? `Round ${c.round} of ${a.totalRounds}` : `${a.totalRounds} rounds`}</span>
      </div>

      {a.players.length < 3 && <Alert variant="warning" title="Needs three players">Tier Wars needs at least three people in seats. Share the code so more can join.</Alert>}
      {!c && <p className="party-muted">Everyone ranks the same six things from S to D on their phone. The reveal builds the room&apos;s tier list, and you score a point for every item you put where the room did.</p>}

      {c && (
        <div className="likely__prompt">
          <span className="oddone__label">Rank it</span>
          <strong className="likely__text">{c.title}</strong>
        </div>
      )}

      {c && c.phase === "ranking" && (
        <>
          {playing && (
            <ul className="tierwars__list">
              {c.items.map((it) => (
                <li key={it.id} className="tierwars__item">
                  <span className="tierwars__name">
                    {it.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt="" className="tierwars__img" loading="lazy" />
                    )}
                    {it.label}
                  </span>
                  <span className="tierwars__chips" role="group" aria-label={`Tier for ${it.label}`}>
                    {a.tiers.map((t, i) => (
                      <Chip key={t} clickable selected={ranks[it.id] === i} variant={ranks[it.id] === i ? "primary" : "default"} label={t}
                        onClick={() => setDraft((d) => ({ round: c.round, ranks: { ...(d?.round === c.round ? d.ranks : {}), [it.id]: i } }))} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {playing && (
            <span className="party-row">
              <Button variant="primary" size="small" disabled={busy || !complete || (!!c.mine && !changed)} onClick={async () => {
                if (await act({ action: "tw_vote", ranks })) setDraft(null);
              }}>{c.mine ? (changed ? "Update my tiers" : "Locked in") : "Lock in my tiers"}</Button>
              {!complete && <span className="party-muted">Give every item a tier first.</span>}
            </span>
          )}
          <p className="party-muted">{c.votesIn} of {c.voters} locked in{c.votesIn < c.voters ? `. Waiting on ${a.players.filter((s) => !c.voted.includes(s)).map(seatName).join(", ")}.` : ". Everyone's in."}</p>
          {me.isHost && (
            <Button variant="primary" size="small" disabled={busy || c.votesIn === 0} onClick={() => act({ action: "tw_reveal" })}>
              {c.votesIn < c.voters ? "Reveal now" : "Reveal the room's list"}
            </Button>
          )}
        </>
      )}

      {c && c.reveal && (
        <div className="oddone__reveal">
          <p className="oddone__verdict">The room&apos;s tier list</p>
          <div className="tierwars__board">
            {a.tiers.map((t, i) => {
              const inTier = c.items.filter((it) => c.reveal!.room[it.id] === i);
              return (
                <div key={t} className="tierwars__row">
                  <span className={`tierwars__tier tierwars__tier--${t.toLowerCase()}`}>{t}</span>
                  <span className="tierwars__tiles">
                    {inTier.length ? inTier.map((it) => (
                      <span key={it.id} className={`tierwars__tile${c.mine && c.mine[it.id] === i ? " tierwars__tile--match" : ""}`}>{it.label}</span>
                    )) : <span className="party-muted">Nothing</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {c.mine && <p className="party-muted">Highlighted: the ones you put where the room did.</p>}
          {c.reveal.hottest && (
            <p className="oddone__answer">Hottest take: <strong>{seatName(c.reveal.hottest.voter)}</strong> put {itemLabel(c.reveal.hottest.item)} in {a.tiers[c.reveal.hottest.tier]}. The room said {a.tiers[c.reveal.hottest.room]}.</p>
          )}
          {c.reveal.points.length > 0 && <p className="party-muted">This round: {[...c.reveal.points].sort((x, y) => y.points - x.points).map((p) => `${seatName(p.seat)} +${p.points}`).join(", ")}</p>}
        </div>
      )}

      {standings.some((s) => s.points > 0) && (
        <div>
          <p className="party-options__label">Tier Wars standings</p>
          <ul className="party-live__scores">
            {standings.map((s) => <li key={s.seat}><span>{seatName(s.seat)}</span><span className="party-muted">{s.points} pts</span></li>)}
          </ul>
        </div>
      )}

      {me.isHost && betweenRounds && !gameDone && (
        <div className="party-row">
          <Select floatingLabel="Topic" value={topic} onChange={(v) => setTopic(String(v))}
            options={[{ value: MIXED, label: "Surprise me" }, ...a.topics.map((t) => ({ value: t.id, label: t.label }))]} />
          <Button variant="primary" size="small" disabled={busy || a.players.length < 3} onClick={() => act({ action: "tw_round", topic })}>
            {c ? `Next topic (${c.round + 1})` : "First topic"}
          </Button>
          {a.history.length > 0 && <Button variant="secondary" size="small" disabled={busy} onClick={() => act({ action: "tw_finish" })}>Finish and score it</Button>}
        </div>
      )}
    </section>
  );
}
