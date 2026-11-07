"use client";

/**
 * A station's runner at an in-person time trial (shapes pick 7A), on their phone: the group called to this station,
 * one track at a time, a time box per player, then "Done" to call the next group here. On a leaderboard the runner
 * picks who's racing. Opened from the organizer's station link (no account); the link's key goes with every request.
 * Refreshes every few seconds so a newly called group shows up, without touching what the runner is typing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, FormField, Input } from "@empac/cascadeds";
import { IconCheck } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { Select } from "@/components/ui/Select";
import { ChoiceRow } from "@/components/tournament/ChoiceRow";
import { formatTime, parseTime } from "@/lib/timeTrials/rules";
import type { TtStationView } from "@/lib/tournaments/tt/event";
import { boardLine, trackName } from "./TtParts";
import "@/styles/tt-event.css";

const POLL_MS = 5000;

export function TtStationRunner({ tournamentId, n, k }: { tournamentId: string; n: number; k: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<TtStationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState<string | null>(null);
  const [who, setWho] = useState("");
  // What the runner typed, by player and track; a box keeps its text until it's saved.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const live = useRef(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/tt/station?n=${n}&k=${encodeURIComponent(k)}`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; station?: TtStationView; message?: string } | null;
    if (!live.current) return;
    if (j?.ok && j.station) { setView(j.station); setError(null); }
    else setError(j?.message ?? "We couldn't load this station. Check your connection.");
  }, [tournamentId, n, k]);
  useEffect(() => {
    live.current = true;
    void load();
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { live.current = false; window.clearInterval(iv); };
  }, [load]);

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/tt/station`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n, k, ...body }) });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; station?: TtStationView; message?: string } | null;
      if (j?.ok && j.station) { setView(j.station); return true; }
      toast.error(j?.message ?? "That didn't save. Try again.");
      return false;
    } catch {
      toast.error("That didn't save. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error && !view) return <main className="tt-station"><Alert variant="error">{error}</Alert></main>;
  if (!view) return <main className="tt-station"><LoadingLines label="Loading the station" /></main>;

  const s = view.settings;
  const tracks = view.tracks;
  const players = view.group?.players ?? (view.everyone ? view.everyone.filter((p) => p.id === who) : []);
  const cur = track && tracks.includes(track) ? track : tracks.find((t) => players.some((p) => p.times[t] == null)) ?? tracks[0] ?? null;
  const allIn = players.length > 0 && players.every((p) => tracks.every((t) => p.times[t] != null));
  const key = (pid: string, t: string) => `${view.group ? `g${view.group.index}` : "lb"}:${pid}:${t}`;
  const shown = (pid: string, t: string, ms: number | null) => typed[key(pid, t)] ?? (ms != null ? formatTime(ms) : "");

  const save = async (onlyTrack: string | null) => {
    const list = onlyTrack ? [onlyTrack] : tracks;
    let saved = 0;
    for (const t of list) {
      const times = players.map((p) => ({ participantId: p.id, time: parseTime(shown(p.id, t, p.times[t])) })).filter((x) => x.time && x.time !== players.find((p) => p.id === x.participantId)!.times[t]);
      if (!times.length) continue;
      if (!(await post({ action: "save", track: t, times }))) return;
      saved += times.length;
      setTyped((prev) => Object.fromEntries(Object.entries(prev).filter(([kk]) => !players.some((p) => kk === key(p.id, t)))));
    }
    toast.success(saved ? `${saved} time${saved === 1 ? "" : "s"} saved` : "Nothing new to save");
    if (onlyTrack && view.group) {
      const i = tracks.indexOf(onlyTrack);
      if (i >= 0 && i < tracks.length - 1) setTrack(tracks[i + 1]);
    }
  };
  const done = async () => {
    const ok = await confirm({
      title: `Group ${view.group?.label} is done?`,
      body: allIn ? (view.next ? `Group ${view.next} is called to Station ${view.n} next.` : "Nobody else is waiting.") : "Some players have no time on every track. Their missing tracks stay empty.",
      confirmLabel: view.next ? `Done, call Group ${view.next}` : "Done",
    });
    if (!ok) return;
    if (await post({ action: "done" })) { setTrack(null); toast.success(view.next ? `Group ${view.next} is on its way` : "Station done"); }
  };
  const bad = (pid: string, t: string, ms: number | null) => { const v = shown(pid, t, ms); return !!v && !parseTime(v); };

  return (
    <main className="tt-station">
      <header className="tt-station__head">
        <h1 className="tt-station__title">Station {view.n}</h1>
        <p className="tt-station__sub">{view.title}{view.round ? ` · ${view.round.label}` : ""}</p>
        <p className="tt-ev__board">{boardLine(s)}</p>
      </header>
      {error && <Alert variant="warning">{error}</Alert>}

      {view.finished ? (
        <Alert variant="info">The event is finished. Thanks for running the station.</Alert>
      ) : !view.round ? (
        <Alert variant="info">The event hasn&apos;t started. This page fills in once the organizer opens it.</Alert>
      ) : !view.round.open ? (
        <Alert variant="info">{view.round.label} is closed. Times can&apos;t be added until the organizer reopens it.</Alert>
      ) : view.everyone ? (
        <section className="tt-station__card" aria-labelledby="tt-st-who">
          <h2 id="tt-st-who" className="tt-ev__title">Who&apos;s racing</h2>
          <FormField label="Player" htmlFor="tt-st-player">
            <Select id="tt-st-player" value={who} onChange={(v) => setWho(String(v))} placeholder="Pick a player" searchable options={view.everyone.map((p) => ({ value: p.id, label: p.name }))} />
          </FormField>
          {players[0] && (
            <>
              <div className="tt-station__times">
                {tracks.map((t) => (
                  <FormField key={t} label={trackName(s.game, t)} htmlFor={`tt-st-${t}`} errorText={bad(players[0].id, t, players[0].times[t]) ? "Type it like 1:31.402" : undefined}>
                    <Input id={`tt-st-${t}`} value={shown(players[0].id, t, players[0].times[t])} inputMode="decimal" placeholder="1:31.402" autoComplete="off"
                      onChange={(e) => setTyped({ ...typed, [key(players[0].id, t)]: e.target.value })} />
                  </FormField>
                ))}
              </div>
              <Button variant="primary" fullWidth loading={busy} onClick={() => void save(null)}>Save {players[0].name}&apos;s times</Button>
            </>
          )}
        </section>
      ) : view.group ? (
        <section className="tt-station__card" aria-labelledby="tt-st-group">
          <h2 id="tt-st-group" className="tt-ev__title">Group {view.group.label}</h2>
          {tracks.length > 1 && (
            <ChoiceRow<string> label="Track" value={cur ?? ""} onPick={setTrack}
              choices={tracks.map((t) => ({ value: t, label: `${trackName(s.game, t)}${players.every((p) => p.times[t] != null) ? " · done" : ""}` }))} />
          )}
          {cur && (
            <>
              {tracks.length === 1 && <h3 className="tt-station__track">{trackName(s.game, cur)}</h3>}
              <div className="tt-station__times">
                {players.map((p) => (
                  <FormField key={p.id} label={p.name} htmlFor={`tt-st-${p.id}`} errorText={bad(p.id, cur, p.times[cur]) ? "Type it like 1:31.402" : undefined}
                    helperText={p.times[cur] != null && typed[key(p.id, cur)] === undefined ? "Saved" : undefined}>
                    <Input id={`tt-st-${p.id}`} value={shown(p.id, cur, p.times[cur])} inputMode="decimal" placeholder="m:ss.mmm" autoComplete="off"
                      iconAfter={p.times[cur] != null && typed[key(p.id, cur)] === undefined ? IconCheck : undefined}
                      onChange={(e) => setTyped({ ...typed, [key(p.id, cur)]: e.target.value })} />
                  </FormField>
                ))}
              </div>
              <Button variant={allIn ? "secondary" : "primary"} fullWidth loading={busy} onClick={() => void save(cur)}>
                {tracks.indexOf(cur) < tracks.length - 1 ? "Save and next track" : "Save"}
              </Button>
            </>
          )}
          <Button variant={allIn ? "primary" : "ghost"} fullWidth disabled={busy} onClick={() => void done()}>
            {view.next ? `Done: call Group ${view.next}` : "Done with this group"}
          </Button>
        </section>
      ) : (
        <Alert variant="info">{view.next ? `Nothing running here. The organizer calls the next group (Group ${view.next}) to a station.` : "Every group has run at this station. Nothing waiting."}</Alert>
      )}
      <p className="tt-station__note">Times you type in count as checked, so type them from the result screen. Typing a player&apos;s time again replaces it.</p>
    </main>
  );
}
