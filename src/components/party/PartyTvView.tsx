"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { IconField } from "@/components/events/EventHeaderArt";
import { nightGame } from "@/lib/nights/games";
import type { ActivityView } from "@/components/party/OddOneOutPanel";
import { WheelOverlay } from "@/components/overlay/WheelOverlay";
import { wheelFor } from "@/data/originals/consequences";
import { LETTERS, letterFor } from "@/lib/originals/bingo";

/**
 * A live night on the big screen (chrome-free, see ConditionalChrome). Always
 * asks for the public view (`?view=tv`), so even on the host's own laptop no
 * one's secret word or card can end up on the TV.
 */

interface TvData {
  night: { code: string; gameSlug: string; status: "open" | "ended"; currentGame: number; mvpSeat: number | null; format: "gauntlet" | "chaoscup" | null; crown?: { name: string; seat: number | null; defenses: number } | null };
  games: { index: number; slug: string; status: "up" | "playing" | "done"; results: { seat: number; place: number; points: number }[] }[];
  seats: { index: number; name: string; isCpu: boolean; taken: boolean; points: number }[];
  activity: ActivityView | null;
  cards: { id: string; cardId: string; kind: string; seat: number | null; status: string; createdAt?: string }[];
  defs: Record<string, { title: string; text: string; worth?: number }>;
  calls?: { count: number; revealed: { seat: number; target: number; right: boolean }[] };
  pools?: { roster: string; pools: { seat: number; names: string[] }[] } | null;
}

const POLL_MS = 3000;

export function PartyTvView({ code }: { code: string }) {
  const [data, setData] = useState<TvData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState(`/party/${code}`);
  // When the latest poll landed: the clock for "was that spin just now?".
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch(`/api/party/${encodeURIComponent(code)}?view=tv`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setError(j.error ?? "offline"); return; }
    setError(null);
    setData(j as TvData);
    setLoadedAt(Date.now());
  }, [code]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const t = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const url = `${window.location.origin}/party/${code}`;
    QRCode.toString(url, { type: "svg", margin: 1, width: 220, color: { dark: "#0b0d14", light: "#ffffff" } })
      .then((svg) => { setQr(svg); setJoinUrl(url.replace(/^https?:\/\//, "")); })
      .catch(() => setQr(null));
  }, [code]);

  if (error === "not_found") return <main className="bgn-display party-tv"><div className="bgn-display__inner"><h1 className="bgn-display__title">No night with that code</h1></div></main>;
  if (!data) return <main className="bgn-display party-tv"><div className="bgn-display__inner"><p className="bgn-display__meta">{error ? "Reconnecting…" : "Loading the night…"}</p></div></main>;

  const name = (i: number) => data.seats.find((s) => s.index === i)?.name ?? `Seat ${i + 1}`;
  const ng = nightGame(data.night.gameSlug);
  const a = data.activity;
  const c = a && a.slug === "odd-one-out" ? a.current : null;
  const people = data.seats.filter((s) => !s.isCpu && s.taken);
  const board = [...people].sort((x, y) => y.points - x.points || x.index - y.index);
  const multi = data.games.length > 1;
  const ended = data.night.status === "ended";
  const current = data.games.find((g) => g.index === data.night.currentGame);
  // The public view only includes agendas once the game's results are in.
  const agendas = current?.status === "done" ? data.cards.filter((x) => x.cardId.startsWith("ag-") && x.seat !== null) : [];
  // A Wheel of Consequences spin from the last few seconds plays on the big screen.
  const spin = data.cards.filter((x) => x.cardId.startsWith("wc-") && x.createdAt && loadedAt - Date.parse(x.createdAt) < 14000)
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0];
  const wheel = spin ? wheelFor(spin.cardId, spin.id, data.night.gameSlug) : null;

  return (
    <main className="bgn-display party-tv">
      {spin && wheel && (
        <WheelOverlay
          key={spin.id}
          spin={{
            id: spin.id,
            segments: wheel.labels.map((label) => ({ label })),
            winningIndex: wheel.winningIndex,
            winningLabel: `${spin.seat !== null ? `${name(spin.seat)}: ` : ""}${data.defs[spin.cardId]?.title ?? ""}`,
            triggeredBy: null,
          }}
        />
      )}
      <IconField category={a ? "mystery" : "video"} seed={`tv-${code}`} opacity={0.09} className="party-tv__art" />
      <div className="bgn-display__inner">
        <header className="party-tv__head">
          <div>
            {data.night.format ? (
              <>
                <p className="bgn-display__eyebrow">{data.night.format === "gauntlet" ? "The Gauntlet · event" : "Chaos Cup · race"} {data.night.currentGame + 1} of {data.games.length}{ended ? " · final" : ""}</p>
                <h1 className="bgn-display__title">{ended ? (data.night.format === "gauntlet" ? "The Gauntlet" : "Chaos Cup") : ng?.label ?? "Game night"}</h1>
              </>
            ) : (
              <>
                <p className="bgn-display__eyebrow">Live night{multi ? ` · game ${data.night.currentGame + 1} of ${data.games.length}` : ""}{ended ? " · final" : ""}</p>
                <h1 className="bgn-display__title">{ng?.label ?? "Game night"}</h1>
              </>
            )}
          </div>
          {!ended && (
            <div className="party-tv__join">
              {qr && <span className="party-tv__qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />}
              <span className="party-tv__code">
                <span className="party-tv__code-label">Scan or go to</span>
                <span className="party-tv__code-url">{joinUrl}</span>
                <span className="party-tv__code-label">Room code</span>
                <strong className="party-tv__code-big">{data.night.code}</strong>
              </span>
            </div>
          )}
        </header>

        <div className="bgn-display__cols">
          <section className="bgn-display__panel party-tv__stage">
            {ended ? (
              <p className="party-tv__big">{data.night.mvpSeat !== null ? <><strong>{name(data.night.mvpSeat)}</strong> {data.night.format ? `is the ${data.night.format === "gauntlet" ? "Gauntlet" : "Chaos Cup"} champion` : <>is tonight&apos;s MVP</>}</> : "That's the night!"}</p>
            ) : a && !a.ready ? (
              <p className="party-tv__big">{a.label} needs a database update before it can run here.</p>
            ) : a && a.slug === "tier-wars" ? (
              !a.current ? (
                <>
                  <p className="party-tv__big">Tier Wars</p>
                  <p className="bgn-display__meta">Everyone ranks the same six things from S to D on their phone. The reveal builds the room&apos;s tier list; match the room to score.</p>
                  <p className="bgn-display__foot">{a.players.length < 3 ? "Needs at least three players. Scan to join." : "Waiting for the host's first topic."}</p>
                </>
              ) : (
                <>
                  <p className="bgn-display__eyebrow">Round {a.current.round} of {a.totalRounds} · Rank it</p>
                  <p className="party-tv__big">{a.current.title}</p>
                  {a.current.reveal ? (
                    <div className="tierwars__board tierwars__board--tv">
                      {a.tiers.map((t, i) => (
                        <div key={t} className="tierwars__row">
                          <span className={`tierwars__tier tierwars__tier--${t.toLowerCase()}`}>{t}</span>
                          <span className="tierwars__tiles">
                            {a.current!.items.filter((it) => a.current!.reveal!.room[it.id] === i).map((it) => (
                              <span key={it.id} className="tierwars__tile">
                                {it.image && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={it.image} alt="" className="tierwars__img" />
                                )}
                                {it.label}
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="tierwars__tiles tierwars__tiles--tv">
                        {a.current.items.map((it) => (
                          <span key={it.id} className="tierwars__tile">
                            {it.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.image} alt="" className="tierwars__img" />
                            )}
                            {it.label}
                          </span>
                        ))}
                      </div>
                      <div className="party-tv__voters">
                        {a.players.map((s) => <span key={s} className={`party-tv__voter${a.current!.voted.includes(s) ? " party-tv__voter--in" : ""}`}>{name(s)}</span>)}
                      </div>
                      <p className="bgn-display__foot">{a.current.votesIn} of {a.current.voters} locked in</p>
                    </>
                  )}
                  {a.current.reveal?.hottest && (
                    <p className="bgn-display__meta">Hottest take: <strong>{name(a.current.reveal.hottest.voter)}</strong> put {a.current.items.find((it) => it.id === a.current!.reveal!.hottest!.item)?.label} in {a.tiers[a.current.reveal.hottest.tier]}</p>
                  )}
                </>
              )
            ) : a && a.slug === "most-likely-to" ? (
              !a.current ? (
                <>
                  <p className="party-tv__big">Most Likely To</p>
                  <p className="bgn-display__meta">A prompt goes up here. Everyone votes on their phone for who fits it best, yourself included. Match the room&apos;s pick to score.</p>
                  <p className="bgn-display__foot">{a.players.length < 3 ? "Needs at least three players. Scan to join." : "Waiting for the host's first prompt."}</p>
                </>
              ) : (
                <>
                  <p className="bgn-display__eyebrow">Round {a.current.round} of {a.totalRounds} · Who&apos;s most likely to…</p>
                  <p className="party-tv__big">{a.current.prompt}?</p>
                  {a.current.reveal ? (
                    <>
                      <p className="bgn-display__meta">The room picked <strong>{a.current.reveal.top.map(name).join(" and ")}</strong></p>
                      <ul className="party-tv__bars">
                        {[...a.current.reveal.votes].filter((v) => v.count > 0).sort((x, y) => y.count - x.count).map((v) => {
                          const max = Math.max(1, ...a.current!.reveal!.votes.map((x) => x.count));
                          return (
                            <li key={v.seat} className={a.current!.reveal!.top.includes(v.seat) ? "party-tv__bar--odd" : undefined}>
                              <span className="party-tv__bar-name">{name(v.seat)}</span>
                              <span className="party-tv__bar-track"><span className="party-tv__bar-fill" style={{ width: `${(v.count / max) * 100}%` }} /></span>
                              <span className="party-tv__bar-n">{v.count}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <>
                      <div className="party-tv__voters">
                        {a.players.map((s) => <span key={s} className={`party-tv__voter${a.current!.voted.includes(s) ? " party-tv__voter--in" : ""}`}>{name(s)}</span>)}
                      </div>
                      <p className="bgn-display__foot">{a.current.votesIn} of {a.current.voters} voted · votes are anonymous</p>
                    </>
                  )}
                </>
              )
            ) : a && a.slug === "number-bingo" ? (
              !a.current ? (
                <>
                  <p className="party-tv__big">Number Bingo</p>
                  <p className="bgn-display__meta">Everyone gets a card on their phone. Numbers show up here; mark your own card and shout when you get a line.</p>
                  <p className="bgn-display__foot">Waiting for the host to deal the cards.</p>
                </>
              ) : (
                <>
                  <p className="bgn-display__eyebrow">Round {a.current.round} of {a.totalRounds} · {a.current.called.length} of 75 called</p>
                  {a.current.phase === "done" && a.current.winner !== null
                    ? <p className="party-tv__big"><strong>{name(a.current.winner)}</strong> got bingo!</p>
                    : <p className="party-tv__bingo">{a.current.last !== null ? `${letterFor(a.current.last)} ${a.current.last}` : "Ready"}</p>}
                  <div className="party-tv__calls">
                    {LETTERS.map((L, col) => (
                      <div key={L} className="party-tv__calls-row">
                        <span className="party-tv__calls-letter">{L}</span>
                        {Array.from({ length: 15 }, (_, i) => col * 15 + i + 1).map((n) => (
                          <span key={n} className={`party-tv__call${a.current!.called.includes(n) ? " party-tv__call--on" : ""}${n === a.current!.last ? " party-tv__call--last" : ""}`}>{n}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : a && a.slug === "draft-night" ? (
              !a.current ? (
                <>
                  <p className="party-tv__big">Draft Night</p>
                  <p className="bgn-display__meta">Everyone snake-drafts characters on their phone, then plays only from their own pool for the rest of the night.</p>
                  <p className="bgn-display__foot">Waiting for the host to start the draft.</p>
                </>
              ) : (
                <>
                  <p className="bgn-display__eyebrow">{a.current.rosterLabel} · {a.current.phase === "done" ? "draft complete" : `pick ${a.current.taken.length + 1} of ${a.current.order.length * a.current.picks}`}</p>
                  <p className="party-tv__big">{a.current.phase === "done" ? "Tonight's pools" : a.current.onTheClock !== null ? <><strong>{name(a.current.onTheClock)}</strong> is on the clock</> : "Drafting"}</p>
                  <ul className="party-tv__agendas">
                    {a.players.map((seat) => (
                      <li key={seat}>
                        <strong>{name(seat)}</strong>
                        <span>{a.current!.pools.find((p) => p.seat === seat)?.names.join(", ") || "No picks yet"}</span>
                        <span className="party-tv__agenda-state">{a.current!.pools.find((p) => p.seat === seat)?.names.length ?? 0}/{a.current!.picks}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : a && a.slug === "odd-one-out" && !c ? (
              <>
                <p className="party-tv__big">Odd One Out</p>
                <p className="bgn-display__meta">Everyone gets the same secret word, except one player who only sees the category. Give one-word hints out loud, then vote on your phone for who&apos;s faking it.</p>
                <p className="bgn-display__foot">{a.players.length < 3 ? "Needs at least three players. Scan to join." : "Waiting for the host to deal the first round."}</p>
              </>
            ) : a && c && c.phase === "hints" ? (
              <>
                <p className="bgn-display__eyebrow">Round {c.round} of {a.totalRounds}</p>
                <p className="party-tv__big">Category: <strong>{c.category}</strong></p>
                <p className="bgn-display__meta">Check your phone. Don&apos;t show anyone. <strong>{name(c.start)}</strong> gives the first hint.</p>
                <div className="party-tv__voters">
                  {a.players.map((s) => <span key={s} className={`party-tv__voter${c.voted.includes(s) ? " party-tv__voter--in" : ""}`}>{name(s)}</span>)}
                </div>
                <p className="bgn-display__foot">{c.votesIn} of {c.voters} voted</p>
              </>
            ) : a && c && c.reveal ? (
              <>
                <p className="bgn-display__eyebrow">Round {c.round} · Category: {c.category}</p>
                <p className="party-tv__big"><strong>{name(c.reveal.odd)}</strong> was the odd one out{c.reveal.caught ? "!" : ", and nobody caught them!"}</p>
                <ul className="party-tv__bars">
                  {[...c.reveal.votes].sort((x, y) => y.count - x.count).map((v) => {
                    const max = Math.max(1, ...c.reveal!.votes.map((x) => x.count));
                    return (
                      <li key={v.seat} className={v.seat === c.reveal!.odd ? "party-tv__bar--odd" : undefined}>
                        <span className="party-tv__bar-name">{name(v.seat)}</span>
                        <span className="party-tv__bar-track"><span className="party-tv__bar-fill" style={{ width: `${(v.count / max) * 100}%` }} /></span>
                        <span className="party-tv__bar-n">{v.count}</span>
                      </li>
                    );
                  })}
                </ul>
                {c.phase === "guess" && <p className="bgn-display__meta">{name(c.reveal.odd)} gets one guess at the word…</p>}
                {c.phase === "done" && c.reveal.word && (
                  <p className="bgn-display__meta">The word was <strong>{c.reveal.word}</strong>
                    {c.reveal.guess ? ` · ${name(c.reveal.odd)} guessed "${c.reveal.guess}"${c.reveal.guessOk ? ", and got it" : ""}` : ""}
                  </p>
                )}
              </>
            ) : agendas.length ? (
              <>
                <p className="bgn-display__eyebrow">{ng?.short ?? "This game"} is done</p>
                <p className="party-tv__big">Hidden agendas revealed</p>
                <ul className="party-tv__agendas">
                  {agendas.map((x) => (
                    <li key={x.id} className={x.status === "done" ? "party-tv__agenda--done" : undefined}>
                      <strong>{name(x.seat!)}</strong>
                      <span>{data.defs[x.cardId]?.text ?? ""}</span>
                      <span className="party-tv__agenda-state">{x.status === "done" ? `+${data.defs[x.cardId]?.worth ?? 1}` : x.status === "pending" ? "Claimed" : ""}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="party-tv__big">Playing {ng?.short ?? "a game"}</p>
                {data.cards.filter((x) => x.cardId.startsWith("cc-") && x.status !== "discarded").slice(-1).map((x) => (
                  <p key={x.id} className="party-tv__chaos"><span>This race</span><strong>{data.defs[x.cardId]?.title}</strong>{x.seat !== null ? ` · ${name(x.seat)}` : ""}</p>
                ))}
                {data.calls && data.calls.count > 0 && current?.status !== "done" && (
                  <p className="bgn-display__meta">{data.calls.count} {data.calls.count === 1 ? "person has" : "people have"} called the winner</p>
                )}
                {data.calls && current?.status === "done" && data.calls.revealed.some((c) => c.right) && (
                  <p className="bgn-display__meta">Called it: <strong>{data.calls.revealed.filter((c) => c.right).map((c) => name(c.seat)).join(", ")}</strong></p>
                )}
                {data.games.filter((g) => g.results.length).slice(-1).map((g) => (
                  <p key={g.index} className="bgn-display__meta">Last result ({nightGame(g.slug)?.short ?? g.slug}): {g.results.slice(0, 3).map((r) => `${r.place}. ${name(r.seat)}`).join("  ·  ")}</p>
                ))}
              </>
            )}
          </section>

          <section className="bgn-display__panel">
            <h2 className="bgn-display__h2">Tonight&apos;s scoreboard</h2>
            {data.night.crown && (
              <p className="party-tv__crownline">King of the Couch: <strong>{data.night.crown.name}</strong>{data.night.crown.defenses ? ` · ${data.night.crown.defenses} defense${data.night.crown.defenses === 1 ? "" : "s"}` : ""}</p>
            )}
            <ol className="party-tv__board">
              {board.map((s, i) => (
                <li key={s.index}><span className="party-tv__rank">{i + 1}</span><span className="party-tv__name">{s.name}{data.night.crown?.seat === s.index && <span className="party-tv__crown">Crown</span>}</span><span className="party-tv__pts">{s.points}</span></li>
              ))}
            </ol>
            {a && "totals" in a && a.totals.some((t) => t.points > 0) && (
              <>
                <h2 className="bgn-display__h2" style={{ marginTop: "var(--spacing-32)" }}>{a.label}</h2>
                <ol className="party-tv__board party-tv__board--small">
                  {[...a.totals].sort((x, y) => y.points - x.points || x.seat - y.seat).map((t: { seat: number; points: number }) => (
                    <li key={t.seat}><span className="party-tv__name">{name(t.seat)}</span><span className="party-tv__pts">{t.points}</span></li>
                  ))}
                </ol>
              </>
            )}
            {data.pools && !(a && a.slug === "draft-night") && (
              <>
                <h2 className="bgn-display__h2" style={{ marginTop: "var(--spacing-32)" }}>Draft pools</h2>
                <ul className="party-tv__board party-tv__board--small">
                  {data.pools.pools.map((p) => <li key={p.seat}><span className="party-tv__name">{name(p.seat)}</span><span className="party-tv__pools">{p.names.join(", ")}</span></li>)}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
