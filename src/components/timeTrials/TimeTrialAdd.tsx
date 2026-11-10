"use client";

/**
 * Add a time trial time (picks 2026-10-29; round 2). The result screenshot comes first and is required:
 * we read the track and time from it, the player checks, nothing saves until they press Add. Then the
 * fields in pairs (track and time, items and speed), the laps (read from the screen with the time, changeable,
 * checked against the total; round 3 pick 2A) and the vehicle when the game has vehicle boards. Only a time
 * that lands in its board's top ten is asked for a clip of the run's last 30 seconds, after saving (round
 * 2 tightening, 6A): it shows as Unverified until a reviewer checks one. Used in the Add a time window.
 * With `challenge` (a game space's time trial of the day or Combo Cup, spaces round three) the game, track list,
 * speed and items are fixed, the time goes to the challenge (which also puts it on the track's own board when it's
 * your best there), and the day's top three or the week's top ten add a clip.
 * With `event` (a time trial tournament, picks 2026-11-05) the board and tracks are the event's, the time goes to the
 * event (and onto the boards when it's your best there), and the organizer's clip rule says who adds a clip.
 * Kirby Air Riders (2026-11-09): the game is fixed (the Mario Kart chips stay Mario Kart), no items or speed, the
 * machine is required (the game keeps records per machine), a lap field per lap of the course's default (none for a
 * one-lap course), and the screenshot is proof only: the player types the time (we don't read Kirby screens yet).
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, Button, Chip, FormField, Input } from "@empac/cascadeds";
import { IconCamera, IconCheck, IconLink, IconVideo } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { track as trackEvent, EVENTS } from "@/lib/analytics/events";
import { formatGap, formatLap, formatTime, LAP_SLACK_MS, ordinal, parseLap, parseTime } from "@/lib/timeTrials/rules";
import { cupLabel, lapsOf, TT_GAMES, TT_GAME_ORDER, ttCups, ttTrack, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import { categoryText, hasItems, isSavableVehicle, ITEMS, KAR_MACHINE_TYPES, savableVehicles, vehicleFor, vehicleRequired, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import { countryCodes } from "@/lib/lounge/flags";
import { countryName } from "@/lib/lounge/countries";

export interface AddedTime { timeId: string; best: boolean; previousMs: number | null; place: number; total: number; needsVideo?: boolean; videoAdded?: boolean; trusted?: boolean }

type Read = { game: TtGame | null; trackId: string | null; cc: TtClass | null; timeMs: number | null; laps?: number[] | null; notResult: boolean;
  /** The parts the screen names (the ghost data screen) and the vehicle board the body belongs to; the flag's country. */
  parts?: { body: string; wheels: string | null; glider: string | null } | null; board?: TtVehicle | null; flag?: string | null };
const BLANK_LAPS = ["", "", ""];

const READ_ERRORS: Record<string, string> = {
  cap: "That's all the screenshots we can read for you today. Type the time and the screenshot still counts as proof.",
  failed: "We couldn't read that screenshot. Type the time and it still counts as proof.",
  not_configured: "Reading screenshots is off right now. Type the time and the screenshot still counts as proof.",
  bad_type: "Use a PNG, JPEG or WebP picture.",
  too_big: "That picture is over 8 MB.",
  storage: "Pictures can't be saved right now. Try again later or use a video link.",
  slow_down: "That's a lot of pictures. Wait a few minutes and try again.",
};
const SAVE_ERRORS: Record<string, string> = {
  bad_time: "Type the time like 1:52.384.",
  machine_required: "Pick the machine you raced on.",
  bad_track: "Pick a track.",
  bad_class: "Pick a speed class.",
  bad_video: "Use a link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram.",
  bad_proof: "That screenshot didn't upload. Add it again.",
  not_ready: "Time trials aren't open yet. Try again soon.",
  slow_down: "That's a lot of times. Wait a few minutes and try again.",
  signin: "Sign in to add a time.",
  faster_than_record: "That's faster than the world record on this track. Check the time.",
  screenshot_required: "Add your result screenshot first. It's your proof.",
  wrong_combo: "Your screenshot shows a different combo. Race it with the challenge's combo and add that screenshot.",
  wrong_track: "That track isn't in this challenge.",
  closed: "This challenge has closed. A new one is up.",
};

/** A game space's time trial challenge: where the time goes and which tracks count. */
export interface TtChallenge { space: string; kind: "day" | "week"; tracks: string[]; /** "today's combo". */ combo: string }

/** A time trial tournament: its board and the tracks open to you now (a run-off is one track). */
export interface TtEventTarget { tournamentId: string; tracks: string[]; runoff: boolean; /** "Mario Kart 8 Deluxe · 150cc · Mushrooms". */ line: string; clipRule: string;
  /** A Swiss or bracket match decided by time trial: the reply is the match score, not a place on the track. */
  match?: boolean }

export function TimeTrialAdd({ game: startGame, track: startTrack, cc: startCc, items: startItems = "shrooms", vehicle: startVehicle = "any", onAdded, challenge, event }: {
  game: TtGame; track?: string | null; cc?: TtClass | null; items?: TtItems; vehicle?: TtVehicle; onAdded?: (r: AddedTime, info: { game: TtGame; track: string; cc: TtClass; timeMs: number }) => void;
  challenge?: TtChallenge;
  event?: TtEventTarget;
}) {
  // The tracks a challenge or an event allows; the board's own settings are fixed for both.
  const only = challenge?.tracks ?? event?.tracks ?? null;
  const fixed = !!challenge || !!event;
  const id = useId();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [game, setGame] = useState<TtGame>(startGame);
  const [trackId, setTrackId] = useState<string>(startTrack && ttTrack(startGame, startTrack) ? startTrack : event?.tracks.length === 1 ? event.tracks[0] : "");
  const [cc, setCc] = useState<TtClass>(startCc && (TT_GAMES[startGame].classes as number[]).includes(startCc) ? startCc : TT_GAMES[startGame].classes[0]);
  const [items, setItems] = useState<TtItems>(startItems);
  // A board-only filter (Kirby's No Legendaries) or "any" where a machine is required starts unpicked.
  const [vehicle, setVehicle] = useState<TtVehicle>(() => { const v = vehicleFor(startGame, startVehicle); return isSavableVehicle(startGame, v) ? v : "any"; });
  const [time, setTime] = useState("");
  const [clip, setClip] = useState("");
  const [clipNote, setClipNote] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [readToken, setReadToken] = useState<string | null>(null);
  const [laps, setLaps] = useState<string[]>(BLANK_LAPS);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ r: AddedTime; timeMs: number } | null>(null);
  const [matchScore, setMatchScore] = useState<{ won: number; lost: number; settled?: boolean; held?: boolean } | null>(null);
  // Round 4 (pick 1A): a player without a country picks one here, starting on the country they're connecting from.
  const [needsCountry, setNeedsCountry] = useState(false);
  const [country, setCountry] = useState("");
  // Set once the player picks a country themselves, so a screenshot's flag doesn't change it after.
  const countryPicked = useRef(false);
  useEffect(() => {
    let live = true;
    fetch("/api/time-trials/country").then((r) => r.json()).then((j: { ok?: boolean; country?: string | null; suggest?: string | null }) => {
      if (!live || !j.ok || j.country) return;
      setNeedsCountry(true);
      if (j.suggest) setCountry(j.suggest);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const countryOptions = useMemo(() => [{ value: "", label: "Not now" }, ...countryCodes().filter((c) => /^[a-z]{2}$/.test(c)).map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label))], []);

  const classes = TT_GAMES[game].classes;
  const kirby = !hasItems(game);
  const word = TT_GAMES[game].trackWord;
  const groups = useMemo(() => ttCups(game)
    .map((c) => ({ label: /Cup$/.test(c.cup) ? c.cup : cupLabel(c.cup), options: c.tracks.filter((t) => !only || only.includes(t.id)).map((t) => ({ value: t.id, label: t.name })) }))
    .filter((g) => g.options.length > 0), [game, only]);
  const timeMs = parseTime(time, TT_GAMES[game].minMs);
  // Kirby: one field per lap of the course's default count (no fields for a one-lap course); Mario Kart keeps three,
  // or however many sections the screenshot showed.
  const lapCount = kirby ? lapsOf(ttTrack(game, trackId)) : laps.length;
  const lapRow = kirby ? Array.from({ length: lapCount > 1 ? lapCount : 0 }, (_, i) => laps[i] ?? "") : laps;
  const lapMs = lapRow.map((l) => (l.trim() ? parseLap(l) : null));
  const lapsTyped = lapRow.some((l) => l.trim());
  const lapsOk = lapsTyped && lapMs.every((l) => l != null);
  const lapSum = lapsOk ? (lapMs as number[]).reduce((a, b) => a + b, 0) : null;
  const vehicles = savableVehicles(game);
  // Kirby's machines by type, for the Machine picker.
  const machineGroups = kirby ? KAR_MACHINE_TYPES.map((t) => ({ label: t.label, options: vehicles.filter((v) => v.type === t.id).map((v) => ({ value: v.id, label: v.long })) })).filter((g) => g.options.length > 0) : [];

  function pickGame(g: TtGame) {
    if (g === game) return;
    setGame(g);
    setTrackId("");
    setCc(TT_GAMES[g].classes[0]);
    setVehicle("any");
    setRead(null);
  }

  async function upload(file: File) {
    setBusy("read"); setError(null); setReadNote(null); setRead(null); setReadToken(null);
    const form = new FormData();
    form.set("file", file);
    form.set("game", game);
    try {
      const res = await fetch("/api/time-trials/read", { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; proofUrl?: string; read?: Read | null; readToken?: string; error?: string };
      if (!res.ok || !j.ok) { setError(READ_ERRORS[j.error ?? ""] ?? "That picture didn't upload. Try again."); return; }
      setProofUrl(j.proofUrl ?? null);
      // Kirby's screenshots are proof only: the hint already says to type the time.
      if (!j.read && j.error === "manual") return;
      if (!j.read) {
        setReadNote(READ_ERRORS[j.error ?? "failed"] ?? READ_ERRORS.failed);
        trackEvent(EVENTS.ttScreenshotRead, { game, result: j.error === "cap" ? "cap" : "unread" });
        return;
      }
      const r = j.read;
      trackEvent(EVENTS.ttScreenshotRead, { game, result: r.timeMs ? "read" : "unread" });
      if (r.notResult) { setReadNote("That doesn't look like a time trial result. Type the time yourself."); return; }
      if (r.game && r.game !== game && !fixed) setGame(r.game);
      if (r.trackId && (!only || only.includes(r.trackId))) setTrackId(r.trackId);
      if (only && r.trackId && !only.includes(r.trackId)) { setRead(r); setReadToken(j.readToken ?? null); setReadNote(`That screenshot is from ${ttTrack(game, r.trackId)?.name ?? "another track"}, which isn't in this ${event ? (event.runoff ? "run-off" : "round") : "challenge"}.`); return; }
      if (r.cc && !fixed) setCc(r.cc);
      if (r.timeMs) setTime(formatTime(r.timeMs));
      setLaps(r.laps?.length ? r.laps.map(formatLap) : BLANK_LAPS);
      // The vehicle the screen names starts the Vehicle field on its board (picks 2026-11-04); the player can change it.
      const g = r.game ?? game;
      if (r.board && !fixed && savableVehicles(g).some((v) => v.id === r.board)) setVehicle(r.board);
      // A player without a country starts on the screenshot's flag.
      if (r.flag && needsCountry && !countryPicked.current) setCountry(r.flag);
      setRead(r);
      setReadToken(j.readToken ?? null);
      if (!r.timeMs) setReadNote("We couldn't read every digit of the time. Type it yourself.");
      else if (!r.trackId) setReadNote("The screenshot doesn't say which track. Pick it below.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setError(null);
    if (!proofUrl) { setError(SAVE_ERRORS.screenshot_required); return; }
    if (!trackId) { setError(SAVE_ERRORS.bad_track); return; }
    if (!timeMs) { setError(SAVE_ERRORS.bad_time); return; }
    if (vehicleRequired(game) && !isSavableVehicle(game, vehicle)) { setError(SAVE_ERRORS.machine_required); return; }
    if (lapsTyped && !lapsOk) { setError("Type each lap like 34.112, or leave the laps empty."); return; }
    setBusy("save");
    try {
      const res = await fetch(event ? `/api/tournament/${event.tournamentId}/tt` : challenge ? `/api/games/${challenge.space}/tt` : "/api/time-trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event
          ? { action: "add", track: trackId, time: timeMs, proofUrl, readToken, laps: lapsOk ? lapMs : [], runoff: event.runoff }
          : challenge
          ? { kind: challenge.kind, track: trackId, time: timeMs, proofUrl, readToken, laps: lapsOk ? lapMs : [] }
          : { game, track: trackId, cc, items, vehicle, time: timeMs, proofUrl, readToken, laps: lapsOk ? lapMs : [] }),
      });
      const raw = (await res.json().catch(() => ({}))) as AddedTime & { ok?: boolean; error?: string; message?: string; added?: { timeId: string; place: number; total: number; needsClip: boolean }; match?: { won: number; lost: number; settled?: boolean; held?: boolean } };
      if (raw.match) setMatchScore(raw.match);
      if (!res.ok || !raw.ok) { setError(SAVE_ERRORS[raw.error ?? ""] ?? raw.message ?? "That time couldn't be saved. Try again."); return; }
      // An event answers with its own place on the track and whether the organizer's clip rule asks for one.
      const j: AddedTime & { ok?: boolean } = event && raw.added
        ? { ok: true, timeId: raw.added.timeId, best: true, previousMs: null, place: raw.added.place, total: raw.added.total, needsVideo: raw.added.needsClip }
        : raw;
      trackEvent(EVENTS.ttAdded, { game, items, vehicle, top: j.needsVideo ? "yes" : "no", read: read?.timeMs === timeMs ? "yes" : "no" });
      setDone({ r: j, timeMs });
      if (needsCountry && country) {
        void fetch("/api/time-trials/country", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country }) }).then((r) => { if (r.ok) setNeedsCountry(false); });
      }
      toast.success(j.best ? "New best saved" : "Time saved");
      onAdded?.(j, { game, track: trackId, cc, timeMs });
    } finally {
      setBusy(null);
    }
  }

  async function addClip() {
    if (!done) return;
    setBusy("save"); setClipNote(null);
    try {
      const res = event
        ? await fetch(`/api/tournament/${event.tournamentId}/tt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clip", timeId: done.r.timeId, url: clip }) })
        : challenge
        ? await fetch(`/api/games/${challenge.space}/tt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clip", entryId: done.r.timeId, url: clip }) })
        : await fetch(`/api/time-trials/${done.r.timeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "video", url: clip }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { setClipNote(j.error === "bad_video" ? "Use a link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram." : "That clip couldn't be added. Try again."); return; }
      setDone({ ...done, r: { ...done.r, videoAdded: true } });
      toast.success(event ? "Clip added. The organizer will check it." : "Clip added. A reviewer will check it.");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    const t = ttTrack(game, trackId);
    const askClip = done.r.needsVideo && !done.r.videoAdded;
    return (
      <div className="tt-add tt-add--done" role="status">
        <p className="tt-add__big">{formatTime(done.timeMs)}</p>
        <p>
          {t?.name} ({categoryText(game, cc, items, vehicle, classes.length > 1)}).{" "}
          {event ? "" : done.r.best && done.r.previousMs != null ? `New best, ${formatGap(done.r.previousMs - done.timeMs)} faster than before.` : done.r.best ? "Your first time on this board." : done.r.previousMs != null ? `Your best is still ${formatTime(done.r.previousMs)}.` : ""}
        </p>
        {event?.match && matchScore && <p className="tt-add__place">{matchScore.settled ? (matchScore.won > matchScore.lost ? `You won the match, ${matchScore.won} to ${matchScore.lost} in tracks` : `You lost the match, ${matchScore.won} to ${matchScore.lost} in tracks`) : matchScore.held ? `${matchScore.won > matchScore.lost ? "You won" : "You lost"} ${matchScore.won} to ${matchScore.lost} in tracks. It counts once the clips are checked` : matchScore.won > matchScore.lost ? `You lead ${matchScore.won} to ${matchScore.lost} in tracks` : matchScore.won < matchScore.lost ? `You trail ${matchScore.won} to ${matchScore.lost} in tracks` : `Level at ${matchScore.won} to ${matchScore.lost} in tracks`}</p>}
        {!(event?.runoff) && !event?.match && <p className="tt-add__place">{ordinal(done.r.place)} of {done.r.total} {event ? "on this track so far" : challenge ? (challenge.kind === "day" ? "today" : "on this track this week") : "on GameShuffle"}</p>}
        {askClip && (
          <div className="tt-add__clip">
            <p className="tt-add__clip-head">{event ? event.clipRule : challenge ? (challenge.kind === "day" ? "The top three need a clip" : "The top ten need a clip") : "Top-ten times need a clip"}</p>
            <p className="tt-note">{event ? `A clip of the run's last 30 seconds, before ${event.match ? "your match counts" : "the results are final"}. Add the link now, or later from the ${event.match ? "tournament" : "event"} page.` : "A clip of the run's last 30 seconds. Your time shows as Unverified until a reviewer checks it. Add the link now, or later from the board."}</p>
            <FormField label="Video link" htmlFor={`${id}-clip`} helperText="YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram">
              <Input id={`${id}-clip`} value={clip} onChange={(e) => setClip(e.target.value)} iconBefore={IconLink} inputMode="url" autoComplete="off" fullWidth />
            </FormField>
            {clipNote && <Alert variant="error">{clipNote}</Alert>}
          </div>
        )}
        {done.r.videoAdded && <p className="tt-note">{event ? (event.match ? "Your clip is waiting for a check. Your match counts once it's checked." : "Your clip is waiting for the organizer to check it.") : "Your clip is in the review queue. The time shows as Verified once it's checked."}</p>}
        {done.r.trusted && <p className="tt-note">You&apos;re Trusted, so this top-ten time doesn&apos;t need a clip.</p>}
        <div className="tt-add__actions">
          {askClip && <Button variant="primary" iconBefore={IconVideo} loading={busy === "save"} disabled={!clip.trim()} onClick={() => void addClip()}>Add clip</Button>}
          <Button variant="secondary" onClick={() => { setDone(null); setTime(""); setClip(""); setProofUrl(null); setRead(null); setReadToken(null); setLaps(BLANK_LAPS); setReadNote(null); }}>{askClip ? "Later" : "Add another time"}</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="tt-add" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {event ? (
        <p className="tt-add__fixed">{event.line}</p>
      ) : kirby ? (
        <p className="tt-add__fixed">{TT_GAMES[game].label} · Air Ride Time Attack</p>
      ) : challenge ? (
        <p className="tt-add__fixed">{TT_GAMES[game].label} · 150cc · Mushrooms · {challenge.combo}</p>
      ) : (
        <div className="tt-add__field" role="group" aria-labelledby={`${id}-game`}>
          <span id={`${id}-game`} className="tt-add__label">Game</span>
          <div className="tt-add__chips">
            {TT_GAME_ORDER.map((g) => (
              <Chip key={g} label={TT_GAMES[g].label} clickable selected={g === game} onClick={() => pickGame(g)} />
            ))}
          </div>
        </div>
      )}

      <div className="tt-add__shot">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        <span className="tt-add__label">Result screenshot</span>
        <Button type="button" variant={proofUrl ? "secondary" : "primary"} iconBefore={IconCamera} loading={busy === "read"} onClick={() => fileRef.current?.click()}>
          {proofUrl ? "Use a different screenshot" : "Add your screenshot"}
        </Button>
        <p className="tt-add__hint">{kirby ? "Needed for every time: it's your proof. Type the course and time from it below." : "Needed for every time: it's your proof. We read the track and time from it for you to check."}</p>
        {proofUrl && (
          <p className="tt-add__proof"><IconCheck size={18} aria-hidden="true" /> Screenshot added as proof</p>
        )}
        {read?.timeMs && !readNote && <Alert variant="success">From your screenshot: check the track{read.parts ? ", time and vehicle" : " and time"} below, then add it.</Alert>}
        {readNote && <Alert variant="info">{readNote}</Alert>}
      </div>

      <div className="tt-add__pair">
        <FormField label={kirby ? "Course" : "Track"} htmlFor={`${id}-track`}>
          <Select id={`${id}-track`} value={trackId} onChange={(v) => setTrackId(String(v))} groups={groups} placeholder={`Pick a ${word}`} searchable fullWidth />
        </FormField>
        <FormField label="Time" htmlFor={`${id}-time`} helperText="Like 1:52.384" errorText={time && !timeMs ? "Type the time like 1:52.384" : undefined}>
          <Input id={`${id}-time`} value={time} onChange={(e) => setTime(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="1:52.384" className="tt-add__time" fullWidth />
        </FormField>
      </div>

      {!fixed && !kirby && <div className="tt-add__pair">
        <div className="tt-add__field" role="group" aria-labelledby={`${id}-items`}>
          <span id={`${id}-items`} className="tt-add__label">Items</span>
          <div className="tt-add__chips">
            {ITEMS.map((i) => <Chip key={i.id} label={i.label} clickable selected={i.id === items} onClick={() => setItems(i.id)} />)}
          </div>
        </div>
        {classes.length > 1 && (
          <div className="tt-add__field" role="group" aria-labelledby={`${id}-cc`}>
            <span id={`${id}-cc`} className="tt-add__label">Speed class</span>
            <div className="tt-add__chips">
              {classes.map((c) => <Chip key={c} label={`${c}cc`} clickable selected={c === cc} onClick={() => setCc(c)} />)}
            </div>
          </div>
        )}
      </div>}

      {lapRow.length > 0 && <fieldset className="tt-add__laps">
        <legend className="tt-add__label">Laps <span className="tt-add__opt">(optional)</span></legend>
        <div className="tt-add__lap-row">
          {lapRow.map((l, i) => (
            <FormField key={i} label={`Lap ${i + 1}`} htmlFor={`${id}-lap-${i}`} errorText={l.trim() && lapMs[i] == null ? "Like 34.112" : undefined}>
              <Input id={`${id}-lap-${i}`} value={l} onChange={(e) => setLaps(lapRow.map((x, j) => (j === i ? e.target.value : x)))} inputMode="decimal" autoComplete="off" placeholder="34.112" fullWidth />
            </FormField>
          ))}
        </div>
        {lapSum != null && timeMs != null && (
          Math.abs(lapSum - timeMs) <= LAP_SLACK_MS
            ? <p className="tt-add__hint tt-add__hint--ok"><IconCheck size={16} aria-hidden="true" /> The laps add up to the time.</p>
            : <Alert variant="warning">The laps add up to {formatTime(lapSum)}, not {formatTime(timeMs)}. Check them; laps that don&apos;t add up go to an updater to look at.</Alert>
        )}
      </fieldset>}

      {kirby && (
        <FormField label="Machine" htmlFor={`${id}-machine`} helperText="The game keeps a record for each machine. Every time also counts on Any machine, and on No Legendaries unless it's Dragoon, Hydra or Leo." required>
          <Select id={`${id}-machine`} value={vehicle === "any" ? "" : vehicle} onChange={(v) => setVehicle(String(v) as TtVehicle)} groups={machineGroups} placeholder="Pick a machine" searchable fullWidth />
        </FormField>
      )}

      {vehicles.length > 1 && !fixed && !kirby && (
        <FormField label="Vehicle" htmlFor={`${id}-vehicle`} helperText={game === "mk8dx" ? "For a vehicle board. Every time also counts on the open board." : "For the Swoop, R.O.B.-HOG board. Every time also counts on the open board."}>
          <Select id={`${id}-vehicle`} value={vehicle} onChange={(v) => setVehicle(String(v) as TtVehicle)} options={vehicles.map((v) => ({ value: v.id, label: v.long }))} fullWidth />
          {read?.parts && <p className="tt-add__parts">Your screenshot shows the {read.parts.body}{read.board && read.board !== "any" ? `, so it starts on the ${vehicles.find((v) => v.id === read.board)?.label ?? "its"} board` : ""}.</p>}
        </FormField>
      )}

      {needsCountry && (
        <FormField label="Your country" htmlFor={`${id}-country`} helperText="Shows as a flag by your name and puts your times on your country's records. We only ask once.">
          <Select id={`${id}-country`} value={country} onChange={(v) => { countryPicked.current = true; setCountry(String(v)); }} options={countryOptions} searchable fullWidth />
        </FormField>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      <div className="tt-add__actions">
        <Button type="submit" variant="primary" loading={busy === "save"} disabled={busy === "read"}>Add time</Button>
      </div>
    </form>
  );
}
