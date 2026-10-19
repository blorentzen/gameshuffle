/**
 * The Daily Shuffle and the Daily Dex inside the Facebook game (Britton's
 * picks, 2026-10-18, https://claude.ai/artifact/VuVfmLAmw6DXapsC3s3eRZ): the
 * same day's puzzle as the site, from the site's own rules
 * (src/lib/originals/daily.ts, dailyDex.ts), played here in the game. Names
 * only: no character art anywhere (each guess gets a letter tile), and the
 * last chance shows the name's first letter and length for both games. The
 * guesses, the clock and the streak live in Facebook's player storage. The
 * site hears a random id when a puzzle starts (the solve-time clock) and the
 * guesses only once the player joins the daily leaderboard with a nickname.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Input, Switch } from "@empac/cascadeds";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { answerFor, dayKey, guessLimits, hintFor, ladderShown, playTraits, puzzleFor, puzzleNumber, stillFit, type DailySchedule, type GuessHint, type TraitCell, type TraitDef } from "@/lib/originals/daily";
import { dexSearchValue, letterCount, letterReveal } from "@/lib/originals/dailyDex";
import { liveStreak, newGuestId, nextStreak, type DailyDay, type DailyId, type SaveData } from "./host";
import { joinBoard, loadStanding, sendDailyResult, startClock, type DailyStanding } from "./api";
import { drawDailyCard } from "./card";

const COLORS: Record<DailyId, [string, string]> = { shuffle: ["#1f1760", "#5a3fd6"], dex: ["#a3301b", "#e8a21c"] };

function cellText(def: TraitDef, c: TraitCell, arrows: boolean): string {
  const v = c.value === null ? (def.kind === "year" ? "Never" : "?") : def.format ? def.format(c.value) : String(c.value);
  return arrows && c.dir ? `${v} ${c.dir === "up" ? "↑" : "↓"}` : v;
}
const STATUS_WORD = { match: "match", close: "close", miss: "no match" } as const;
/** A steady color per name for the letter tile (no art). */
function tileColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 42%)`;
}
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export function DailyGame({ schedule, save, setSave, onShare }: {
  schedule: DailySchedule;
  save: SaveData;
  setSave: (fn: (s: SaveData) => SaveData) => void;
  onShare: (image: string, text: string) => Promise<void>;
}) {
  const id = schedule.id as DailyId;
  const [day] = useState(() => dayKey());
  const puzzle = useMemo(() => puzzleFor(day, schedule), [day, schedule]);
  const answer = useMemo(() => answerFor(day, schedule), [day, schedule]);
  const number = puzzleNumber(day, schedule);
  const traits = useMemo(() => playTraits(puzzle), [puzzle]);
  const { main, total } = guessLimits(puzzle);
  const rec: DailyDay = save.daily?.[id]?.[day] ?? { guesses: [] };
  const guesses = rec.guesses;
  const hints = useMemo(() => guesses.map((g) => hintFor(g, answer, puzzle)).filter((h): h is GuessHint => !!h), [guesses, answer, puzzle]);
  const solved = hints.some((h) => h.correct);
  const over = solved || hints.length >= total;
  const lastChance = !over && !!puzzle.lastChance && hints.length === main;
  const started = !!rec.startedAt || guesses.length > 0;
  const noun = puzzle.noun ?? (id === "dex" ? "Pokémon" : "character");

  const [pick, setPick] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [standing, setStanding] = useState<DailyStanding | null>(null);
  const [boardFailed, setBoardFailed] = useState(false);
  const [boardTry, setBoardTry] = useState(0);
  const [nick, setNick] = useState("");
  const [joining, setJoining] = useState(false);
  const [boardNote, setBoardNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const write = (patch: Partial<DailyDay>, extra?: (s: SaveData) => SaveData) => setSave((s) => {
    const cur = s.daily?.[id]?.[day] ?? { guesses: [] };
    let next: SaveData = { ...s, daily: { ...s.daily, [id]: { ...(s.daily?.[id] ?? {}), [day]: { ...cur, ...patch } } } };
    if (extra) next = extra(next);
    return next;
  });

  // The leaderboard once the game is over (and whether this player is on it).
  useEffect(() => {
    if (!over) return;
    let alive = true;
    setBoardFailed(false);
    void loadStanding(id, save.guest).then((st) => { if (alive) setStanding(st); }).catch(() => { if (alive) setBoardFailed(true); });
    return () => { alive = false; };
  }, [over, id, save.guest, boardTry]);

  // On the board already: send a finished game once.
  useEffect(() => {
    if (!over || rec.sent || !save.guest || !standing?.onBoard) return;
    void sendDailyResult(id, day, guesses, save.guest).then(() => {
      write({ sent: true });
      return loadStanding(id, save.guest);
    }).then((st) => st && setStanding(st)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, rec.sent, save.guest, standing?.onBoard]);

  const start = () => {
    const guest = save.guest ?? newGuestId();
    write({ startedAt: Date.now() }, (s) => (s.guest ? s : { ...s, guest }));
    void startClock(id, guest);
  };

  // The Dex's list shrinks to what still fits (height and weight left out, as on the site).
  const fits = useMemo(() => (id === "dex" && hints.length && !solved ? stillFit(puzzle, hints, ["measure"]).filter((c) => !guesses.includes(c.name)) : null), [id, puzzle, hints, guesses, solved]);
  const options = useMemo(() => {
    const left = puzzle.characters.filter((c) => !guesses.includes(c.name));
    return (fits?.length && !showAll ? fits : left)
      .map((c) => ({ value: id === "dex" ? dexSearchValue(c.name) : c.name, label: c.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, [puzzle, guesses, fits, showAll, id]);
  const pickedName = options.find((o) => o.value === pick)?.label ?? null;

  const guess = () => {
    if (!pickedName || over) return;
    const next = [...guesses, pickedName];
    const h = hintFor(pickedName, answer, puzzle);
    setPick("");
    const done = !!h?.correct || next.length >= total;
    setNote(h?.correct ? null : next.length === main && puzzle.lastChance ? "Last chance: here's the first letter." : done ? null : "Not it. A new hint is below.");
    write({ guesses: next, ...(done ? { finishedAt: Date.now() } : {}) }, (s) => {
      if (!done) return s;
      const st = h?.correct ? nextStreak(s.streaks?.[id], day) : { last: null, count: 0 };
      return { ...s, streaks: { ...s.streaks, [id]: st } };
    });
  };

  const seconds = rec.startedAt && rec.finishedAt ? Math.max(1, Math.round((rec.finishedAt - rec.startedAt) / 1000)) : null;
  const streak = liveStreak(save.streaks?.[id], day);
  const result = solved ? (hints.length > main ? "Saved on the last chance" : `Got it in ${hints.length}!`) : "Not today";

  const share = async () => {
    setSharing(true);
    try {
      const detail = [streak > 1 ? `${streak} day streak` : null, solved && seconds ? `Solved in ${clock(seconds)}` : null].filter(Boolean).join("  ·  ") || "A new puzzle every day";
      const image = await drawDailyCard({ title: `${schedule.title} #${number}`, headline: result, rows: hints.map((h) => h.cells.map((c) => c.status)), detail, colors: COLORS[id] });
      const text = solved ? `${schedule.title} #${number}: ${result.replace(/!$/, "")}. Can you get it?` : `${schedule.title} #${number} got me today. Can you get it?`;
      await onShare(image, text);
    } catch { /* closing the share sheet isn't an error */ } finally { setSharing(false); }
  };

  const join = async () => {
    if (!save.guest || !nick.trim()) return;
    setJoining(true); setBoardNote(null);
    try {
      await joinBoard(nick.trim(), save.guest);
      if (over && !rec.sent) { await sendDailyResult(id, day, guesses, save.guest).catch(() => null); write({ sent: true }); }
      setStanding(await loadStanding(id, save.guest));
    } catch (err) {
      setBoardNote(err instanceof Error && err.message !== "failed" ? err.message : "Couldn't join just now. Try again.");
    } finally { setJoining(false); }
  };

  const ladder = ladderShown(answer, hints.length);
  const reveal = lastChance ? letterReveal(answer.name) : null;

  return (
    <div className="ig-daily" style={{ ["--ig-d1" as string]: COLORS[id][0], ["--ig-d2" as string]: COLORS[id][1] }}>
      <section className="ig-card">
        <div className="ig-band ig-band--daily">
          <span className="ig-kicker">{schedule.title} #{number}</span>
          <h1 className="ig-question">Guess today&apos;s {noun}</h1>
        </div>

        {!started ? (
          <div className="ig-start">
            <p>{main} guesses{puzzle.lastChance ? ", then one last chance with the first letter" : ""}. Each guess shows how close you are{puzzle.arrows ? ", with arrows for higher or lower" : ""}. A new hint after every miss.</p>
            <Button variant="primary" fullWidth onClick={start}>Start today&apos;s puzzle</Button>
          </div>
        ) : (
          <>
            {ladder.length > 0 && (
              <ul className="ig-hints" aria-label="Hints">
                {ladder.map((h) => <li key={h.after}>{h.text}</li>)}
              </ul>
            )}
            {reveal && (
              <div className="ig-reveal" role="img" aria-label={`Starts with ${answer.name[0]}, ${letterCount(answer.name)} letters`}>
                {reveal.map((c, i) => c.kind === "gap" ? <span key={i} className="ig-reveal__gap" /> : <span key={i} className={c.kind === "blank" ? "ig-reveal__cell" : "ig-reveal__cell ig-reveal__cell--shown"}>{c.kind === "blank" ? "" : c.ch}</span>)}
              </div>
            )}
            {!over && (
              <div className="ig-form">
                <LabeledCombobox label={`Guess today's ${noun}`} value={pick} onChange={setPick} options={options} placeholder={`Type a ${noun}`} allowCreate={false} />
                <Button variant="primary" fullWidth disabled={!pickedName} onClick={guess}>{lastChance ? "Last guess" : `Guess (${hints.length + 1} of ${main})`}</Button>
                {fits && fits.length > 0 && (
                  <div className="ig-fit">
                    <span><strong>{fits.length.toLocaleString("en-US")}</strong> {fits.length === 1 ? "Pokémon still fits" : "Pokémon still fit"} your clues</span>
                    <Switch size="small" label="Show all" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                  </div>
                )}
                {note && <p className="ig-note ig-note--plain" role="status">{note}</p>}
              </div>
            )}
            {hints.length > 0 && (
              <div className="ig-grid-wrap">
                <table className="ig-grid">
                  <thead><tr><th scope="col"><span className="sr-only">Guess</span></th>{traits.map((t) => <th key={t.label} scope="col">{t.short}</th>)}</tr></thead>
                  <tbody>
                    {[...hints].reverse().map((h) => (
                      <tr key={h.name} className={h.correct ? "ig-grid__win" : undefined}>
                        <th scope="row"><span className="ig-who"><span className="ig-tile" style={{ background: tileColor(h.name) }} aria-hidden="true">{h.name[0]}</span><span className="ig-who__name">{h.name}</span></span></th>
                        {h.cells.map((c, i) => <td key={traits[i].label}><span className={`ig-cell ig-cell--${c.status}`}>{cellText(traits[i], c, !!puzzle.arrows)}<span className="sr-only">, {STATUS_WORD[c.status]}{c.dir ? `, the answer is ${c.dir === "up" ? (traits[i].dirWords?.[0] ?? "higher") : (traits[i].dirWords?.[1] ?? "lower")}` : ""}</span></span></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {over && (
              <div className="ig-result">
                <p className="ig-score">{result}</p>
                <p>It was <strong>{answer.name}</strong>.{solved && seconds ? ` Solved in ${clock(seconds)}.` : ""}</p>
                <p className="ig-fine">A new {noun} at midnight Pacific.</p>
              </div>
            )}
          </>
        )}
      </section>

      {over && (
        <>
          <div className="ig-share"><Button variant="secondary" fullWidth onClick={() => void share()} disabled={sharing}>{sharing ? "Getting it ready…" : "Share with friends"}</Button></div>
          <section className="ig-card" aria-labelledby={`ig-board-${id}`}>
            <span className="ig-kicker ig-kicker--dark">Today&apos;s leaderboard</span>
            <h2 id={`ig-board-${id}`} className="ig-board-q">{standing?.onBoard ? `You're on it as ${standing.name}` : "Put your score on the board"}</h2>
            {boardFailed && !standing && (
              <div className="ig-form">
                <p className="ig-fine">Couldn&apos;t load today&apos;s leaderboard. Check your connection.</p>
                <Button variant="secondary" fullWidth onClick={() => setBoardTry((n) => n + 1)}>Try again</Button>
              </div>
            )}
            {standing && !standing.onBoard && (
              <div className="ig-form">
                <p className="ig-fine">Pick a nickname (not your Facebook name). You&apos;ll play against everyone on GameShuffle today.</p>
                <Input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Nickname" aria-label="Nickname" maxLength={24} autoComplete="off" />
                <Button variant="primary" fullWidth onClick={() => void join()} disabled={joining || nick.trim().length < 2}>{joining ? "Joining…" : "Join the leaderboard"}</Button>
                {boardNote && <p className="ig-note ig-note--bad" role="status">{boardNote}</p>}
              </div>
            )}
            {standing?.board?.ready && standing.board.rows.length > 0 && (
              <ol className="ig-board">
                {standing.board.rows.map((r) => (
                  <li key={`${r.place}-${r.name}`} className={r.you ? "ig-board__row ig-board__row--you" : "ig-board__row"}>
                    <span className="ig-board__place">{r.place}</span>
                    <span className="ig-board__name">{r.name}{r.you ? " (you)" : ""}</span>
                    <span className="ig-board__time">{r.seconds ? clock(r.seconds) : ""}</span>
                    <span className="ig-board__pts">{r.points}</span>
                  </li>
                ))}
                {standing.board.you && !standing.board.rows.some((r) => r.you) && (
                  <li className="ig-board__row ig-board__row--you"><span className="ig-board__place">{standing.board.you.place}</span><span className="ig-board__name">{standing.board.you.name} (you)</span><span className="ig-board__time">{standing.board.you.seconds ? clock(standing.board.you.seconds) : ""}</span><span className="ig-board__pts">{standing.board.you.points}</span></li>
                )}
              </ol>
            )}
            {standing?.board?.ready && standing.board.rows.length === 0 && <p className="ig-fine">Nobody&apos;s on today&apos;s board yet. Be the first.</p>}
          </section>
        </>
      )}
    </div>
  );
}
