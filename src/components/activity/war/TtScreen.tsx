"use client";

/**
 * The War room's Time trials tab (app screen pick 2A, https://claude.ai/artifact/5v2cNHwvZ4kh1E8EdzAzph): every
 * track's record with your gap, then Add a time from a result screenshot dropped right here. The boards switch like
 * the website's: This server or Everyone (Everyone only outside a server), speed, mushrooms and vehicle. Reads
 * /api/activity/tt with the Activity session; a saved time joins the server's board, a fallen record is posted in the
 * panel channel and the panels refresh, as with /tt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, FormField, Input, Modal } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { IconPhotoUp, IconPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { formatGap, formatTime, ordinal, parseTime } from "@/lib/timeTrials/rules";
import type { TtRoomRead, TtRoomRow, TtRoomSaved, TtRoomScope, TtRoomView } from "@/lib/timeTrials/activityView";
import type { TtVehicle } from "@/lib/timeTrials/categories";
import { fitPicture } from "@/lib/images/shrink";

type Game = "mkworld" | "mk8dx";
type Items = "shrooms" | "none";
type Auth = (init?: RequestInit) => RequestInit;

const GAMES: { id: Game; label: string }[] = [{ id: "mk8dx", label: "Mario Kart 8 Deluxe" }, { id: "mkworld", label: "Mario Kart World" }];
const READ_ERRORS: Record<string, string> = {
  cap: "That's all the screenshot reads for today. Type the time instead tomorrow, or use /tt add.",
  not_image: "That file isn't a picture we can open. Use a PNG, JPEG or WebP screenshot.",
  too_large: "That screenshot is too big (8 MB at most).",
  slow_down: "Slow down a moment, then try again.",
  not_configured: "Screenshot reading isn't set up right now.",
  failed: "Couldn't read that screenshot. Try again, or type the time.",
  store_failed: "Couldn't keep that screenshot just now. Try again in a minute.",
};
const ADD_ERRORS: Record<string, string> = {
  bad_time: "Type the time like 1:52.384.",
  bad_track: "Pick the track.",
  bad_proof: "Add the result screenshot again.",
  faster_than_record: "That's faster than the world record. Check the time.",
  slow_down: "Slow down a moment, then try again.",
};

function gapText(r: TtRoomRow): { text: string; tone: "rec" | "gap" | "none" } {
  if (r.record?.mine) return { text: "Record", tone: "rec" };
  if (r.mine == null) return { text: "No time yet", tone: "none" };
  if (!r.record) return { text: formatTime(r.mine), tone: "gap" };
  return { text: `+${formatGap(r.mine - r.record.ms)}`, tone: "gap" };
}

export function TtScreen({ auth }: { auth: Auth }) {
  const [game, setGame] = useState<Game>("mk8dx");
  const [cc, setCc] = useState<number | null>(null);
  const [items, setItems] = useState<Items>("shrooms");
  const [scope, setScope] = useState<TtRoomScope>("server");
  const [vehicle, setVehicle] = useState<TtVehicle>("any");
  const [view, setView] = useState<TtRoomView | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ game, items, scope, vehicle, ...(cc ? { cc: String(cc) } : {}) });
    const res = await fetch(`/api/activity/tt?${q}`, auth({ cache: "no-store" })).catch(() => null);
    if (!res?.ok) { setFailed(true); return; }
    setFailed(false);
    setView((await res.json()) as TtRoomView);
  }, [auth, game, cc, items, scope, vehicle]);

  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  // Outside a server the view answers Everyone whatever was asked.
  const shown = view && view.game === game && view.items === items && view.vehicle === vehicle && (view.scope === scope || !view.canServer) ? view : null;
  const canServer = view?.canServer ?? true;
  return (
    <section className="wr-tt" aria-labelledby="wr-tt-h">
      <h1 id="wr-tt-h" className="wr-sr">Time trials</h1>
      <div className="wr-tt__controls">
        <div className="wr-row" role="group" aria-label="Game">
          {GAMES.map((g) => (
            <Button key={g.id} size="small" variant={game === g.id ? "primary" : "secondary"} aria-pressed={game === g.id} onClick={() => { setGame(g.id); setCc(null); setVehicle("any"); }}>{g.label}</Button>
          ))}
        </div>
        {canServer && (
          <div className="wr-row" role="group" aria-label="Whose times">
            <Button size="small" variant={scope === "server" ? "primary" : "secondary"} aria-pressed={scope === "server"} onClick={() => setScope("server")}>This server</Button>
            <Button size="small" variant={scope === "everyone" ? "primary" : "secondary"} aria-pressed={scope === "everyone"} onClick={() => setScope("everyone")}>Everyone</Button>
          </div>
        )}
        <div className="wr-row" role="group" aria-label="Board">
          {(shown?.classes.length ?? 1) > 1 && shown!.classes.map((c) => (
            <Button key={c} size="small" variant={shown!.cc === c ? "primary" : "secondary"} aria-pressed={shown!.cc === c} onClick={() => setCc(c)}>{c}cc</Button>
          ))}
          <Button size="small" variant={items === "shrooms" ? "primary" : "secondary"} aria-pressed={items === "shrooms"} onClick={() => setItems("shrooms")}>Mushrooms</Button>
          <Button size="small" variant={items === "none" ? "primary" : "secondary"} aria-pressed={items === "none"} onClick={() => setItems("none")}>No mushrooms</Button>
        </div>
        {(view?.game === game ? view.vehicles.length : 0) > 1 && (
          <div className="wr-tt__vehicle">
            <FormField label="Vehicle" htmlFor="wr-tt-vehicle">
              <Select id="wr-tt-vehicle" size="small" options={view!.vehicles.map((v) => ({ value: v.id, label: v.label }))} value={vehicle} onChange={(v) => setVehicle(String(v) as TtVehicle)} />
            </FormField>
          </div>
        )}
      </div>

      {!shown ? (
        <p className="wr-note" role="status">{failed ? "Can't reach GameShuffle right now." : "Loading the boards…"}</p>
      ) : (
        <>
          <div className="wr-tt__sum">
            <p className="wr-muted">
              {shown.scope === "everyone" ? `${shown.withRecord} of ${shown.rows.length} tracks have a record on GameShuffle` : shown.server ? `${shown.withRecord} of ${shown.rows.length} tracks have a record in ${shown.server}` : `${shown.withRecord} of ${shown.rows.length} tracks have a server record`}
              {shown.withMine ? ` · you have times on ${shown.withMine}` : ""}
            </p>
            <Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setAdding(true)}>Add a time</Button>
          </div>
          <ul className="wr-tt__list">
            {shown.rows.map((r) => {
              const gap = gapText(r);
              return (
                <li key={r.id} className="wr-tt__row">
                  {/* eslint-disable-next-line @next/next/no-img-element -- course art through our own address */}
                  {r.image ? <img src={r.image} alt="" className="wr-tt__art" loading="lazy" /> : <span className="wr-tt__art wr-tt__art--blank" aria-hidden="true">{(r.code ?? r.name).slice(0, 3)}</span>}
                  <span className="wr-tt__track"><b>{r.code ?? r.name}</b>{r.code && <span>{r.name}</span>}</span>
                  <span className="wr-tt__rec">
                    {r.record ? <><b>{formatTime(r.record.ms)}</b><span>{r.record.name}{!r.record.checked ? " · unverified" : ""}</span></> : <span className="wr-muted">{shown.scope === "everyone" ? "No record yet" : "No server record"}</span>}
                  </span>
                  <span className={`wr-tt__gap is-${gap.tone}`}>
                    {r.mine != null && !r.record?.mine && r.record && <span className="wr-tt__you">You {formatTime(r.mine)}</span>}
                    <b>{gap.text}</b>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="wr-help"><a href={shown.boardUrl} target="_blank" rel="noopener noreferrer">{shown.scope === "server" ? <>This server&apos;s boards on GameShuffle</> : "These boards on GameShuffle"}<span className="wr-sr"> (opens in your browser)</span></a></p>
        </>
      )}
      {adding && shown && <AddTime view={shown} auth={auth} onClose={() => setAdding(false)} onSaved={() => void load()} />}
    </section>
  );
}

function AddTime({ view, auth, onClose, onSaved }: { view: TtRoomView; auth: Auth; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<TtRoomRead | null>(null);
  const [track, setTrack] = useState("");
  const [cc, setCc] = useState<number>(view.cc);
  const [items, setItems] = useState<Items>(view.items);
  const [vehicle, setVehicle] = useState<TtVehicle>(view.vehicle);
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<TtRoomSaved | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setReading(true);
    const fd = new FormData();
    // Vercel turns away requests over 4.5 MB: a phone photo of the screen is made smaller first.
    fd.append("file", await fitPicture(file));
    fd.append("game", view.game);
    const init = auth({ method: "POST", body: fd });
    // FormData sets its own content type with the boundary.
    const headers = new Headers(init.headers); headers.delete("Content-Type");
    const res = await fetch("/api/activity/tt", { ...init, headers }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as (TtRoomRead & { error?: string }) | null;
    setReading(false);
    if (!res?.ok || !j || j.error) { setError(READ_ERRORS[j?.error ?? "failed"] ?? READ_ERRORS.failed); return; }
    setRead(j);
    if (j.notResult) setError("That doesn't look like a time trial result. Check the details below or pick another screenshot.");
    if (j.track && (!j.game || j.game === view.game)) setTrack(j.track);
    if (j.cc && view.classes.includes(j.cc)) setCc(j.cc);
    if (j.timeMs) setTime(formatTime(j.timeMs));
  };

  const save = async () => {
    if (!read) return;
    const ms = parseTime(time);
    if (!track) { setError(ADD_ERRORS.bad_track); return; }
    if (!ms) { setError(ADD_ERRORS.bad_time); return; }
    setSaving(true); setError(null);
    const res = await fetch("/api/activity/tt", auth({ method: "POST", body: JSON.stringify({ action: "add", game: view.game, track, cc, items, vehicle, time: ms, proofUrl: read.proofUrl, token: read.token }) })).catch(() => null);
    const j = (await res?.json().catch(() => null)) as (TtRoomSaved & { error?: string }) | null;
    setSaving(false);
    if (!res?.ok || !j || j.error) { setError(ADD_ERRORS[j?.error ?? ""] ?? "That time couldn't be saved. Try again."); return; }
    setSaved(j);
    toast.success(j.recordPosted ? "New server record" : "Time saved");
    onSaved();
  };

  const trackOptions = view.rows.map((r) => ({ value: r.id, label: r.code ? `${r.code} · ${r.name}` : r.name }));
  const gameName = view.game === "mk8dx" ? "Mario Kart 8 Deluxe" : "Mario Kart World";

  return (
    <Modal isOpen onClose={onClose} title={`Add a ${gameName} time`} size="medium">
      <div className="wr-add">
        {saved ? (
          <div className="wr-add__done" role="status">
            <p><b>{time}</b> on {trackOptions.find((o) => o.value === track)?.label}.</p>
            <p className="wr-muted">
              {saved.best && saved.previousMs != null ? `New best, ${formatGap(saved.previousMs - (parseTime(time) ?? 0))} faster than before. ` : saved.best ? "Your first time on this track. " : saved.previousMs != null ? `Your best is still ${formatTime(saved.previousMs)}. ` : ""}
              {saved.server ? `${ordinal(saved.server.place)} of ${saved.server.total} in this server, ` : ""}{ordinal(saved.place)} of {saved.total} on GameShuffle.
            </p>
            {saved.recordPosted && <p className="wr-muted">It beat the server&apos;s record, so it&apos;s posted in the time trial channel.</p>}
            {saved.needsVideo && <p className="wr-muted">That&apos;s a top-ten time: it shows as Unverified until a reviewer checks a clip of the run&apos;s last 30 seconds. Add the clip from the time on GameShuffle or with /tt.</p>}
            <div className="wr-row">
              <Button variant="primary" onClick={() => { setSaved(null); setRead(null); setTrack(""); setTime(""); }}>Add another</Button>
              <Button variant="ghost" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : !read ? (
          <>
            <label
              className={`wr-drop${reading ? " is-busy" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void readFile(e.dataTransfer.files?.[0]); }}
            >
              <IconPhotoUp size={28} stroke={1.8} aria-hidden="true" />
              <b>{reading ? "Reading the screenshot…" : "Drop your result screenshot"}</b>
              <span className="wr-muted">or choose one. The track and time are read from it; you check them before saving.</span>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="wr-sr" disabled={reading} onChange={(e) => void readFile(e.target.files?.[0])} />
            </label>
            <p className="wr-help">{view.readsLeft} screenshot reads left today.</p>
          </>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- through our own address, the only one Discord loads */}
            {read.preview && <img src={read.preview} alt="Your result screenshot" className="wr-add__shot" />}
            <FormField label="Track" htmlFor="wr-add-track">
              <Select id="wr-add-track" options={trackOptions} value={track} onChange={(v) => setTrack(String(v))} placeholder="Pick the track" searchable fullWidth />
            </FormField>
            {view.classes.length > 1 && (
              <div className="wr-row" role="group" aria-label="Speed">
                {view.classes.map((c) => <Button key={c} size="small" variant={cc === c ? "primary" : "secondary"} aria-pressed={cc === c} onClick={() => setCc(c)}>{c}cc</Button>)}
              </div>
            )}
            <div className="wr-row" role="group" aria-label="Items">
              <Button size="small" variant={items === "shrooms" ? "primary" : "secondary"} aria-pressed={items === "shrooms"} onClick={() => setItems("shrooms")}>Mushrooms</Button>
              <Button size="small" variant={items === "none" ? "primary" : "secondary"} aria-pressed={items === "none"} onClick={() => setItems("none")}>No mushrooms</Button>
            </div>
            {view.vehicles.length > 1 && (
              <FormField label="Vehicle" htmlFor="wr-add-vehicle" helperText="For the vehicle boards; any other vehicle counts on the open board">
                <Select id="wr-add-vehicle" options={view.vehicles.map((v) => ({ value: v.id, label: v.id === "any" ? "Something else" : v.label }))} value={vehicle} onChange={(v) => setVehicle(String(v) as TtVehicle)} fullWidth />
              </FormField>
            )}
            <FormField label="Time" htmlFor="wr-add-time" helperText="As the screen shows it, like 1:52.384">
              <Input id="wr-add-time" value={time} onChange={(e) => setTime(e.target.value)} inputMode="decimal" autoComplete="off" fullWidth />
            </FormField>
            <div className="wr-row">
              <Button variant="primary" loading={saving} onClick={save}>Save the time</Button>
              <Button variant="ghost" onClick={() => { setRead(null); setError(null); }}>Use another screenshot</Button>
            </div>
          </>
        )}
        {error && <p className="wr-add__err" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
