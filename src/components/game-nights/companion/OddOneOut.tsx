"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Chip, Select } from "@empac/cascadeds";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { RosterEmpty } from "@/components/game-nights/companion/RosterEmpty";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { WORD_PACKS } from "@/data/originals/odd-one-out";
import { CATCH_POINTS, ESCAPE_POINTS, GUESS_POINTS, MIXED, dealRound, type OddRound } from "@/lib/originals/oddOneOut";
import { EVENTS, track } from "@/lib/analytics/events";

/**
 * Odd One Out, pass-the-phone edition (a GameShuffle Original). One device, no
 * account: deal by passing the phone, give hints out loud, then the table
 * points at who it thinks is faking it. The live-night version deals to
 * everyone's own phone and runs the vote there.
 */

type Phase = "setup" | "deal" | "hints" | "accuse" | "reveal";

export function OddOneOut() {
  const { players: roster } = useRoster();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const players = roster.map((p) => p.name);
  const seats = players.map((_, i) => i);

  const [pack, setPack] = useState(MIXED);
  const [phase, setPhase] = useState<Phase>("setup");
  const [round, setRound] = useState<OddRound | null>(null);
  const [roundNo, setRoundNo] = useState(0);
  const [used, setUsed] = useState<string[]>([]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [showing, setShowing] = useState(false);
  const [accused, setAccused] = useState<number | null>(null);
  const [voters, setVoters] = useState<number[]>([]);
  const [guessOk, setGuessOk] = useState<boolean | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [starting, setStarting] = useState(false);
  const tracked = useRef(false);

  if (roster.length === 0) return <RosterEmpty>Add at least three players above to play Odd One Out. Everyone at the table is shared across every tool.</RosterEmpty>;

  const deal = () => {
    const r = dealRound(seats, pack, used);
    setRound(r);
    setUsed((u) => [...u, r.word]);
    setRoundNo((n) => n + 1);
    setRevealIdx(0);
    setShowing(false);
    setAccused(null);
    setVoters([]);
    setGuessOk(null);
    if (scores.length !== players.length) setScores(players.map(() => 0));
    setPhase("deal");
    if (!tracked.current) { tracked.current = true; track(EVENTS.toolUsed, { tool: "odd-one-out" }); }
  };

  const scoreRound = () => {
    if (!round || accused === null) return;
    const caught = accused === round.odd;
    setScores((s) => s.map((pts, i) => {
      let add = 0;
      if (voters.includes(i) && i !== round.odd) add += CATCH_POINTS;
      if (i === round.odd) add += !caught ? ESCAPE_POINTS : guessOk ? GUESS_POINTS : 0;
      return (pts ?? 0) + add;
    }));
    setPhase("setup");
  };

  // Everyone's own phone: a live night with Odd One Out in the lineup.
  const playOnPhones = async () => {
    setStarting(true);
    const r = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug: "odd-one-out", config: {}, visibility: "secret", seats: players.slice(0, 8).map((name) => ({ name, isCpu: false, character: null })), hostSeat: null }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStarting(false);
    if (!r?.ok || !j.code) { toast.error("Couldn't start the night. Please try again."); return; }
    track(EVENTS.nightStarted, { format: "classic", source: "odd-one-out" });
    router.push(`/party/${j.code}`);
  };

  const board = players.map((name, i) => ({ name, i, pts: scores[i] ?? 0 })).sort((a, b) => b.pts - a.pts);

  if (phase === "setup") {
    return (
      <div className="account-card oddone-tool">
        {roundNo > 0 && round && (
          <div className="oddone__reveal">
            <p className="oddone__verdict">Round {roundNo}: <strong>{players[round.odd]}</strong> was the odd one out. The word was <strong>{round.word}</strong>.</p>
            <ul className="party-live__scores">{board.map((p) => <li key={p.i}><span>{p.name}</span><span className="party-muted">{p.pts} pts</span></li>)}</ul>
          </div>
        )}
        <p className="bgn-tools__hint">Playing with everyone on the roster above ({players.length}). Everyone gets the same secret word except one player, who only sees the category.</p>
        <div className="party-row">
          <Select floatingLabel="Word pack" value={pack} onChange={(v) => setPack(String(v))}
            options={[{ value: MIXED, label: "Mixed (a random pack)" }, ...WORD_PACKS.map((p) => ({ value: p.id, label: p.label }))]} />
          <Button variant="primary" disabled={players.length < 3} onClick={deal}>{roundNo ? `Deal round ${roundNo + 1}` : "Deal the first round"}</Button>
          {roundNo > 0 && <Button variant="ghost" onClick={() => { setScores(players.map(() => 0)); setRoundNo(0); setUsed([]); setRound(null); }}>New game</Button>}
        </div>
        {players.length < 3 && <p className="bgn-tools__hint">Add at least 3 players to play.</p>}
        <div className="oddone-tool__phones">
          <p className="bgn-tools__hint"><strong>Rather use everyone&apos;s phone?</strong> Start a live night: each player gets their word on their own phone, votes there, and the TV shows the reveal and the scoreboard.</p>
          {user
            ? <Button variant="secondary" size="small" disabled={starting || players.length < 3} onClick={playOnPhones}>Play on everyone&apos;s phones</Button>
            : <Link href={`/signup?redirect=${encodeURIComponent("/game-nights/tools/odd-one-out")}`}>Create a free account to host on everyone&apos;s phones</Link>}
        </div>
      </div>
    );
  }

  if (!round) return null;

  if (phase === "deal") {
    const i = revealIdx;
    const odd = i === round.odd;
    return (
      <div className="account-card bgn-wolf__deal">
        <p className="bgn-tools__hint">Pass the phone to this player, then tap to see their word. Don&apos;t let anyone else look.</p>
        <div className="bgn-wolf__dealcard">
          <span className="bgn-wolf__dealname">{players[i]}</span>
          {showing ? (
            <>
              <div className={`oddone__card${odd ? " oddone__card--odd" : ""}`}>
                <span className="oddone__label">{odd ? "You're the odd one out" : "Your word"}</span>
                <strong className="oddone__word">{odd ? "Bluff it" : round.word}</strong>
                <span className="party-muted">Category: {round.category}</span>
              </div>
              <Button variant="primary" onClick={() => {
                if (i + 1 >= players.length) setPhase("hints"); else { setRevealIdx(i + 1); setShowing(false); }
              }}>{i + 1 >= players.length ? "Everyone's seen it" : "Hide and pass on"}</Button>
            </>
          ) : (
            <Button variant="primary" size="large" onClick={() => setShowing(true)}>Show my word</Button>
          )}
        </div>
        <p className="bgn-tools__hint">{i + 1} of {players.length}</p>
      </div>
    );
  }

  if (phase === "hints") {
    return (
      <div className="account-card oddone-tool">
        <p className="oddone__turn">Category: <strong>{round.category}</strong></p>
        <p className="oddone__turn"><strong>{players[round.start]}</strong> gives the first hint, then go around the room. One word each, out loud.</p>
        <p className="bgn-tools__hint">When everyone has given a hint, count to three and everyone points at who they think is faking it.</p>
        <Button variant="primary" onClick={() => setPhase("accuse")}>We&apos;ve voted</Button>
      </div>
    );
  }

  if (phase === "accuse") {
    return (
      <div className="account-card oddone-tool">
        <p className="party-options__label">Who got the most votes?</p>
        <div className="party-chips">
          {players.map((name, i) => <Chip key={i} clickable selected={accused === i} variant={accused === i ? "primary" : "default"} label={name} onClick={() => setAccused(i)} />)}
        </div>
        <Button variant="primary" disabled={accused === null} onClick={() => { setVoters([]); setPhase("reveal"); }}>Reveal the odd one out</Button>
      </div>
    );
  }

  // Reveal
  const caught = accused === round.odd;
  return (
    <div className="account-card oddone-tool">
      <div className="oddone__reveal">
        <p className="oddone__verdict"><strong>{players[round.odd]}</strong> was the odd one out{caught ? ", and the table caught them!" : ", and got away with it!"}</p>
        {caught && guessOk === null && (
          <>
            <p className="party-muted">{players[round.odd]} gets one guess at the word. Say it out loud.</p>
            <span className="party-row">
              <Button variant="secondary" size="small" onClick={() => setGuessOk(true)}>They got it</Button>
              <Button variant="ghost" size="small" onClick={() => setGuessOk(false)}>Missed it</Button>
            </span>
          </>
        )}
        {(!caught || guessOk !== null) && <p className="oddone__answer">The word was <strong>{round.word}</strong>.</p>}
      </div>
      {(!caught || guessOk !== null) && (
        <>
          <p className="party-options__label">Who voted for {players[round.odd]}? (+{CATCH_POINTS} each)</p>
          <div className="party-chips">
            {players.map((name, i) => i === round.odd ? null : (
              <Chip key={i} clickable selected={voters.includes(i)} variant={voters.includes(i) ? "primary" : "default"} label={name}
                onClick={() => setVoters((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]))} />
            ))}
          </div>
          <Button variant="primary" onClick={scoreRound}>Score the round</Button>
        </>
      )}
    </div>
  );
}
