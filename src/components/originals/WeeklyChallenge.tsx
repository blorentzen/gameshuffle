"use client";

/**
 * The Weekly Challenge (a GameShuffle Original) at /weekly. Usually a survey
 * (a Chat Brain question: give your answer and guess the crowd's top three;
 * Monday reveals the board and scores your guesses); a Tier War when no
 * question is queued. Plus the bonus game-night mission, and last week's
 * reveal and leaderboard. Also runs inside the Discord Activity
 * (OriginalsHost), where plays count on the account that signs in with the
 * player's Discord user.
 */

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Chip, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { ChatBrainAsk } from "@/components/chatbrain/ChatBrainAsk";
import { OriginalsLink, useArtSrc, useOriginalsHost } from "@/components/originals/OriginalsHost";
import { EVENTS, track } from "@/lib/analytics/events";
import { TIERS } from "@/lib/originals/tierWars";
import { BADGE_RANK, SURVEY_PREDICTIONS, type WeeklyItem } from "@/lib/originals/weekly";
import type { BoardAnswer } from "@/lib/chatbrain/rules";
import type { BoardRow } from "@/lib/weekly/store";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { GS_TIME_ZONE } from "@/lib/time/gsClock";

type Ballot = Record<string, number>;

interface WeeklyData {
  ready: boolean;
  signedIn: boolean;
  /** Staff preview of next week (?preview=next): read only. */
  preview?: { saved: boolean };
  current?: {
    week: string; number: number; kind: "tier" | "survey"; title: string; items: WeeklyItem[];
    agenda: { title: string; text: string } | null; players: number; revealAt: string; myBallot: Ballot | null;
    myAnswer: string | null; myPredictions: string[] | null;
    /** The same question answered in Chat Brain (on Discord, say): prefills the answer. */
    answeredInBrain?: string | null;
  };
  last?: null | {
    week: string; number: number; kind: "tier" | "survey"; title: string; items: WeeklyItem[]; crowd: Record<string, number>; players: number;
    surveyBoard: BoardAnswer[] | null;
    board: BoardRow[];
    me: null | {
      rank: number | null; total: number | null; tierScore: number | null; agendaPoints: number; ballot: Ballot | null;
      surveyScore: number | null; answer: string | null; predictions: string[] | null; hits: number[];
    };
  };
}

function revealDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: GS_TIME_ZONE });
}

function ItemName({ it }: { it: WeeklyItem }) {
  const art = useArtSrc();
  return (
    <>
      {it.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art(it.image)} alt="" className="tierwars__img" loading="lazy" />
      )}
      {it.label}
    </>
  );
}

export function WeeklyChallenge() {
  const toast = useToast();
  const { api, activity } = useOriginalsHost();
  const [data, setData] = useState<WeeklyData | null>(null);
  const [draft, setDraft] = useState<Ballot>({});
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    const preview = new URLSearchParams(window.location.search).get("preview") === "next";
    void api(preview ? "/api/weekly?preview=next" : "/api/weekly", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!alive || !d?.ok) return;
      setData(d as WeeklyData);
      if (d.last) track(EVENTS.weeklyResultsViewed, { kind: d.last.kind });
    }).catch(() => {});
    return () => { alive = false; };
  }, [api]);

  if (!data) return <LoadingLines label="Loading this week&apos;s challenge" />;
  if (!data.ready || !data.current) {
    return <Alert variant="info" title="The Weekly Challenge is almost here">It needs one more update on our side. Check back soon.</Alert>;
  }

  const c = data.current;
  const ranks: Ballot = { ...(c.myBallot ?? {}), ...draft };
  const complete = c.items.every((it) => ranks[it.id] !== undefined);
  const changed = Object.keys(draft).some((k) => draft[k] !== c.myBallot?.[k]);

  const lockIn = async () => {
    setBusy(true);
    const res = await api("/api/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ballot: ranks }) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setData({ ...data, current: { ...c, myBallot: d.ballot, players: d.players } });
      setDraft({});
      track(EVENTS.weeklySubmitted, { kind: "tier" });
      toast.success(c.myBallot ? "Ranking updated" : "Ranking locked in");
    } else toast.error(d?.error === "closed" ? "This week has closed." : "Couldn't save your ranking. Try again.");
  };

  const myAnswer = answer ?? c.myAnswer ?? c.answeredInBrain ?? "";
  // Guesses are optional, so a saved play can hold fewer than three: keep three boxes.
  const savedGuesses = (c.myPredictions ?? []).slice(0, SURVEY_PREDICTIONS);
  const myGuesses = guesses ?? [...savedGuesses, ...Array(SURVEY_PREDICTIONS - savedGuesses.length).fill("")];
  const surveyReady = !!myAnswer.trim();
  const surveyLocked = !!c.myAnswer;
  const surveyChanged = answer !== null || guesses !== null;

  const lockSurvey = async () => {
    setBusy(true);
    const res = await api("/api/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: myAnswer, predictions: myGuesses }) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setData({ ...data, current: { ...c, myAnswer: d.answer, myPredictions: d.predictions, players: d.players } });
      setAnswer(null); setGuesses(null);
      track(EVENTS.weeklySubmitted, { kind: "survey" });
      toast.success(surveyLocked ? "Answers updated" : "Answers locked in");
    } else {
      toast.error(d?.error === "closed" ? "This week has closed." : d?.error === "blocked" ? "Let's keep it clean. Try different words." : d?.error === "bad_entry" ? "Give your own answer first." : "Couldn't save. Try again.");
    }
  };

  const last = data.last;

  const opens = new Date(`${c.week}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <div className="weekly">
      {data.preview && (
        <Alert variant="warning" title={`Staff preview: Week ${c.number} opens ${opens}`}>
          {data.preview.saved
            ? "This is the week as it's set. Nothing you enter here is saved."
            : "Nothing is locked in yet: this is the question the queue would pick right now. Swap it in Platform ▸ Weekly. Nothing you enter here is saved."}
        </Alert>
      )}
      {c.kind === "survey" && (
        <section className="weekly__card">
          <div className="weekly__head">
            <Badge variant="info" size="small">Week {c.number}</Badge>
            <span className="party-muted">{c.players} {c.players === 1 ? "player" : "players"} so far · the board is revealed {revealDay(c.revealAt)}</span>
          </div>
          <span className="weekly__eyebrow">This week&apos;s survey</span>
          <h2 className="weekly__title">{c.title}</h2>
          <p className="party-muted">Give your own answer. Then, if you like, guess up to three of the crowd&apos;s top answers: on Monday the board is revealed, and each guess that&apos;s on it scores that answer&apos;s points. You can change everything until the week ends.</p>
          {data.signedIn ? (
            <div className="weekly__survey">
              {!c.myAnswer && c.answeredInBrain && (
                <p className="party-muted">You already answered this one in Chat Brain, so it&apos;s filled in. Lock it in to play the Weekly. It stays one answer, wherever you change it.</p>
              )}
              <Input floatingLabel="Your answer" value={myAnswer} maxLength={40} onChange={(e) => setAnswer(e.target.value)} placeholder="First thing that comes to mind" />
              <span className="weekly__eyebrow">Your guesses at the crowd&apos;s top three (optional)</span>
              {myGuesses.map((g, i) => (
                <Input key={i} floatingLabel={`Guess ${i + 1}`} value={g} maxLength={40}
                  onChange={(e) => setGuesses(myGuesses.map((x, j) => (j === i ? e.target.value : x)))} />
              ))}
              <span className="party-row">
                <Button variant="primary" disabled={!!data.preview || busy || !surveyReady || (surveyLocked && !surveyChanged)} onClick={() => void lockSurvey()}>
                  {surveyLocked ? (surveyChanged ? "Update my answers" : "Locked in") : "Lock in my answers"}
                </Button>
                {!surveyReady && <span className="party-muted">Give your answer to lock in. Guesses are optional.</span>}
              </span>
            </div>
          ) : (
            <p><OriginalsLink href="/login?redirect=/weekly">Sign in</OriginalsLink> to play. Your result goes on the leaderboard and a top-10 week shows on your profile.</p>
          )}
        </section>
      )}

      {c.kind !== "survey" && (
      <section className="weekly__card">
        <div className="weekly__head">
          <Badge variant="info" size="small">Week {c.number}</Badge>
          <span className="party-muted">{c.players} {c.players === 1 ? "player" : "players"} so far · the crowd&apos;s ranking is revealed {revealDay(c.revealAt)}</span>
        </div>
        <h2 className="weekly__title">Tier War: {c.title}</h2>
        <p className="party-muted">Rank all six from S to D. You score a point for every one you put where the crowd does. You can change your ranking until the week ends.</p>

        <ul className="tierwars__list">
          {c.items.map((it) => (
            <li key={it.id} className="tierwars__item">
              <span className="tierwars__name"><ItemName it={it} /></span>
              <span className="tierwars__chips" role="group" aria-label={`Tier for ${it.label}`}>
                {TIERS.map((t, i) => (
                  <Chip key={t} clickable={data.signedIn} selected={ranks[it.id] === i} variant={ranks[it.id] === i ? "primary" : "default"} label={t}
                    onClick={data.signedIn ? () => setDraft((d) => ({ ...d, [it.id]: i })) : undefined} />
                ))}
              </span>
            </li>
          ))}
        </ul>

        {data.signedIn ? (
          <span className="party-row">
            <Button variant="primary" disabled={!!data.preview || busy || !complete || (!!c.myBallot && !changed)} onClick={() => void lockIn()}>
              {c.myBallot ? (changed ? "Update my ranking" : "Locked in") : "Lock in my ranking"}
            </Button>
            {!complete && <span className="party-muted">Give every item a tier first.</span>}
          </span>
        ) : (
          <p><OriginalsLink href="/login?redirect=/weekly">Sign in</OriginalsLink> to play. Your result goes on the leaderboard and a top-10 week shows on your profile.</p>
        )}
      </section>
      )}

      {(!data.signedIn || (c.kind === "survey" ? c.myPredictions : c.myBallot)) && (activity
        ? activity.showTab && <span className="party-row"><Button variant="secondary" onClick={() => activity.showTab?.("brain")}>Answer a Chat Brain question</Button></span>
        : <ChatBrainAsk source="weekly" eyebrow="While you wait for Monday" title="Answer one more question?" />
      )}

      {c.agenda && (
        <section className="weekly__card weekly__card--quiet">
          <span className="weekly__eyebrow">Bonus at live game nights</span>
          <h2 className="weekly__title">{c.agenda.title}</h2>
          <p>{c.agenda.text.replace("{player}", "you")}</p>
          <p className="party-muted">Every <OriginalsLink href="/help/apps/live-game-nights">live game night</OriginalsLink> this week deals this mission. When your table confirms you did it, it adds 3 to your week.</p>
        </section>
      )}

      {last && (
        <section className="weekly__card">
          <span className="weekly__eyebrow">Last week&apos;s reveal · week {last.number}</span>
          {last.kind === "survey" ? (
            <>
              <h2 className="weekly__title">{last.title}</h2>
              {last.surveyBoard && last.surveyBoard.length ? (
                <ol className="weekly__surveyboard">
                  {last.surveyBoard.map((b) => (
                    <li key={b.rank} className={last.me?.hits.includes(b.rank) ? "is-hit" : undefined}>
                      <span className="weekly__rank">{b.rank}</span><span>{b.label}</span><strong>{b.points}</strong>
                    </li>
                  ))}
                </ol>
              ) : <p className="party-muted">Not enough answers came in to make a board.</p>}
              {last.me?.predictions && <p className="party-muted">Your guesses: {last.me.predictions.join(", ")}{last.me.answer ? ` · your answer: ${last.me.answer}` : ""}. Highlighted: the ones you got.</p>}
            </>
          ) : (
          <>
          <h2 className="weekly__title">The crowd ranked {last.title.toLowerCase()}</h2>
          <div className="tierwars__board">
            {TIERS.map((t, i) => {
              const inTier = last.items.filter((it) => last.crowd[it.id] === i);
              return (
                <div key={t} className="tierwars__row">
                  <span className={`tierwars__tier tierwars__tier--${t.toLowerCase()}`}>{t}</span>
                  <span className="tierwars__tiles">
                    {inTier.length ? inTier.map((it) => (
                      <span key={it.id} className={`tierwars__tile${last.me?.ballot?.[it.id] === i ? " tierwars__tile--match" : ""}`}><ItemName it={it} /></span>
                    )) : <span className="party-muted">Nothing</span>}
                  </span>
                </div>
              );
            })}
          </div>
          </>
          )}
          {last.me?.rank && (
            <p className="weekly__me">
              You finished <strong>#{last.me.rank}</strong> of {last.players} with {last.me.total} {last.me.total === 1 ? "point" : "points"}
              {" "}({[
                last.me.tierScore !== null ? `${last.me.tierScore} from the Tier War` : null,
                last.me.surveyScore !== null ? `${last.me.surveyScore} from the survey` : null,
                last.me.agendaPoints ? `${last.me.agendaPoints} from the game-night mission` : null,
              ].filter(Boolean).join(", ")}).
              {last.me.rank <= BADGE_RANK ? " Top 10: it's on your profile." : ""}
            </p>
          )}
          {last.kind !== "survey" && last.me?.ballot && <p className="party-muted">Highlighted: the ones you put where the crowd did.</p>}

          {last.board.length > 0 ? (
            <div className="weekly__board">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow><TableHead>Rank</TableHead><TableHead>Player</TableHead><TableHead align="right">{last.kind === "survey" ? "Survey" : "Tier War"}</TableHead><TableHead align="right">Mission</TableHead><TableHead align="right">Total</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {last.board.map((r, i) => (
                    <TableRow key={`${r.rank}-${i}`}>
                      <TableCell>#{r.rank}</TableCell>
                      <TableCell>{r.username ? <OriginalsLink href={`/u/${r.username}`}>{r.name}</OriginalsLink> : r.name}</TableCell>
                      <TableCell align="right">{(last.kind === "survey" ? r.surveyScore : r.tierScore) ?? <span className="party-muted">Skipped</span>}</TableCell>
                      <TableCell align="right">{r.agendaPoints ? `+${r.agendaPoints}` : 0}</TableCell>
                      <TableCell align="right"><strong>{r.total}</strong></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : <p className="party-muted">Nobody played last week.</p>}
        </section>
      )}
    </div>
  );
}
