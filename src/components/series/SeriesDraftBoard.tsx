"use client";

/**
 * The ban and protect track draft board (Summer Series picks 5A and 6A). Everyone sees the same board; the
 * team on the clock (either of its players, or an organizer for them) taps a track to ban, then one to
 * protect, and locks it in. The tiles are toggle buttons in a grid: CascadeDS has no toggle grid (on the fix
 * list), so they're our own buttons with aria-pressed, like Stream Bingo's board.
 */

import { useMemo, useState } from "react";
import { Button, ProgressCircle } from "@empac/cascadeds";
import { IconBan, IconShield } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { bankCups, trackName } from "@/lib/series/tracks";
import type { NightView, SeriesTeamView } from "@/lib/series/view";
import { clock, TeamTag, useSecondsUntil } from "./SeriesBits";
import { EVENTS, track } from "@/lib/analytics/events";

export function DraftBoard({ slug, night, teams, myTeamId, staff, skew, onChanged }: {
  slug: string;
  night: NightView;
  teams: SeriesTeamView[];
  myTeamId: string | null;
  staff: boolean;
  /** Server clock minus this browser's (ms), so the countdown matches the server. */
  skew: number;
  onChanged: () => void;
}) {
  const toast = useToast();
  const d = night.draft!;
  const [ban, setBan] = useState<string | null>(null);
  const [protect, setProtect] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turnKey = `${d.turns.length}:${d.onClock}`;
  const [forTurn, setForTurn] = useState(turnKey);
  if (forTurn !== turnKey) { setForTurn(turnKey); setBan(null); setProtect(null); }

  const team = (id: string | null) => teams.find((t) => t.id === id) ?? null;
  const banned = useMemo(() => new Map(d.turns.map((t) => [t.ban, t.team])), [d.turns]);
  const prot = useMemo(() => new Map(d.turns.flatMap((t) => (t.protect ? [[t.protect, t.team] as const] : []))), [d.turns]);
  const open = d.bank.filter((id) => !banned.has(id) && !prot.has(id));
  const needProtect = open.length >= 2;
  const onClock = team(d.onClock);
  const mine = d.status === "running" && !!d.onClock && (d.onClock === myTeamId || staff);
  const left = useSecondsUntil(d.status === "running" ? d.deadline : null, skew);
  const secs = d.status === "paused" ? d.pausedLeft ?? d.turnSeconds : left;
  const total = d.turnTeams.length;
  const turnNo = Math.min(total, d.turns.length + 1);
  const round = Math.floor(d.turns.length / Math.max(1, d.order.length));
  const roundTeams = d.turnTeams.slice(round * d.order.length, round * d.order.length + d.order.length);
  const last = d.turns[d.turns.length - 1];

  const tap = (id: string) => {
    if (!mine || banned.has(id) || prot.has(id)) return;
    if (ban === id) { setBan(null); return; }
    if (protect === id) { setProtect(null); return; }
    if (!ban) setBan(id);
    else if (needProtect) setProtect(id);
  };

  const lock = async () => {
    if (!ban || (needProtect && !protect)) return;
    setBusy(true);
    const res = await fetch(`/api/series/${slug}/draft`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nightId: night.id, ban, protect }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res?.ok) { toast.error(j?.error ?? "Couldn't lock that in."); onChanged(); return; }
    toast.success("Locked in");
    track(EVENTS.seriesDraftPicked);
    onChanged();
  };

  const heading = d.status === "setup"
    ? "The draft hasn't started"
    : d.status === "done"
      ? `Done: ${d.bank.length - d.turns.length} tracks in the pool`
      : onClock
        ? `${onClock.name}: ${needProtect ? "ban one, protect one" : "ban one"}`
        : "Draft";

  return (
    <section className="ss-draft" aria-labelledby={`ss-draft-${night.id}`}>
      <div className="ss-draft__head">
        <div className="ss-draft__title">
          <span className="ss-kicker">{night.label} track draft{d.status !== "setup" && d.status !== "done" ? ` · turn ${turnNo} of ${total}` : ""}{d.status === "paused" ? " · paused" : ""}</span>
          <h3 id={`ss-draft-${night.id}`}>{heading}</h3>
        </div>
        {(d.status === "running" || d.status === "paused") && secs != null && (
          <div className="ss-clock">
            <span className="ss-clock__ring" aria-hidden>
              <ProgressCircle value={secs} max={d.turnSeconds} size={56} strokeWidth={5} showLabel={false} variant={secs <= 10 ? "warning" : "primary"} />
              <b>{clock(secs)}</b>
            </span>
            <span className="sr-only">{clock(secs)} left on this turn.</span>
            <small>{d.status === "paused" ? "Paused" : "Then it's picked at random"}</small>
          </div>
        )}
      </div>

      {d.order.length > 0 && d.status !== "done" && (
        <div className="ss-order">
          <span className="ss-order__label">{d.status === "setup" ? "Order" : `Round ${round + 1}`}</span>
          <ol className="ss-order__list">
            {(d.status === "setup" ? d.order : roundTeams).map((id, i) => {
              const t = team(id);
              if (!t) return null;
              const now = d.status !== "setup" && i === d.turns.length - round * d.order.length;
              return (
                <li key={`${id}-${i}`} className={now ? "is-now" : undefined}>
                  <TeamTag team={t} size="sm" />
                  <span className="sr-only">{t.name}{now ? ", on the clock" : ""}</span>
                  {now && <span className="ss-order__now" aria-hidden>on the clock</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {d.status === "setup" && <p className="ss-muted">{d.order.length ? "The organizers start the draft on stream." : "The organizers roll the order on stream."}</p>}

      <ul className="ss-legend" aria-label="What the tiles mean">
        <li><i className="ss-sw" aria-hidden />Open</li>
        <li><i className="ss-sw ss-sw--ban" aria-hidden />Banned</li>
        <li><i className="ss-sw ss-sw--pro" aria-hidden />Protected, in the pool</li>
      </ul>

      {mine && <p className="ss-draft__how">{!ban ? "Tap a track to ban." : needProtect && !protect ? "Now tap a track to protect." : "Lock it in, or tap a pick to change it."}</p>}

      <div className="ss-cups">
        {bankCups(d.bank).map((c) => (
          <div key={c.cup} className="ss-cup" role="group" aria-label={`${c.cup} Cup`}>
            <span className="ss-cup__name" aria-hidden>{c.cup} Cup</span>
            <div className="ss-cup__tiles">
              {c.tracks.map((tr) => {
                const b = banned.get(tr.id), pr = prot.get(tr.id);
                const state = b ? "ban" : pr ? "pro" : ban === tr.id ? "selban" : protect === tr.id ? "selpro" : "open";
                const who = team(b ?? pr ?? null);
                const label = `${tr.name}${b ? `, banned by ${who?.name ?? "a team"}` : pr ? `, protected by ${who?.name ?? "a team"}` : state === "selban" ? ", picked to ban" : state === "selpro" ? ", picked to protect" : ""}`;
                const icon = state === "ban" || state === "selban" ? <IconBan size={16} aria-hidden /> : state === "pro" || state === "selpro" ? <IconShield size={16} aria-hidden /> : <span className="ss-tile__gap" aria-hidden />;
                return mine && state !== "ban" && state !== "pro" ? (
                  <button key={tr.id} type="button" className={`ss-tile ss-tile--${state}`} aria-pressed={state === "selban" || state === "selpro"} aria-label={label} onClick={() => tap(tr.id)}>
                    {icon}<span>{tr.name}</span>
                  </button>
                ) : (
                  <div key={tr.id} className={`ss-tile ss-tile--${state}`} aria-label={label} role="img">
                    {icon}<span aria-hidden>{tr.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {mine && (
        <div className="ss-lockbar">
          <p>
            {ban ? <>Ban <b>{trackName(ban)}</b></> : "Pick a track to ban"}
            {needProtect && <> · {protect ? <>protect <b>{trackName(protect)}</b></> : "then one to protect"}</>}
          </p>
          <Button variant="primary" onClick={lock} disabled={busy || !ban || (needProtect && !protect)}>
            {busy ? "Locking in" : staff && d.onClock !== myTeamId ? `Lock in for ${onClock?.tag ?? "them"}` : "Lock in"}
          </Button>
        </div>
      )}

      {last && (
        <p className="ss-muted ss-draft__last" aria-live="polite">
          Last turn: {team(last.team)?.name ?? "A team"} banned {trackName(last.ban)}{last.protect ? ` and protected ${trackName(last.protect)}` : ""}{last.auto ? " (time ran out, picked at random)" : ""}.
        </p>
      )}
    </section>
  );
}
