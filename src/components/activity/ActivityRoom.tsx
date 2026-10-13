"use client";

/**
 * Play together: the Discord Activity's room for everyone in the call
 * (src/lib/activity/room.ts). The first person in runs it and picks a game;
 * everyone plays on their own screen while talking in voice.
 *
 *   Lobby       who's here, and (for whoever runs the room) the games
 *   Quick-fire  break mode's rounds for the call: one round at a time, the
 *               game judges, a scoreboard, a winner
 *   Roll        Roll for the call: everyone's pick from a randomizer, rerolls
 *               of your own, and the match setup
 *
 * Polls every 1.5 seconds while the tab is open (that's also how the room
 * knows who's here). Clocks use the server's time, so every screen counts down
 * together.
 */

import { useCallback, useEffect, useState } from "react";
import { Avatar, Badge, Button, Card, Input } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { IconBolt, IconBrain, IconConfetti, IconCrown, IconDice5, IconPlayerSkipForward, IconRefresh, IconUsersGroup, IconX } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { BreakRoundPlay } from "@/components/break/BreakRoundPlay";
import { RollSlotArt } from "@/components/twitch/RollSlotArt";
import { MostLikelyPanel, type LikelyActivityView } from "@/components/party/MostLikelyPanel";
import { OddOneOutPanel, type OddActivityView } from "@/components/party/OddOneOutPanel";
import { TierWarsPanel, type TierActivityView } from "@/components/party/TierWarsPanel";
import { BingoPanel, type BingoActivityView } from "@/components/party/BingoPanel";
import {
  PARTY_GAMES, QUICKFIRE_FOCUS, QUICKFIRE_FOCUS_IDS, QUICKFIRE_SETS, QUICKFIRE_SET_IDS, ROOM_ERRORS, ROOM_POLL_MS, ROUND_COUNTS, RUSH_ROUNDS,
  type QuickfireFocus, type QuickfireSetId, type RoomView,
} from "@/lib/activity/roomRules";

type Load =
  | { kind: "loading" }
  | { kind: "not_ready" }
  | { kind: "no_call" }
  | { kind: "error"; message: string }
  | { kind: "room"; view: RoomView; offset: number };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const secsLeft = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0);
const PLACE = ["1st", "2nd", "3rd"];
const placeLabel = (n: number) => PLACE[n - 1] ?? `${n}th`;
/** "2 of 3 got it" / "All 3 got it" / "Nobody answered". */
function tallyLine(right: number, answered: number): string {
  if (!answered) return "Nobody answered";
  if (!right) return answered === 1 ? "The one answer missed" : `None of the ${answered} answers got it`;
  if (right === answered) return answered === 1 ? "The one answer was right" : `All ${answered} got it`;
  return `${right} of ${answered} got it`;
}

export function ActivityRoom({ active }: { active: boolean }) {
  const { api } = useOriginalsHost();
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((view: RoomView) => {
    setLoad({ kind: "room", view, offset: Date.parse(view.serverNow) - Date.now() });
  }, []);

  useEffect(() => {
    if (!active) return;
    let live = true;
    const read = async () => {
      const r = await api("/api/activity/room", { cache: "no-store" }).catch(() => null);
      const j = (await r?.json().catch(() => null)) as { ok?: boolean; ready?: boolean; inCall?: boolean; view?: RoomView; error?: string } | null;
      if (!live) return;
      if (!j?.ok) { if (j?.error) setLoad({ kind: "error", message: ROOM_ERRORS[j.error] ?? ROOM_ERRORS.busy }); return; }
      if (j.ready === false) setLoad({ kind: "not_ready" });
      else if (j.inCall === false) setLoad({ kind: "no_call" });
      else if (j.view) apply(j.view);
    };
    void read();
    const iv = window.setInterval(() => void read(), ROOM_POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => { live = false; window.clearInterval(iv); window.clearInterval(tick); };
  }, [active, api, apply]);

  /** Does something in the room; resolves true when it worked. */
  const act = useCallback(async (body: Record<string, unknown>, quiet = false): Promise<boolean> => {
    const r = await api("/api/activity/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; view?: RoomView; error?: string } | null;
    if (j?.ok && j.view) { apply(j.view); return true; }
    if (!quiet) toast.error(ROOM_ERRORS[j?.error ?? ""] ?? ROOM_ERRORS.busy);
    return false;
  }, [api, apply, toast]);

  if (load.kind === "loading") return <p className="gs-activity__muted gs-room__status" role="status">Opening the room…</p>;
  if (load.kind === "not_ready") return <Card variant="outlined" padding="medium" className="gs-room__note"><p>Play together is almost ready. Check back soon.</p></Card>;
  if (load.kind === "no_call") return <Card variant="outlined" padding="medium" className="gs-room__note"><p>{ROOM_ERRORS.no_room}</p></Card>;
  if (load.kind === "error") return <Card variant="outlined" padding="medium" className="gs-room__note"><p>{load.message}</p></Card>;

  const { view, offset } = load;
  const serverNow = now + offset;
  const here = view.players.filter((p) => p.active);
  return (
    <section className="gs-room" aria-labelledby="gs-room-title">
      <header className="gs-room__head">
        <div>
          <h2 id="gs-room-title" className="gs-room__title"><IconUsersGroup size={20} aria-hidden /> Play together</h2>
          <p className="gs-room__sub">
            {here.length === 1 ? "Just you so far. Everyone in the call who opens this tab joins in." : `${here.length} here`}
            {view.host && here.length > 1 ? ` · ${view.isHost ? "You're running it" : `${view.host.name} is running it`}` : ""}
          </p>
        </div>
        <div className="gs-room__faces" aria-label="Who's here">
          {here.slice(0, 8).map((p) => <Avatar key={p.id} size="small" src={p.avatar ?? undefined} initials={initials(p.name)} alt={p.name} />)}
          {here.length > 8 && <span className="gs-room__more">+{here.length - 8}</span>}
        </div>
      </header>

      {view.game === null && <Lobby view={view} act={act} />}
      {view.game === "quickfire" && view.quickfire && <Quickfire view={view} act={act} serverNow={serverNow} />}
      {view.game === "roll" && view.roll && <Roll view={view} act={act} />}
      {view.game === "party" && view.party && <Party view={view} act={act} />}
      {view.game === "brain" && view.brain && <Brain view={view} act={act} serverNow={serverNow} />}
    </section>
  );
}

type Act = (body: Record<string, unknown>, quiet?: boolean) => Promise<boolean>;

// ── Lobby ────────────────────────────────────────────────────────────────────

function Lobby({ view, act }: { view: RoomView; act: Act }) {
  const [set, setSet] = useState<QuickfireSetId>("mixed");
  const [focus, setFocus] = useState<QuickfireFocus>("any");
  const [rounds, setRounds] = useState(10);
  const games = view.rollGames ?? [];
  const [slug, setSlug] = useState(games[0]?.slug ?? "");
  const [arg, setArg] = useState("");
  const [party, setParty] = useState<string>(PARTY_GAMES[0].slug);
  const brainCounts = [1, 3, 5].filter((n) => n <= Math.max(1, view.brainBoards ?? 0));
  const [boards, setBoards] = useState(3);
  const [busy, setBusy] = useState(false);
  const partyGame = PARTY_GAMES.find((g) => g.slug === party) ?? PARTY_GAMES[0];
  const roundChoices: readonly number[] = set === "rush" ? RUSH_ROUNDS : ROUND_COUNTS;
  const roundsNow = roundChoices.includes(rounds) ? rounds : roundChoices[set === "rush" ? 0 : 1];
  const facts = set === "mixed" || set === "characters";
  const game = games.find((g) => g.slug === slug);
  const go = async (body: Record<string, unknown>) => { setBusy(true); await act(body); setBusy(false); };

  return (
    <div className="gs-room__lobby">
      {!view.isHost && <p className="gs-room__waiting" role="status">{view.host ? `Waiting for ${view.host.name} to pick a game.` : "Waiting for someone to pick a game."}</p>}
      <div className="gs-room__games">
        <Card variant="outlined" padding="medium" className="gs-room__game">
          <h3 className="gs-room__game-title"><IconBolt size={18} aria-hidden /> Quick-fire rounds</h3>
          <p className="gs-room__game-blurb">Short rounds everyone answers on their own screen. The game judges, the fastest-thinking table wins.</p>
          {view.isHost && (
            <div className="gs-room__form">
              <Select fullWidth floatingLabel="Rounds of" value={set} onChange={(v) => setSet(v as QuickfireSetId)}
                options={QUICKFIRE_SET_IDS.map((id) => ({ value: id, label: QUICKFIRE_SETS[id].name }))} />
              <p className="gs-room__hint">{QUICKFIRE_SETS[set].blurb}</p>
              {facts && (
                <Select fullWidth floatingLabel="Characters from" value={focus} onChange={(v) => setFocus(v as QuickfireFocus)}
                  options={QUICKFIRE_FOCUS_IDS.map((id) => ({ value: id, label: QUICKFIRE_FOCUS[id].name }))} />
              )}
              <Select fullWidth floatingLabel={set === "rush" ? "Rosters" : "How many rounds"} value={String(roundsNow)} onChange={(v) => setRounds(Number(v))}
                options={roundChoices.map((n) => ({ value: String(n), label: String(n) }))} />
              <Button variant="primary" disabled={busy} onClick={() => void go({ action: "quickfire", set, focus: facts ? focus : "any", rounds: roundsNow })}>Start</Button>
            </div>
          )}
        </Card>
        <Card variant="outlined" padding="medium" className="gs-room__game">
          <h3 className="gs-room__game-title"><IconDice5 size={18} aria-hidden /> Roll for the call</h3>
          <p className="gs-room__game-blurb">About to play? Everyone here gets their pick from our randomizers (a kart combo, a fighter, a hero), plus the match setup.</p>
          {view.isHost && games.length > 0 && (
            <div className="gs-room__form">
              <Select fullWidth floatingLabel="Game" value={slug} onChange={(v) => { setSlug(String(v)); setArg(""); }}
                options={games.map((g) => ({ value: g.slug, label: g.title }))} />
              {game && game.choices.length > 0 && (
                <Select fullWidth floatingLabel="Which" value={arg || game.choices[0].arg} onChange={(v) => setArg(String(v))}
                  options={game.choices.map((c) => ({ value: c.arg, label: c.label }))} />
              )}
              <Button variant="primary" disabled={busy || !slug} onClick={() => void go({ action: "roll", slug, arg: arg || game?.choices[0]?.arg || "" })}>Roll for everyone</Button>
            </div>
          )}
        </Card>
        <Card variant="outlined" padding="medium" className="gs-room__game">
          <h3 className="gs-room__game-title"><IconConfetti size={18} aria-hidden /> Party games</h3>
          <p className="gs-room__game-blurb">Most Likely To, Odd One Out, Tier Wars and Bingo. Everyone plays on their own screen, then the reveal.</p>
          {view.isHost && (
            <div className="gs-room__form">
              <Select fullWidth floatingLabel="Game" value={party} onChange={(v) => setParty(String(v))}
                options={PARTY_GAMES.map((g) => ({ value: g.slug, label: g.name }))} />
              <p className="gs-room__hint">{partyGame.blurb}</p>
              <Button variant="primary" disabled={busy} onClick={() => void go({ action: "party_start", slug: party })}>Start {partyGame.name}</Button>
            </div>
          )}
        </Card>
        {(view.brainBoards ?? 0) > 0 && (
          <Card variant="outlined" padding="medium" className="gs-room__game">
            <h3 className="gs-room__game-title"><IconBrain size={18} aria-hidden /> Chat Brain boards</h3>
            <p className="gs-room__game-blurb">Name the top answers from real surveys. First to find one takes its points; every find restarts the clock, and three timeouts end the board.</p>
            {view.isHost && (
              <div className="gs-room__form">
                <Select fullWidth floatingLabel="Boards" value={String(brainCounts.includes(boards) ? boards : brainCounts[brainCounts.length - 1])} onChange={(v) => setBoards(Number(v))}
                  options={brainCounts.map((n) => ({ value: String(n), label: String(n) }))} />
                <Button variant="primary" disabled={busy} onClick={() => void go({ action: "brain_start", boards: brainCounts.includes(boards) ? boards : brainCounts[brainCounts.length - 1] })}>Start</Button>
              </div>
            )}
          </Card>
        )}
      </div>
      <PlayerList view={view} act={act} />
    </div>
  );
}

function PlayerList({ view, act, scores = false }: { view: RoomView; act: Act; scores?: boolean }) {
  // Places only mean something once someone has scored.
  const places = scores && view.players.some((p) => p.score > 0);
  return (
    <ol className={`gs-room__players${scores ? " gs-room__players--scores" : ""}`} aria-label={scores ? "Scores" : "Who's here"}>
      {view.players.map((p) => (
        <li key={p.id} className={`gs-room__player${p.active ? "" : " is-away"}${p.id === view.me ? " is-me" : ""}`}>
          {places && <span className="gs-room__place">{placeLabel(p.place)}</span>}
          <Avatar size="small" src={p.avatar ?? undefined} initials={initials(p.name)} alt="" status={p.active ? "online" : "away"} />
          <span className="gs-room__pname">{p.name}{p.id === view.me ? " (you)" : ""}</span>
          {view.host?.id === p.id && <span className="gs-room__crown" title="Running the room"><IconCrown size={16} aria-label="Running the room" /></span>}
          {scores && <span className="gs-room__score">{p.score}</span>}
          {!scores && view.isHost && p.id !== view.me && p.active && (
            <Button size="small" variant="ghost" onClick={() => void act({ action: "host", to: p.id })}>Hand over</Button>
          )}
        </li>
      ))}
    </ol>
  );
}

// ── Quick-fire ───────────────────────────────────────────────────────────────

function Quickfire({ view, act, serverNow }: { view: RoomView; act: Act; serverNow: number }) {
  const confirm = useConfirm();
  const toast = useToast();
  const q = view.quickfire!;
  const open = view.phase === "open";
  const left = secsLeft(view.endsAt, serverNow);
  const here = view.players.filter((p) => p.active);
  const end = async () => {
    if (await confirm({ title: "End this game?", body: "Everyone goes back to the lobby. Scores so far are cleared.", confirmLabel: "End game" })) void act({ action: "lobby" });
  };
  const answer = async (text: string) => {
    const ok = await act({ action: "answer", text }, true);
    if (!ok) toast.error(ROOM_ERRORS.not_an_answer);
    return ok;
  };

  if (view.phase === "done") return <Done view={view} act={act} what={`${q.setName} · ${q.rounds} ${q.rounds === 1 ? "round" : "rounds"}`} />;

  return (
    <div className="gs-room__play">
      <div className="gs-room__bar">
        <span className="gs-room__progress">{q.setName} · Round {Math.max(1, q.roundNo + (view.phase === "intro" ? 1 : 0))} of {q.rounds}</span>
        {open && <span className={`gs-room__clock${left <= 3 ? " is-last" : ""}`} aria-live="off">{left}s</span>}
      </div>
      <div className="gs-room__stage">
        <div className="gs-room__round live-break">
          {view.phase === "intro" ? (
            <div className="gs-room__intro">
              <p className="gs-room__eyebrow">Next up</p>
              <p className="gs-room__big">{q.game?.name}</p>
              <p className="gs-activity__muted">{q.game?.howTo.replace(/^Type /, "Answer: ")}</p>
            </div>
          ) : q.round ? (
            <BreakRoundPlay
              round={q.round}
              reveal={q.reveal}
              open={open}
              mine={q.mine}
              found={q.found}
              answering={q.answering}
              roundKey={`${q.roundNo}:${q.game?.id}`}
              now={serverNow}
              onAnswer={answer}
              meta={q.game?.name}
              inputId="gs-room-answer"
            />
          ) : null}
          {open && <p className="gs-room__answered">{q.answering} of {here.length} answered</p>}
          {view.phase === "reveal" && q.reveal && <p className="gs-room__answered">{tallyLine(q.reveal.right, q.reveal.answered)}</p>}
          {view.phase === "reveal" && q.lastPoints.length > 0 && (
            <ul className="gs-room__points" aria-label="Points this round">
              {q.lastPoints.slice(0, 8).map((p) => <li key={p.id}><Badge variant="success" size="small">+{p.points}</Badge> {p.name}</li>)}
            </ul>
          )}
        </div>
        <aside className="gs-room__side" aria-label="Scores">
          <PlayerList view={view} act={act} scores />
        </aside>
      </div>
      {view.isHost && (
        <div className="gs-room__host">
          <Button size="small" variant="ghost" iconBefore={IconPlayerSkipForward} onClick={() => void act({ action: "next" })}>{open ? "Close this round" : "Skip ahead"}</Button>
          <Button size="small" variant="ghost" onClick={() => void end()}>End game</Button>
        </div>
      )}
    </div>
  );
}

/** The end of a game: the winner, places, and what's next (for whoever runs the room). */
function Done({ view, act, what }: { view: RoomView; act: Act; what: string }) {
  const winners = view.players.filter((p) => p.place === 1 && p.score > 0);
  return (
    <div className="gs-room__done">
      <h3 className="gs-room__big">{winners.length ? `${winners.map((p) => p.name).join(" and ")} win${winners.length > 1 ? "" : "s"}!` : "That's the game"}</h3>
      <p className="gs-activity__muted">{what}</p>
      <PlayerList view={view} act={act} scores />
      {view.isHost ? (
        <div className="gs-room__actions">
          <Button variant="primary" onClick={() => void act({ action: "again" })}>Play again</Button>
          <Button variant="secondary" onClick={() => void act({ action: "lobby" })}>Back to the lobby</Button>
        </div>
      ) : <p className="gs-room__waiting">Waiting for {view.host?.name ?? "the host"} to pick what&apos;s next.</p>}
    </div>
  );
}

// ── Party games (the live night panels) ──────────────────────────────────────

function Party({ view, act }: { view: RoomView; act: Act }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const p = view.party!;
  const seatName = (i: number) => p.seatNames[i] ?? `Player ${i + 1}`;
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    const ok = await act({ action: "party", act: body });
    setBusy(false);
    return ok;
  };
  const me = { isHost: view.isHost, seat: p.mySeat };
  if (view.phase === "done") {
    const rounds = (p.activity as { history?: unknown[] }).history?.length ?? 0;
    return <Done view={view} act={act} what={`${p.name} · ${rounds} ${rounds === 1 ? "round" : "rounds"}`} />;
  }
  const end = async () => {
    if (await confirm({ title: `End ${p.name}?`, body: "Everyone goes back to the lobby. Scores so far are cleared.", confirmLabel: "End game" })) void act({ action: "lobby" });
  };
  return (
    <div className="gs-room__party">
      <div className="gs-room__stage">
        <div className="gs-room__round">
          {p.slug === "most-likely-to" && <MostLikelyPanel activity={p.activity as LikelyActivityView} me={me} seatName={seatName} busy={busy} act={send} gameDone={false} inCall />}
          {p.slug === "odd-one-out" && <OddOneOutPanel activity={p.activity as OddActivityView} me={me} seatName={seatName} busy={busy} act={send} gameDone={false} inCall />}
          {p.slug === "tier-wars" && <TierWarsPanel activity={p.activity as TierActivityView} me={me} seatName={seatName} busy={busy} act={send} gameDone={false} inCall />}
          {p.slug === "number-bingo" && <BingoPanel activity={p.activity as BingoActivityView} me={me} seatName={seatName} busy={busy} act={send} gameDone={false} inCall />}
        </div>
        <aside className="gs-room__side" aria-label="Scores">
          <PlayerList view={view} act={act} scores />
        </aside>
      </div>
      {view.isHost && (
        <div className="gs-room__host">
          {p.slug === "number-bingo" && (
            <Select size="small" floatingLabel="Numbers called" value={String((p.activity as BingoActivityView).callSeconds ?? 10)}
              onChange={(v) => void send({ action: "bg_auto", seconds: Number(v) })}
              options={[{ value: "0", label: "By hand" }, { value: "6", label: "Every 6 seconds" }, { value: "10", label: "Every 10 seconds" }, { value: "15", label: "Every 15 seconds" }]} />
          )}
          <Button size="small" variant="ghost" onClick={() => void end()}>End game</Button>
        </div>
      )}
    </div>
  );
}

// ── Chat Brain boards ────────────────────────────────────────────────────────

function Brain({ view, act, serverNow }: { view: RoomView; act: Act; serverNow: number }) {
  const confirm = useConfirm();
  const b = view.brain!;
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = view.phase === "open";
  const left = secsLeft(view.endsAt, serverNow);
  if (view.phase === "done") return <Done view={view} act={act} what={`Chat Brain · ${b.boards} ${b.boards === 1 ? "board" : "boards"}`} />;
  const guess = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await act({ action: "brain_guess", text: t }, true);
    setBusy(false);
    setText("");
    setNote(ok ? null : `“${t}” isn't on the board, or someone already found it.`);
  };
  const end = async () => {
    if (await confirm({ title: "End Chat Brain?", body: "Everyone goes back to the lobby. Scores so far are cleared.", confirmLabel: "End game" })) void act({ action: "lobby" });
  };
  return (
    <div className="gs-room__play">
      <div className="gs-room__bar">
        <span className="gs-room__progress">Chat Brain · Board {b.boardNo + 1} of {b.boards}</span>
        <span className="gs-room__strikes" aria-label={`${b.strikes} of ${b.maxStrikes} strikes`}>
          {Array.from({ length: b.maxStrikes }, (_, i) => <span key={i} className={`gs-room__strike${i < b.strikes ? " is-on" : ""}`} aria-hidden><IconX size={14} stroke={3} /></span>)}
        </span>
        {open && <span className={`gs-room__clock${left <= 5 ? " is-last" : ""}`} aria-live="off">{left}s</span>}
      </div>
      <div className="gs-room__stage">
        <div className="gs-room__round">
          {view.phase === "intro" ? (
            <div className="gs-room__intro">
              <p className="gs-room__eyebrow">Next up</p>
              <p className="gs-room__big">Board {b.boardNo + 1} of {b.boards}</p>
              <p className="gs-activity__muted">Type answers as fast as you can. Every find restarts the clock.</p>
            </div>
          ) : (
            <>
              <p className="gs-room__eyebrow">We surveyed people</p>
              <p className="gs-room__question">{b.question}</p>
              <ol className="gs-room__board">
                {b.slots.map((sl) => (
                  <li key={sl.rank} className={`gs-room__slot-row${sl.finder ? " is-found" : sl.label ? " is-missed" : ""}`}>
                    <span className="gs-room__slot-rank">{sl.rank}</span>
                    <span className="gs-room__slot-label">{sl.label ?? "?"}{sl.finder && <small> · {sl.finder.id === view.me ? "you" : sl.finder.name}</small>}</span>
                    <span className="gs-room__slot-points">{sl.label ? sl.points : ""}</span>
                  </li>
                ))}
              </ol>
              {b.lastFind && open && <p className="gs-room__answered">{b.lastFind.name} found {b.lastFind.label} (+{b.lastFind.points})</p>}
              {open && (
                <form className="live-break__form" onSubmit={(e) => { e.preventDefault(); void guess(); }}>
                  <Input id="gs-room-brain" size="small" value={text} onChange={(e) => { setText(e.target.value); setNote(null); }} placeholder="Type an answer" aria-label="Your answer" autoComplete="off" />
                  <Button type="submit" size="small" variant="primary" disabled={busy || !text.trim()}>Send</Button>
                </form>
              )}
              {open && note && <p className="gs-room__answered" role="status">{note}</p>}
              {view.phase === "reveal" && <p className="gs-room__answered">{b.slots.every((sl) => sl.finder) ? "Board cleared!" : "Three strikes. Here's the whole board."}</p>}
            </>
          )}
        </div>
        <aside className="gs-room__side" aria-label="Scores">
          <PlayerList view={view} act={act} scores />
        </aside>
      </div>
      {view.isHost && (
        <div className="gs-room__host">
          <Button size="small" variant="ghost" iconBefore={IconPlayerSkipForward} onClick={() => void act({ action: "next" })}>{open ? "End this board" : "Skip ahead"}</Button>
          <Button size="small" variant="ghost" onClick={() => void end()}>End game</Button>
        </div>
      )}
    </div>
  );
}

// ── Roll for the call ────────────────────────────────────────────────────────

function Roll({ view, act }: { view: RoomView; act: Act }) {
  const r = view.roll!;
  const [setupArg, setSetupArg] = useState(r.setupChoices?.[0]?.arg ?? "");
  return (
    <div className="gs-room__rolls">
      <div className="gs-room__bar">
        <span className="gs-room__progress">{r.title}: everyone&apos;s {r.noun}</span>
        {view.isHost && (
          <span className="gs-room__host">
            <Button size="small" variant="secondary" iconBefore={IconRefresh} onClick={() => void act({ action: "reroll", who: "all" })}>Reroll everyone</Button>
            <Button size="small" variant="ghost" onClick={() => void act({ action: "lobby" })}>Back to the lobby</Button>
          </span>
        )}
      </div>
      <ul className="gs-room__roll-grid">
        {r.rolls.map((p) => (
          <li key={p.id} className={`gs-room__roll${p.id === view.me ? " is-me" : ""}`}>
            <p className="gs-room__roll-name">{p.name}{p.id === view.me ? " (you)" : ""}</p>
            <div className="gs-room__slots">
              {p.roll.slots.map((sl, i) => (
                <figure key={i} className="gs-room__slot">
                  <RollSlotArt slot={sl} className="gs-room__slot-art" compact />
                  <figcaption><b>{sl.name}</b>{sl.detail ? <span>{sl.detail}</span> : null}</figcaption>
                </figure>
              ))}
            </div>
            {(p.id === view.me || view.isHost) && (
              <Button size="small" variant="ghost" iconBefore={IconRefresh} onClick={() => void act({ action: "reroll", who: p.id })}>
                {p.id === view.me ? `New ${r.noun}` : "Reroll"}
              </Button>
            )}
            {p.rerolls > 0 && <p className="gs-room__rerolls">Rerolled {p.rerolls} {p.rerolls === 1 ? "time" : "times"}</p>}
          </li>
        ))}
      </ul>
      {r.canSetup && (
        <Card variant="outlined" padding="medium" className="gs-room__setup">
          <h3 className="gs-room__game-title">{r.setup?.title || "The match setup"}</h3>
          {r.setup ? (
            <>
              <ul className="gs-room__setup-list">{r.setup.slots.map((sl, i) => <li key={i}><b>{sl.name}</b>{sl.detail ? ` · ${sl.detail}` : ""}</li>)}</ul>
              {!r.setup.slots.length && <p className="gs-activity__muted">{r.setup.text}</p>}
            </>
          ) : <p className="gs-activity__muted">{view.isHost ? "Roll where you'll play: tracks, a stage, a board." : "Not rolled yet."}</p>}
          {view.isHost && (
            <div className="gs-room__form gs-room__form--row">
              {r.setupChoices && r.setupChoices.length > 1 && (
                <Select fullWidth floatingLabel="Setup" value={setupArg} onChange={(v) => setSetupArg(String(v))} options={r.setupChoices.map((c) => ({ value: c.arg, label: c.label }))} />
              )}
              <Button size="small" variant="primary" onClick={() => void act({ action: "setup", arg: setupArg })}>{r.setup ? "Roll it again" : "Roll the setup"}</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

