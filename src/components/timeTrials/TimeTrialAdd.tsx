"use client";

/**
 * Add a time trial time (picks 2026-10-29; round 2). The result screenshot comes first and is required:
 * we read the track and time from it, the player checks, nothing saves until they press Add. Then the
 * fields in pairs (track and time, items and speed) and the vehicle (Mario Kart 8 Deluxe). Only a time
 * that lands in its board's top ten is asked for a clip of the run's last 30 seconds, after saving (round
 * 2 tightening, 6A): it shows as Unverified until a reviewer checks one. Used in the Add a time window.
 */

import { useId, useMemo, useRef, useState } from "react";
import { Alert, Button, Chip, FormField, Input } from "@empac/cascadeds";
import { IconCamera, IconCheck, IconLink, IconVideo } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { track as trackEvent, EVENTS } from "@/lib/analytics/events";
import { formatGap, formatTime, ordinal, parseTime } from "@/lib/timeTrials/rules";
import { TT_GAMES, TT_GAME_ORDER, ttCups, ttTrack, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import { categoryText, ITEMS, VEHICLES, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";

export interface AddedTime { timeId: string; best: boolean; previousMs: number | null; place: number; total: number; needsVideo?: boolean; videoAdded?: boolean }

type Read = { game: TtGame | null; trackId: string | null; cc: TtClass | null; timeMs: number | null; notResult: boolean };

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
  bad_track: "Pick a track.",
  bad_class: "Pick a speed class.",
  bad_video: "Use a YouTube, Twitch, Streamable or Medal link.",
  bad_proof: "That screenshot didn't upload. Add it again.",
  not_ready: "Time trials aren't open yet. Try again soon.",
  slow_down: "That's a lot of times. Wait a few minutes and try again.",
  signin: "Sign in to add a time.",
  faster_than_record: "That's faster than the world record on this track. Check the time.",
  screenshot_required: "Add your result screenshot first. It's your proof.",
};

export function TimeTrialAdd({ game: startGame, track: startTrack, cc: startCc, items: startItems = "shrooms", vehicle: startVehicle = "any", onAdded }: {
  game: TtGame; track?: string | null; cc?: TtClass | null; items?: TtItems; vehicle?: TtVehicle; onAdded?: (r: AddedTime, info: { game: TtGame; track: string; cc: TtClass; timeMs: number }) => void;
}) {
  const id = useId();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [game, setGame] = useState<TtGame>(startGame);
  const [trackId, setTrackId] = useState<string>(startTrack && ttTrack(startGame, startTrack) ? startTrack : "");
  const [cc, setCc] = useState<TtClass>(startCc && (TT_GAMES[startGame].classes as number[]).includes(startCc) ? startCc : TT_GAMES[startGame].classes[0]);
  const [items, setItems] = useState<TtItems>(startItems);
  const [vehicle, setVehicle] = useState<TtVehicle>(startGame === "mk8dx" ? startVehicle : "any");
  const [time, setTime] = useState("");
  const [clip, setClip] = useState("");
  const [clipNote, setClipNote] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ r: AddedTime; timeMs: number } | null>(null);

  const classes = TT_GAMES[game].classes;
  const groups = useMemo(() => ttCups(game).map((c) => ({ label: `${c.cup}${/Cup$|Mario Kart$/.test(c.cup) ? "" : " Cup"}`, options: c.tracks.map((t) => ({ value: t.id, label: t.name })) })), [game]);
  const timeMs = parseTime(time);

  function pickGame(g: TtGame) {
    if (g === game) return;
    setGame(g);
    setTrackId("");
    setCc(TT_GAMES[g].classes[0]);
    if (g !== "mk8dx") setVehicle("any");
    setRead(null);
  }

  async function upload(file: File) {
    setBusy("read"); setError(null); setReadNote(null); setRead(null);
    const form = new FormData();
    form.set("file", file);
    form.set("game", game);
    try {
      const res = await fetch("/api/time-trials/read", { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; proofUrl?: string; read?: Read | null; error?: string };
      if (!res.ok || !j.ok) { setError(READ_ERRORS[j.error ?? ""] ?? "That picture didn't upload. Try again."); return; }
      setProofUrl(j.proofUrl ?? null);
      if (!j.read) {
        setReadNote(READ_ERRORS[j.error ?? "failed"] ?? READ_ERRORS.failed);
        trackEvent(EVENTS.ttScreenshotRead, { game, result: j.error === "cap" ? "cap" : "unread" });
        return;
      }
      const r = j.read;
      trackEvent(EVENTS.ttScreenshotRead, { game, result: r.timeMs ? "read" : "unread" });
      if (r.notResult) { setReadNote("That doesn't look like a time trial result. Type the time yourself."); return; }
      if (r.game && r.game !== game) setGame(r.game);
      if (r.trackId) setTrackId(r.trackId);
      if (r.cc) setCc(r.cc);
      if (r.timeMs) setTime(formatTime(r.timeMs));
      setRead(r);
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
    setBusy("save");
    try {
      const res = await fetch("/api/time-trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, track: trackId, cc, items, vehicle, time: timeMs, proofUrl, read: !!read?.timeMs && read.timeMs === timeMs }),
      });
      const j = (await res.json().catch(() => ({}))) as AddedTime & { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) { setError(SAVE_ERRORS[j.error ?? ""] ?? "That time couldn't be saved. Try again."); return; }
      trackEvent(EVENTS.ttAdded, { game, items, vehicle, top: j.needsVideo ? "yes" : "no", read: read?.timeMs === timeMs ? "yes" : "no" });
      setDone({ r: j, timeMs });
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
      const res = await fetch(`/api/time-trials/${done.r.timeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "video", url: clip }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { setClipNote(j.error === "bad_video" ? "Use a YouTube, Twitch, Streamable or Medal link." : "That clip couldn't be added. Try again."); return; }
      setDone({ ...done, r: { ...done.r, videoAdded: true } });
      toast.success("Clip added. A reviewer will check it.");
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
          {done.r.best && done.r.previousMs != null ? `New best, ${formatGap(done.r.previousMs - done.timeMs)} faster than before.` : done.r.best ? "Your first time on this board." : done.r.previousMs != null ? `Your best is still ${formatTime(done.r.previousMs)}.` : ""}
        </p>
        <p className="tt-add__place">{ordinal(done.r.place)} of {done.r.total} on GameShuffle</p>
        {askClip && (
          <div className="tt-add__clip">
            <p className="tt-add__clip-head">Top-ten times need a clip</p>
            <p className="tt-note">A clip of the run&apos;s last 30 seconds. Your time shows as Unverified until a reviewer checks it. Add the link now, or later from the board.</p>
            <FormField label="Video link" htmlFor={`${id}-clip`} helperText="YouTube, Twitch, Streamable or Medal">
              <Input id={`${id}-clip`} value={clip} onChange={(e) => setClip(e.target.value)} iconBefore={IconLink} inputMode="url" autoComplete="off" fullWidth />
            </FormField>
            {clipNote && <Alert variant="error">{clipNote}</Alert>}
          </div>
        )}
        {done.r.videoAdded && <p className="tt-note">Your clip is in the review queue. The time shows as Verified once it&apos;s checked.</p>}
        <div className="tt-add__actions">
          {askClip && <Button variant="primary" iconBefore={IconVideo} loading={busy === "save"} disabled={!clip.trim()} onClick={() => void addClip()}>Add clip</Button>}
          <Button variant="secondary" onClick={() => { setDone(null); setTime(""); setClip(""); setProofUrl(null); setRead(null); setReadNote(null); }}>{askClip ? "Later" : "Add another time"}</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="tt-add" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="tt-add__field" role="group" aria-labelledby={`${id}-game`}>
        <span id={`${id}-game`} className="tt-add__label">Game</span>
        <div className="tt-add__chips">
          {TT_GAME_ORDER.map((g) => (
            <Chip key={g} label={TT_GAMES[g].label} clickable selected={g === game} onClick={() => pickGame(g)} />
          ))}
        </div>
      </div>

      <div className="tt-add__shot">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        <span className="tt-add__label">Result screenshot</span>
        <Button type="button" variant={proofUrl ? "secondary" : "primary"} iconBefore={IconCamera} loading={busy === "read"} onClick={() => fileRef.current?.click()}>
          {proofUrl ? "Use a different screenshot" : "Add your screenshot"}
        </Button>
        <p className="tt-add__hint">Needed for every time: it&apos;s your proof. We read the track and time from it for you to check.</p>
        {proofUrl && (
          <p className="tt-add__proof"><IconCheck size={18} aria-hidden="true" /> Screenshot added as proof</p>
        )}
        {read?.timeMs && !readNote && <Alert variant="success">From your screenshot: check the track and time below, then add it.</Alert>}
        {readNote && <Alert variant="info">{readNote}</Alert>}
      </div>

      <div className="tt-add__pair">
        <FormField label="Track" htmlFor={`${id}-track`}>
          <Select id={`${id}-track`} value={trackId} onChange={(v) => setTrackId(String(v))} groups={groups} placeholder="Pick a track" searchable fullWidth />
        </FormField>
        <FormField label="Time" htmlFor={`${id}-time`} helperText="Like 1:52.384" errorText={time && !timeMs ? "Type the time like 1:52.384" : undefined}>
          <Input id={`${id}-time`} value={time} onChange={(e) => setTime(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="1:52.384" className="tt-add__time" fullWidth />
        </FormField>
      </div>

      <div className="tt-add__pair">
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
      </div>

      {game === "mk8dx" && (
        <FormField label="Vehicle" htmlFor={`${id}-vehicle`} helperText="Pick one for the inside drift, Mr. Scooty and Teddy Buggy boards. Every time also counts on the open board.">
          <Select id={`${id}-vehicle`} value={vehicle} onChange={(v) => setVehicle(String(v) as TtVehicle)} options={VEHICLES.map((v) => ({ value: v.id, label: v.long }))} fullWidth />
        </FormField>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      <div className="tt-add__actions">
        <Button type="submit" variant="primary" loading={busy === "save"} disabled={busy === "read"}>Add time</Button>
      </div>
    </form>
  );
}
