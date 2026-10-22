"use client";

/**
 * The MMR card with its moments played in order.
 *   MmrLive: the OBS link and the overlay piece. Polls /api/mmr/live/<token> every
 *     30 seconds while visible; each new verified event since the last look plays as a
 *     moment (the change pops, then the number rolls), one after another.
 *   MmrDemo: the made-up night on a loop, for previews.
 *   MmrPreview: a real player's card with "Play a win / loss / new division" for the studio.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MmrLook } from "@/lib/mmr/look";
import { DEMO_EVENTS, demoSource, isEvent, milestoneTier, viewOf, withEvent, type MmrGame, type MmrSource, type MmrView } from "@/lib/mmr/rules";
import type { MmrLiveResult } from "@/lib/mmr/types";
import { nightRecap } from "@/lib/lounge/recap";
import { crossesGoal } from "@/lib/mmr/goal";
import { MmrCard, type MmrPlay } from "./MmrCard";

const STEP_MS = 3600;
const POLL_MS = 30_000;

const divIndex = (src: MmrSource, name: string) => src.steps.findIndex((s) => s.name === name);

/** The moments between `fromId` (exclusive) and the newest change, oldest first. `goal`: tonight's goal, so the event that reaches it plays its moment. */
function momentsSince(src: MmrSource, fromId: number | null, goal: number | null = null): { before: MmrView; after: MmrView; play: Omit<MmrPlay, "id"> }[] {
  if (fromId == null) return [];
  const newer = src.changes.filter((c) => c.id > fromId).reverse();
  return newer.map((c) => {
    const i = src.changes.findIndex((x) => x.id === c.id);
    const prev = src.changes[i + 1];
    const before = prev ? viewOf(src, prev.id) : viewOf(src, c.id);
    const after = i === 0 ? viewOf(src) : viewOf(src, c.id);
    const rankup = divIndex(src, after.division) > divIndex(src, before.division) && before.division !== "Placement" ? after.division : null;
    return { before, after, play: { delta: isEvent(c) ? c.delta : 0, rankup, goal: crossesGoal(before.mmr, after.mmr, goal) ? goal : null } };
  });
}

function useSequencer() {
  const timers = useRef<number[]>([]);
  const next = useRef(1);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return useCallback((steps: { before: MmrView; after: MmrView; play: Omit<MmrPlay, "id"> }[], setView: (v: MmrView) => void, setPlay: (p: MmrPlay) => void, gap = STEP_MS) => {
    steps.forEach((s, i) => {
      timers.current.push(window.setTimeout(() => { setView(s.before); setPlay({ ...s.play, id: next.current++ }); }, i * gap));
      timers.current.push(window.setTimeout(() => setView(s.after), i * gap + 650));
    });
    return steps.length * gap;
  }, []);
}

export function MmrLive({ token, initial, fit = "obs", look: lookOverride, lookId, recap = false }: { token: string; initial: MmrLiveResult; fit?: "obs" | "frame"; look?: MmrLook; lookId?: string | null; /** The night recap view (GS Pro) instead of the card. */ recap?: boolean }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<MmrView | null>(initial.ok ? viewOf(initial.source) : null);
  const [play, setPlay] = useState<MmrPlay | null>(null);
  const seen = useRef<number | null>(initial.ok ? initial.source.changes[0]?.id ?? 0 : null);
  // When this card started watching: a milestone reached before then never plays.
  const mounted = useRef(0);
  const playedMilestone = useRef<string | null>(null);
  const run = useSequencer();

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/mmr/live/${encodeURIComponent(token)}${lookId ? `?look=${encodeURIComponent(lookId)}` : ""}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as MmrLiveResult;
        if (stop) return;
        setData(next);
        if (!next.ok) return;
        const steps = momentsSince(next.source, seen.current, next.goal ?? null);
        seen.current = next.source.changes[0]?.id ?? seen.current ?? 0;
        let wait = 0;
        if (steps.length) wait = run(steps.slice(-5), setView, setPlay);
        else setView(viewOf(next.source));
        const m = next.milestone;
        if (m && !m.initial && Date.parse(m.at) > mounted.current && playedMilestone.current !== m.at && milestoneTier(next.source.worldRank) === m.tier) {
          playedMilestone.current = m.at;
          window.setTimeout(() => setPlay({ id: Date.now(), delta: 0, rankup: null, milestone: m.tier }), wait);
        }
      } catch { /* keep the last card on screen */ }
    };
    if (!mounted.current) mounted.current = Date.now();
    if (!initial.ok) void tick();
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, lookId, run]);

  const look = lookOverride ?? (data.ok ? data.look : data.look);
  if (!view || !look) return null;
  if (recap) {
    // The recap is GS Pro; a lapsed or free card says so instead of drawing it.
    if (!data.pro) return <p className="mmr-obs-note">The night recap is part of GS Pro.</p>;
    return <MmrCard view={view} look={look} fit={fit} recap={data.ok ? nightRecap(data.source) : null} goal={data.ok ? data.goal ?? null : null} />;
  }
  return <MmrCard view={view} look={look} play={play} fit={fit} pending={data.ok ? data.pending ?? null : null} goal={data.ok ? data.goal ?? null : null} />;
}

/** The made-up night on a loop (a win, a loss, a win, a climb into Platinum, a third straight win and a new peak). */
export function MmrDemo({ look, game, name, avatar, paused = false, fit = "frame", gap = STEP_MS }: { look: MmrLook; game?: MmrGame; name?: string; avatar?: string | null; paused?: boolean; fit?: "obs" | "frame"; /** Time between events (the Rolling layout needs room to roll between them). */ gap?: number }) {
  const start = useCallback(() => ({ ...demoSource(game ?? look.game, name ?? "Sam"), avatar: avatar ?? null }), [game, look.game, name, avatar]);
  const [first] = useState<MmrSource>(start);
  const src = useRef<MmrSource>(first);
  const step = useRef(0);
  const [view, setView] = useState<MmrView>(() => viewOf(first));
  const [play, setPlay] = useState<MmrPlay | null>(null);
  const run = useSequencer();

  useEffect(() => { src.current = start(); step.current = 0; setView(viewOf(src.current)); }, [start]);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      if (step.current >= DEMO_EVENTS.length) { src.current = start(); step.current = 0; setView(viewOf(src.current)); return; }
      const before = src.current;
      src.current = withEvent(before, DEMO_EVENTS[step.current++]);
      run(momentsSince(src.current, before.changes[0]?.id ?? null), setView, setPlay);
    }, gap);
    return () => clearInterval(id);
  }, [paused, run, start, gap]);

  return <MmrCard view={view} look={look} play={play} fit={fit} />;
}

export type PreviewMoment = "win" | "loss" | "rankup" | "goal";

/** A player's card for the studio, with moments played on request (nothing is saved). `goal`: tonight's goal, if set. */
export function useMmrPreview(source: MmrSource, goal: number | null = null) {
  const [src, setSrc] = useState(source);
  const [view, setView] = useState<MmrView>(() => viewOf(source));
  const [play, setPlay] = useState<MmrPlay | null>(null);
  const run = useSequencer();
  useEffect(() => { setSrc(source); setView(viewOf(source)); }, [source]);

  const tryMoment = (kind: PreviewMoment) => {
    const cur = viewOf(src);
    let delta = kind === "win" ? 46 : -38;
    if (kind === "rankup") delta = cur.toNext != null ? cur.toNext + 12 : 60;
    // Reaching the goal: just enough to cross it (a small win when it's already behind the number).
    if (kind === "goal") delta = goal != null && cur.mmr != null && goal > cur.mmr ? goal - cur.mmr + 8 : 46;
    const next = withEvent(src, { delta, place: kind === "loss" ? 9 : 1 });
    run(momentsSince(next, src.changes[0]?.id ?? null, goal), setView, setPlay);
    setSrc(next);
  };
  return { view, play, tryMoment, reset: () => { setSrc(source); setView(viewOf(source)); } };
}
