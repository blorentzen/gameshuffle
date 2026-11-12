"use client";

/**
 * A war in the War room: the score, then three views (CascadeDS pill Tabs): Race (everyone taps their place; the
 * track; who's missing; Fill in the rest), Races (every race with Fix, and penalties) and Players (each player's places
 * and points from the taps). Once the war is over the Race view is the final: Rematch, the war page, and the card in
 * the channel for the table. A race going in shows its swing for three seconds. In Discord's corner window only the
 * score shows (war-room.css, by height).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Input, Modal, Tabs } from "@empac/cascadeds";
import { IconArrowBackUp, IconFlag, IconMap2, IconPlayerStop } from "@tabler/icons-react";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import type { RoomTrack, WarRoomView } from "@/lib/wars/roomView";
import type { WarGame } from "@/lib/wars/rules";
import { CODE_EXAMPLE } from "@/lib/wars/codeExamples";
import { Face, PlaceGrid, TeamMark, placeName } from "./bits";
import { openLink } from "./sdk";

type Act = (body: Record<string, unknown>) => Promise<boolean>;
type TabId = "race" | "races" | "players";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const teamName = (t: { name: string | null; tag: string }) => t.name || t.tag;
const listNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const MOMENT_MS = 3000;

export function WarScreen({ view, act, failed }: { view: WarRoomView; act: Act; failed: boolean }) {
  const [tab, setTab] = useState<TabId>("race");
  const [moment, setMoment] = useState<{ n: number; diff: number; lead: number; left: number } | null>(null);
  const seen = useRef<{ id: string; played: number }>({ id: view.id, played: view.played });

  // A race that went in since the last look gets its moment (not on the first load, not for an undo).
  useEffect(() => {
    const before = seen.current;
    seen.current = { id: view.id, played: view.played };
    if (before.id !== view.id || view.played <= before.played) return;
    const last = view.races[view.races.length - 1];
    if (!last) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a moment for a race the server just reported
    setMoment({ n: last.n, diff: last.diff, lead: view.diff, left: view.left });
    const t = window.setTimeout(() => setMoment(null), MOMENT_MS);
    return () => window.clearTimeout(t);
  }, [view]);

  const live = view.status === "live";
  const several = view.teamsCount > 2;
  const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
  // Several teams: the board shows you against the leader (or the team behind you when you lead); this lists them all.
  const standings = several ? [...view.teams].map((t, i) => ({ t, i })).sort((a, b) => b.t.total - a.t.total || a.i - b.i).map(({ t }, k) => `${k + 1}. ${t.tag} ${t.total}`).join(" · ") : "";
  const line = live
    ? view.decided ? `${teamName(view.decided === "us" ? view.us : view.them)} can't be caught`
      : view.need ? `${teamName(view.need.side === "us" ? view.us : view.them)} need to average ${signed(view.need.avg)} a race`
        : view.played ? "Level" : `${view.racesTotal} races`
    : view.headline ?? "";

  return (
    <div className="wr-war">
      <h1 className="wr-sr">{teamName(view.us)} vs {teamName(view.them)}</h1>
      <section className="wr-score" aria-label={`${teamName(view.us)} ${view.us.total}, ${teamName(view.them)} ${view.them.total}. ${line}.`}>
        <div className="wr-score__team"><TeamMark team={view.us} size="lg" /><span className="wr-score__tag">{view.us.tag}</span><span className="wr-score__pts">{view.us.total}</span></div>
        <span className={`wr-score__gap${view.diff > 0 ? " is-up" : view.diff < 0 ? " is-down" : ""}`}>{signed(view.diff)}</span>
        <div className="wr-score__team wr-score__team--r"><span className="wr-score__pts">{view.them.total}</span><span className="wr-score__tag">{view.them.tag}</span><TeamMark team={view.them} size="lg" /></div>
        <div className="wr-pips" aria-hidden="true">
          {Array.from({ length: view.racesTotal }, (_, i) => {
            const d = view.diffs[i];
            return <i key={i} className={d === undefined ? "" : d > 0 ? "is-win" : d < 0 ? "is-loss" : "is-tie"} />;
          })}
        </div>
        {/* On the final, the heading below says who won, so the line steps aside. */}
        {live && <p className={`wr-score__line${view.decided ? " is-gold" : ""}`}>{line}</p>}
        {several && <p className="wr-mini">{ordinal(view.rank)} of {view.teamsCount} · {standings}</p>}
        {live && view.race && view.tapsOn && <p className="wr-mini">Race {view.race.n}{view.race.track?.code ? ` · ${view.race.track.code}` : ""} · {view.race.count} of {view.size} in</p>}
      </section>
      {failed && <p className="wr-help" role="status">Reconnecting…</p>}

      <Tabs
        variant="pills"
        size="small"
        className="wr-tabs"
        activeTab={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: "race", label: live ? `Race ${view.race?.n ?? ""}`.trim() : "Final", content: live ? <RaceView view={view} act={act} moment={moment} /> : <FinalView view={view} act={act} /> },
          { id: "races", label: "Races", content: <RacesView view={view} act={act} /> },
          { id: "players", label: "Players", content: <PlayersView view={view} /> },
        ]}
      />
    </div>
  );
}

// ── Race ────────────────────────────────────────────────────────────────────────────────────

function RaceView({ view, act, moment }: { view: WarRoomView; act: Act; moment: { n: number; diff: number; lead: number; left: number } | null }) {
  const confirm = useConfirm();
  const [modal, setModal] = useState<"track" | "fill" | "penalty" | null>(null);
  const race = view.race!;
  const people = useMemo(() => Object.fromEntries(race.taps.map((t) => [t.place, t.people])), [race.taps]);
  const clashNames = race.clashes.map((p) => `${listNames((people[p] ?? []).map((x) => x.name))} both tapped ${placeName(p)}`);
  const played = useMemo(() => new Map(view.races.filter((r) => r.track).map((r) => [r.track!.id, r.n])), [view.races]);

  const end = async () => {
    const ok = await confirm({ title: `End the war after race ${view.played}?`, body: `${view.played} of ${view.racesTotal} races are in. The card in the channel shows it as ended.`, confirmLabel: "End the war" });
    if (ok) await act({ action: "end", war: view.id });
  };

  if (!view.tapsOn) {
    // Several teams or a 24-player room: everyone's places are typed on the card (Add race), not tapped here.
    return (
      <div className="wr-race">
        <p className="wr-muted">Race {race.n} goes in on the card in the channel: press Add race and type {view.teamsCount > 2 ? "every team's places" : "your team's places"}. The score here follows it.</p>
        <div className="wr-actions">
          {view.cardUrl && <Button variant="secondary" size="small" onClick={() => openLink(view.cardUrl!)}>Open the card</Button>}
          {view.undo && <Button variant="ghost" size="small" iconBefore={IconArrowBackUp} onClick={() => void act({ action: "undo", war: view.id, n: view.undo })}>Undo race {view.undo}</Button>}
          <Button variant="ghost" size="small" iconBefore={IconFlag} onClick={() => setModal("penalty")}>Penalty</Button>
          <Button variant="ghost" size="small" iconBefore={IconPlayerStop} onClick={end}>End the war</Button>
        </div>
        <PenaltyModal open={modal === "penalty"} view={view} onClose={() => setModal(null)} onSave={async (side, points, reason, team) => { if (await act({ action: "penalty", war: view.id, side, points, reason, team })) setModal(null); }} />
      </div>
    );
  }

  return (
    <div className="wr-race">
      <div className="wr-race__head">
        <TrackChip track={race.track} />
        <Button variant="secondary" size="small" iconBefore={IconMap2} onClick={() => setModal("track")}>{race.track ? "Change track" : "Pick the track"}</Button>
      </div>
      {clashNames.length > 0 && <p className="wr-alert" role="alert"><b>{clashNames.join(". ")}.</b> One of you pick again. Race {race.n} waits until the places are different.</p>}
      <div className={`wr-board${moment ? " is-landed" : ""}`}>
        <PlaceGrid room={view.room} people={people} mine={race.mine} clashes={race.clashes} label={`Race ${race.n}: tap where you finished`} onPick={(p) => void act({ action: "tap", war: view.id, n: race.n, place: p })} disabled={!!moment} />
        {moment && (
          <div className="wr-moment" role="status">
            <span>Race {moment.n} is in</span>
            <b className={moment.diff < 0 ? "is-down" : ""}>{signed(moment.diff)}</b>
            <span>{moment.left ? `Lead ${signed(moment.lead)} with ${moment.left} to go` : `Final: ${signed(moment.lead)}`}</span>
          </div>
        )}
      </div>
      <div className="wr-wait">
        <span>{race.waiting.length ? <>Waiting on {race.waiting.map((p, i) => <span key={p.id}>{i > 0 && (i === race.waiting.length - 1 ? " and " : ", ")}<span className="wr-wait__who"><Face id={p.id} name={p.name} small />{p.name}</span></span>)}</> : `${race.count} of ${view.size} in. Tap your place to take it back.`}</span>
        <Button variant="secondary" size="small" onClick={() => setModal("fill")}>Fill in the rest</Button>
      </div>
      <div className="wr-actions">
        {view.undo && <Button variant="ghost" size="small" iconBefore={IconArrowBackUp} onClick={() => void act({ action: "undo", war: view.id, n: view.undo })}>Undo race {view.undo}</Button>}
        <Button variant="ghost" size="small" iconBefore={IconFlag} onClick={() => setModal("penalty")}>Penalty</Button>
        <Button variant="ghost" size="small" iconBefore={IconPlayerStop} onClick={end}>End the war</Button>
      </div>

      <Modal isOpen={modal === "track"} onClose={() => setModal(null)} title={`Track for race ${race.n}`} size="large" className="wr-modal">
        <TrackPicker game={view.game} played={played} current={race.track?.id ?? null} onPick={async (id) => { if (await act({ action: "track", war: view.id, n: race.n, track: id })) setModal(null); }} />
      </Modal>
      <FillModal open={modal === "fill"} n={race.n} size={view.size} room={view.room} tapped={race.taps.filter((t) => t.people.length === 1).map((t) => t.place)} onClose={() => setModal(null)} onAdd={async (places) => { if (await act({ action: "fill", war: view.id, n: race.n, places })) setModal(null); }} />
      <PenaltyModal open={modal === "penalty"} view={view} onClose={() => setModal(null)} onSave={async (side, points, reason, team) => { if (await act({ action: "penalty", war: view.id, side, points, reason, team })) setModal(null); }} />
    </div>
  );
}

function TrackChip({ track }: { track: RoomTrack | null }) {
  if (!track) return <span className="wr-track wr-track--none">No track yet</span>;
  return (
    <span className="wr-track">
      {/* eslint-disable-next-line @next/next/no-img-element -- course art through our own address */}
      {track.image && <img src={track.image} alt="" />}
      <span className="wr-track__tx">{track.code && <code>{track.code}</code>}<b>{track.name}</b></span>
    </span>
  );
}

const trackCache = new Map<WarGame, Promise<(RoomTrack & { cup: string })[]>>();
function useTracks(game: WarGame) {
  const [list, setList] = useState<(RoomTrack & { cup: string })[] | null>(null);
  useEffect(() => {
    if (!trackCache.has(game)) trackCache.set(game, fetch(`/api/activity/war?tracks=${game}`).then((r) => r.json()).then((j: { tracks?: (RoomTrack & { cup: string })[] }) => j.tracks ?? []).catch(() => []));
    let on = true;
    void trackCache.get(game)!.then((l) => { if (on) setList(l); });
    return () => { on = false; };
  }, [game]);
  return list;
}

/** Type a code or tap the course (pick 5A); courses already played this war are greyed with their race. */
function TrackPicker({ game, played, current, onPick }: { game: WarGame; played: Map<string, number>; current: string | null; onPick: (id: string) => void }) {
  const list = useTracks(game);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const codes = (t: RoomTrack) => [t.code ?? "", ...(t.also ?? [])].map((c) => c.toLowerCase());
  const matches = (t: RoomTrack) => !term || codes(t).some((c) => c.startsWith(term)) || t.name.toLowerCase().includes(term);
  const shown = (list ?? []).filter(matches);
  const exact = (list ?? []).filter((t) => codes(t).includes(term));
  const cups = [...new Set(shown.map((t) => t.cup))];
  const only = exact.length === 1 ? exact[0] : shown.length === 1 ? shown[0] : null;
  return (
    <div className="wr-picker">
      <label htmlFor="wr-code" className="wr-label">Track code or name</label>
      <Input id="wr-code" value={q} onChange={(e) => setQ(e.target.value)} placeholder={CODE_EXAMPLE[game].few} fullWidth autoComplete="off" autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && only) { e.preventDefault(); onPick(only.id); } }} />
      <p className="wr-help" aria-live="polite">{!list ? "Loading the courses…" : only ? `Enter picks ${only.code ? `${only.code} · ` : ""}${only.name}.` : `${shown.length} courses`}</p>
      {cups.map((cup) => (
        <div key={cup} className="wr-cup">
          <h3>{cup}</h3>
          <div className="wr-cup__grid">
            {shown.filter((t) => t.cup === cup).map((t) => {
              const n = played.get(t.id);
              return (
                <button key={t.id} type="button" className={`wr-course${n ? " is-played" : ""}${t.id === current ? " is-current" : ""}`} onClick={() => onPick(t.id)} aria-label={`${t.code ? `${t.code}, ` : ""}${t.name}${n ? `, played in race ${n}` : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- course art through our own address */}
                  {t.image ? <img src={t.image} alt="" loading="lazy" /> : <span className="wr-course__blank" />}
                  {t.code && <code>{t.code}</code>}
                  {n && <em>Race {n}</em>}
                  <span className="wr-course__name">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function FillModal({ open, n, size, room, tapped, onClose, onAdd }: { open: boolean; n: number; size: number; room: number; tapped: number[]; onClose: () => void; onAdd: (places: number[]) => Promise<void> }) {
  const [picked, setPicked] = useState<number[]>(tapped);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) setPicked(tapped); }
  const toggle = (p: number) => setPicked((l) => (l.includes(p) ? l.filter((x) => x !== p) : l.length < size ? [...l, p].sort((a, b) => a - b) : l));
  return (
    <Modal isOpen={open} onClose={onClose} title={`Fill in race ${n}`} size="medium" className="wr-modal"
      footer={<div className="wr-row"><Button variant="primary" loading={busy} disabled={picked.length !== size} onClick={async () => { setBusy(true); await onAdd(picked); setBusy(false); }}>Add race {n}</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div>}>
      <p className="wr-muted">Your team&apos;s {NUMBER_WORDS[size] ?? size} places. The taps so far are picked already.</p>
      <PlaceGrid room={room} picked={picked} onPick={toggle} label={`Race ${n}: your team's places`} />
      <p className="wr-help" aria-live="polite">{picked.length} of {size} picked{picked.length ? `: ${picked.join(", ")}` : ""}</p>
    </Modal>
  );
}

function PenaltyModal({ open, view, onClose, onSave }: { open: boolean; view: WarRoomView; onClose: () => void; onSave: (side: "us" | "them", points: number, reason: string, team?: number) => Promise<void> }) {
  const [side, setSide] = useState<"us" | "them">("them");
  // Several teams: any of them, by its number (the other team first, then yours, then the rest).
  const [team, setTeam] = useState(1);
  const several = view.teamsCount > 2;
  const [points, setPoints] = useState("15");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(points);
  const ok = Number.isInteger(n) && n >= 1 && n <= 200;
  return (
    <Modal isOpen={open} onClose={onClose} title="Penalty" size="small" className="wr-modal"
      footer={<div className="wr-row"><Button variant="primary" loading={busy} disabled={!ok} onClick={async () => { setBusy(true); await (several ? onSave(team === 0 ? "us" : "them", n, reason, team) : onSave(side, n, reason)); setBusy(false); }}>Take {ok ? n : ""} off</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div>}>
      <div className="wr-field" role="group" aria-labelledby="wr-pen-team">
        <span id="wr-pen-team" className="wr-label">Which team</span>
        <div className="wr-row">
          {several
            ? [1, 0, ...view.teams.map((_, i) => i).slice(2)].map((i) => <Chip key={i} clickable selected={team === i} onClick={() => setTeam(i)} label={teamName(view.teams[i])} />)
            : <>
              <Chip clickable selected={side === "them"} onClick={() => setSide("them")} label={teamName(view.them)} />
              <Chip clickable selected={side === "us"} onClick={() => setSide("us")} label={teamName(view.us)} />
            </>}
        </div>
      </div>
      <div className="wr-field"><label htmlFor="wr-pen-pts" className="wr-label">Points off</label><Input id="wr-pen-pts" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
      <div className="wr-field"><label htmlFor="wr-pen-why" className="wr-label">Why (shown on the card)</label><Input id="wr-pen-why" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 40))} placeholder="Repick" /></div>
    </Modal>
  );
}

// ── Final ───────────────────────────────────────────────────────────────────────────────────

function FinalView({ view, act }: { view: WarRoomView; act: Act }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="wr-final">
      <h2 className="wr-final__h">{view.headline}</h2>
      {view.topPlayer && <p className="wr-muted">{view.topPlayer.name} led the team with {view.topPlayer.points}.</p>}
      <div className="wr-row wr-row--center">
        <Button variant="primary" loading={busy} onClick={async () => { setBusy(true); await act({ action: "rematch", war: view.id }); setBusy(false); }}>Rematch</Button>
        <Button variant="secondary" onClick={() => openLink(view.pageUrl)}>War page</Button>
        {view.cardUrl && <Button variant="secondary" onClick={() => openLink(view.cardUrl!)}>Make the table</Button>}
      </div>
      {view.cardUrl && <p className="wr-help">Make the table opens the card in the channel: its form takes the results screenshot.</p>}
      {view.undo && <Button variant="ghost" size="small" iconBefore={IconArrowBackUp} onClick={() => void act({ action: "undo", war: view.id, n: view.undo })}>Undo race {view.undo}</Button>}
    </div>
  );
}

// ── Races ───────────────────────────────────────────────────────────────────────────────────

function RacesView({ view, act }: { view: WarRoomView; act: Act }) {
  const [fix, setFix] = useState<number | null>(null);
  const [pen, setPen] = useState(false);
  const race = view.races.find((r) => r.n === fix) ?? null;
  const played = useMemo(() => new Map(view.races.filter((r) => r.track).map((r) => [r.track!.id, r.n])), [view.races]);
  if (!view.races.length) return <p className="wr-muted">No races yet. They show here as they go in.</p>;
  return (
    <div className="wr-races">
      <div className="wr-scroll" tabIndex={0} role="region" aria-label="Every race (scrolls sideways on small screens)">
        <table className="wr-table">
          <thead><tr><th scope="col">Race</th><th scope="col">Track</th><th scope="col">{view.us.tag}&apos;s places</th><th scope="col">Race</th><th scope="col">Lead</th><th scope="col"><span className="wr-sr">Fix</span></th></tr></thead>
          <tbody>
            {[...view.races].reverse().map((r) => (
              <tr key={r.n}>
                <td>{r.n}</td>
                <td>{r.track ? <><code>{r.track.code ?? ""}</code> {r.track.name}</> : <span className="wr-muted">None</span>}</td>
                <td>{r.spots.length ? r.spots.join(", ") : <span className="wr-muted">Points only</span>}</td>
                <td className={r.diff > 0 ? "is-up" : r.diff < 0 ? "is-down" : ""}>{signed(r.diff)}</td>
                <td>{signed(r.lead)}</td>
                <td>{view.teamsCount === 2 && <Button variant="ghost" size="small" onClick={() => setFix(r.n)} aria-label={`Fix race ${r.n}`}>Fix</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="wr-pens">
        {view.penalties.length > 0 && <p>Penalties: {view.penalties.map((p) => `${p.points} off ${view.teams[p.team]?.tag ?? view.them.tag}${p.reason ? ` (${p.reason})` : ""}`).join(" · ")}</p>}
        {view.status !== "ended" && <Button variant="ghost" size="small" iconBefore={IconFlag} onClick={() => setPen(true)}>Add a penalty</Button>}
      </div>
      {race && <FixModal key={race.n} view={view} race={race} played={played} onClose={() => setFix(null)} act={act} />}
      <PenaltyModal open={pen} view={view} onClose={() => setPen(false)} onSave={async (side, points, reason, team) => { if (await act({ action: "penalty", war: view.id, side, points, reason, team })) setPen(false); }} />
    </div>
  );
}

function FixModal({ view, race, played, onClose, act }: { view: WarRoomView; race: WarRoomView["races"][number]; played: Map<string, number>; onClose: () => void; act: Act }) {
  const [picked, setPicked] = useState<number[]>(race.spots);
  const [track, setTrack] = useState<string | null>(race.track?.id ?? null);
  const [pickTrack, setPickTrack] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = (p: number) => setPicked((l) => (l.includes(p) ? l.filter((x) => x !== p) : l.length < view.size ? [...l, p].sort((a, b) => a - b) : l));
  const save = async () => {
    setBusy(true);
    const ok = await act({ action: "fix", war: view.id, n: race.n, places: picked, track });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={`Fix race ${race.n}`} size="large" className="wr-modal"
      footer={<div className="wr-row"><Button variant="primary" loading={busy} disabled={picked.length !== view.size} onClick={save}>Save race {race.n}</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div>}>
      <PlaceGrid room={view.room} picked={picked} onPick={toggle} label={`Race ${race.n}: your team's places`} />
      <p className="wr-help" aria-live="polite">{picked.length} of {view.size} picked</p>
      {pickTrack
        ? <TrackPicker game={view.game} played={played} current={track} onPick={(id) => { setTrack(id); setPickTrack(false); }} />
        : <Button variant="secondary" size="small" iconBefore={IconMap2} onClick={() => setPickTrack(true)}>{track ? "Change the track" : "Add the track"}</Button>}
    </Modal>
  );
}

// ── Players ─────────────────────────────────────────────────────────────────────────────────

function PlayersView({ view }: { view: WarRoomView }) {
  if (!view.players.length) return <p className="wr-muted">Players show here once your team taps its places.</p>;
  const tapped = view.players.reduce((a, p) => a + p.points, 0);
  const total = tapped + view.byHand.points;
  return (
    <div className="wr-players">
      <div className="wr-scroll" tabIndex={0} role="region" aria-label="Each player's places (scrolls sideways on small screens)">
        <table className="wr-table">
          <thead><tr><th scope="col">Player</th><th scope="col" className="wr-num">Points</th>{Array.from({ length: view.played }, (_, i) => <th key={i} scope="col" className="wr-num"><span className="wr-sr">Race </span>{i + 1}</th>)}</tr></thead>
          <tbody>
            {view.players.map((p) => (
              <tr key={p.id}>
                <th scope="row"><span className="wr-player"><Face id={p.id} name={p.name} small />{p.name}</span></th>
                <td className="wr-num"><b>{p.points}</b></td>
                {p.places.slice(0, view.played).map((pl, i) => <td key={i} className="wr-num">{pl ?? <span className="wr-muted" aria-label="Didn't tap">·</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.byHand.races.length > 0 && <p className="wr-help">Race{view.byHand.races.length > 1 ? "s" : ""} {listNames(view.byHand.races.map(String))} went in by hand, so {view.byHand.points} points aren&apos;t split by player.</p>}
      <p className="wr-help">{view.byHand.points ? `${tapped} from taps + ${view.byHand.points} = ${total}` : `${tapped} from taps`}{view.penalties.some((p) => p.side === "us") ? ", before penalties" : ""}. The war&apos;s total is {view.us.total}.</p>
    </div>
  );
}
