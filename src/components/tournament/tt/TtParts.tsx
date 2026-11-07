"use client";

/**
 * Pieces shared by the time trial event page and the run screen: the board line, countdowns, a group's table with
 * its cut line, the round's tracks, and the add-a-time window (the boards' own form in event mode).
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button, FormField, Input, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconLink, IconVideo } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { AdminTable } from "@/components/account/admin/AdminKit";
import { TimeTrialAdd } from "@/components/timeTrials/TimeTrialAdd";
import { formatGap, formatTime } from "@/lib/timeTrials/rules";
import { TT_GAMES, trackPath, ttTrack, type TtGame } from "@/lib/timeTrials/tracks";
import { categoryText } from "@/lib/timeTrials/categories";
import { CLIP_CHOICES, type TtEventSettings, type TtProof, type TtViewGroup } from "@/lib/tournaments/tt/event";
import { proofStateWord, type MatchProofState } from "@/lib/tournaments/tt/matchProof";
import "@/styles/time-trials.css";
import "@/styles/tt-event.css";

export const boardLine = (s: TtEventSettings) => `${TT_GAMES[s.game].label} · ${categoryText(s.game, s.cc, s.items, s.vehicle, TT_GAMES[s.game].classes.length > 1)}`;
export const trackName = (game: TtGame, id: string) => ttTrack(game, id)?.name ?? id;

/** "Sat, Nov 8, 8:00 PM" in the viewer's own time zone (pick 6A). */
export const whenText = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "2 days, 4 hours" / "35 minutes" until `iso`, or null once it's passed. */
export function leftText(iso: string, now: number): string | null {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return null;
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) { const hh = h % 24; return `${d} day${d === 1 ? "" : "s"}${hh ? `, ${hh} hour${hh === 1 ? "" : "s"}` : ""}`; }
  const mm = m % 60;
  return `${h} hour${h === 1 ? "" : "s"}${mm ? `, ${mm} minute${mm === 1 ? "" : "s"}` : ""}`;
}

export function proofWord(p: TtProof, needsClip: boolean): string | null {
  if (p === "checked") return "Checked";
  if (p === "rejected") return "Didn't count";
  if (p === "waiting") return "Clip waiting for a check";
  return needsClip ? "Clip needed" : null;
}

export const clipRuleText = (rule: number) => CLIP_CHOICES.find((c) => c.value === rule)?.label ?? "Top times";

/** The heading over the add form's clip step: who the organizer asks a clip of. */
export function clipHead(settings: TtEventSettings, match: boolean): string {
  if (match) return settings.matchClips === -1 ? "Every time in a match needs a clip" : "The faster time on each track needs a clip";
  return settings.clips === -1 ? "Every time needs a clip" : settings.clips === 1 ? "The fastest on each track needs a clip" : `The top ${settings.clips === 3 ? "three" : settings.clips} on each track need a clip`;
}

/**
 * Add a clip to one of your tournament times (an event's top time, or a match time the organizer asks a clip of).
 * Posts it itself; `onDone` refreshes the page's view.
 */
export function ClipWindow({ tournamentId, item, game, match = false, onClose, onDone }: {
  tournamentId: string; item: { id: string; track: string; ms: number } | null; game: TtGame; match?: boolean;
  onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [clip, setClip] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/tt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clip", timeId: item.id, url: clip.trim() }) });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!j?.ok) { toast.error(j?.message ?? "That clip couldn't be added. Try again."); return; }
      toast.success(match ? "Clip added. Your match counts once it's checked." : "Clip added. The organizer will check it.");
      setClip("");
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={!!item} onClose={onClose} title="Add your clip" size="small">
      {item && (
        <div className="tt-ev-clip">
          <p className="tt-ev__hint">{trackName(game, item.track)}, {formatTime(item.ms)}. A clip of the run&apos;s last 30 seconds, before {match ? "your match counts" : "the results are final"}.</p>
          <FormField label="Video link" htmlFor="tt-clip-url" helperText="YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram">
            <Input id="tt-clip-url" value={clip} onChange={(e) => setClip(e.target.value)} iconBefore={IconLink} inputMode="url" autoComplete="off" fullWidth />
          </FormField>
          <div className="tt-ev-clip__actions">
            <Button variant="primary" disabled={!clip.trim()} loading={busy} onClick={() => void send()}>Add clip</Button>
            <Button variant="secondary" onClick={onClose}>Later</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** The round's tracks, each linking to its time trial board. */
export function TrackStrip({ settings, tracks }: { settings: TtEventSettings; tracks: string[] }) {
  return (
    <ol className="tt-ev-tracks" aria-label="Tracks">
      {tracks.map((id, i) => {
        const t = ttTrack(settings.game, id);
        if (!t) return null;
        return (
          <li key={id} className="tt-ev-tracks__item">
            {t.image ? <Image src={t.image} alt="" width={96} height={54} className="tt-ev-tracks__pic" sizes="96px" /> : <span className="tt-ev-tracks__pic tt-ev-tracks__pic--blank" aria-hidden="true">{t.name.slice(0, 1)}</span>}
            <span className="tt-ev-tracks__words">
              <span className="tt-ev-tracks__n">Track {i + 1}</span>
              <Link href={trackPath(t, settings.cc, { items: settings.items, vehicle: settings.vehicle })}>{t.name}</Link>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One group's table (or the leaderboard's standings): place, player, each track's best when there's room, then the
 * total (or points) and the gap. A dashed line sits under the last player who moves on.
 */
export function GroupTable({ group, settings, tracks, label, showTracks }: {
  group: TtViewGroup; settings: TtEventSettings; tracks: string[]; label: string; showTracks: boolean;
}) {
  const total = settings.scoring === "total";
  const leader = group.rows[0];
  const lead = total ? leader?.total ?? null : leader?.points ?? null;
  return (
    <AdminTable label={label}>
      <Table className="tt-ev-table">
        <TableHeader>
          <TableRow>
            <TableHead className="tt-ev-num">#</TableHead>
            <TableHead>Player</TableHead>
            {showTracks && tracks.map((t) => <TableHead key={t} className="tt-ev-num">{trackName(settings.game, t)}</TableHead>)}
            <TableHead className="tt-ev-num">{total ? "Total" : "Points"}</TableHead>
            <TableHead className="tt-ev-num">Gap</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.rows.map((r, i) => {
            const cut = group.cutAfter != null && i === group.cutAfter - 1 && i < group.rows.length - 1;
            const value = total ? r.total : r.points;
            const gap = i === 0 || value == null || lead == null ? null : total ? formatGap(value - lead) : `${(value as number) - (lead as number)}`;
            return (
              <TableRow key={r.participantId} className={[cut ? "tt-ev-row--cut" : "", r.you ? "tt-ev-row--you" : ""].filter(Boolean).join(" ") || undefined}>
                <TableCell className="tt-ev-num">{r.done ? `${r.tied ? "=" : ""}${r.place}` : "–"}</TableCell>
                <TableCell>{r.name}{r.you && <span className="tt-ev-muted"> (you)</span>}</TableCell>
                {showTracks && tracks.map((t) => (
                  <TableCell key={t} className="tt-ev-num">{r.times[t] != null ? formatTime(r.times[t] as number) : <span className="tt-ev-muted">No time</span>}</TableCell>
                ))}
                <TableCell className="tt-ev-num">{total ? (r.total != null ? formatTime(r.total) : <span className="tt-ev-muted">{r.done} of {tracks.length}</span>) : r.points}</TableCell>
                <TableCell className="tt-ev-num">{gap ?? ""}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </AdminTable>
  );
}

/** Add a time to the event: the boards' form, fixed to the event's board and the tracks open to you. */
export function AddTimeWindow({ open, onClose, tournamentId, settings, tracks, runoff, start, onAdded, match = false }: {
  open: boolean; onClose: () => void; tournamentId: string; settings: TtEventSettings; tracks: string[]; runoff: boolean;
  start?: string | null; onAdded: () => void;
  /** A Swiss or bracket match decided by time trial. */
  match?: boolean;
}) {
  return (
    <Modal isOpen={open} onClose={onClose} title={runoff ? "Add your run-off time" : "Add my time"} size="medium">
      {open && (
        <TimeTrialAdd
          key={`${start ?? ""}-${runoff}`}
          game={settings.game} cc={settings.cc} items={settings.items} vehicle={settings.vehicle} track={start ?? null}
          event={{ tournamentId, tracks, runoff, line: boardLine(settings), clipRule: clipHead(settings, match), match }}
          onAdded={() => onAdded()}
        />
      )}
    </Modal>
  );
}

export interface MatchTrackRow { id: string; mine: number | null; theirs: number | null; proof: { timeId: string; state: MatchProofState } | null }

/**
 * Your match's tracks (Swiss and brackets decided by time trial): both players' best times, the faster one in bold,
 * where your clip stands when the organizer asks for one, and the track's button: Add clip when yours needs one,
 * else Add or Beat it while the match still takes times.
 */
export function MatchTracks({ game, rows, opponent, locked, onAdd, onClip }: {
  game: TtGame; rows: MatchTrackRow[]; opponent: string;
  /** Settled, or decided and waiting on its clips: no more times. */
  locked: boolean;
  onAdd: (track: string) => void;
  onClip: (item: { id: string; track: string; ms: number }) => void;
}) {
  return (
    <ul className="swiss-tt__tracks">
      {rows.map((t) => {
        const took = t.mine != null && t.theirs != null ? (t.mine < t.theirs ? "you" : t.theirs < t.mine ? "them" : null) : null;
        const clip = t.proof?.state === "clip" && t.mine != null;
        return (
          <li key={t.id} className="swiss-tt__row">
            <span className="swiss-tt__track">{trackName(game, t.id)}</span>
            <span className={took === "you" ? "swiss-tt__time swiss-tt__time--won" : "swiss-tt__time"}>
              You: {t.mine != null ? formatTime(t.mine) : "no time yet"}
              {t.proof && <span className={`swiss-tt__proof${t.proof.state === "clip" ? " swiss-tt__proof--ask" : ""}`}>{proofStateWord(t.proof.state)}</span>}
            </span>
            <span className={took === "them" ? "swiss-tt__time swiss-tt__time--won" : "swiss-tt__time"}>{opponent}: {t.theirs != null ? formatTime(t.theirs) : "no time yet"}</span>
            {clip ? <Button size="small" variant="secondary" iconBefore={IconVideo} onClick={() => onClip({ id: t.proof!.timeId, track: t.id, ms: t.mine! })}>Add clip</Button>
              : !locked ? <Button size="small" variant="ghost" onClick={() => onAdd(t.id)}>{t.mine != null ? "Beat it" : "Add"}</Button>
              : <span aria-hidden="true" />}
          </li>
        );
      })}
    </ul>
  );
}
