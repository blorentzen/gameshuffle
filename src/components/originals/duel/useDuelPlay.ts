"use client";

/**
 * One duel on screen, played against a server that holds it (Trainer Road's routes; the Daily
 * Duel's page has the same logic of its own): takes the server's copy of the duel and plays the
 * difference one hit at a time (duelBeats.ts), sends each step, asks the professor for a tip, and
 * holds the final picture a moment before the result shows. A tap on the arena skips the beats.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast/ToastProvider";
import type { DuelAct, DuelStep } from "@/lib/originals/duel/types";
import type { DuelHintView, DuelRunView } from "@/lib/originals/duel/view";
import { framesBetween, type Frame } from "./duelBeats";
import { reducedMotion } from "./duelLook";

/** How long the final picture holds before the result shows. */
const OVER_MS = 1400;

export function useDuelPlay<R extends DuelRunView>({ fetcher, runPath, onFinished }: {
  /** Fetch with the player's guest id (and anything else the routes need). */
  fetcher: (path: string, init?: RequestInit) => Promise<Response>;
  /** A run's route ("/api/trainer-road/<id>"). */
  runPath: (id: string) => string;
  /** A run just finished (once per run). */
  onFinished?: (run: R) => void;
}) {
  const toast = useToast();
  const [run, setRun] = useState<R | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staging, setStaging] = useState(false);
  const [offset, setOffset] = useState(0);
  const timers = useRef<number[]>([]);
  const beatTimers = useRef<number[]>([]);
  const beatsLeft = useRef<{ last: Frame; done: () => void } | null>(null);
  const nonce = useRef(1);
  const frameRef = useRef<Frame | null>(null);
  useEffect(() => { frameRef.current = frame; }, [frame]);
  const finished = useRef(new Set<string>());
  const onFinishedRef = useRef(onFinished);
  useEffect(() => { onFinishedRef.current = onFinished; }, [onFinished]);

  useEffect(() => () => { for (const t of [...timers.current, ...beatTimers.current]) window.clearTimeout(t); }, []);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  const endBeats = useCallback(() => {
    for (const t of beatTimers.current) window.clearTimeout(t);
    beatTimers.current = [];
    const left = beatsLeft.current;
    beatsLeft.current = null;
    if (!left) return;
    setFrame(left.last);
    setStaging(false);
    left.done();
  }, []);

  const playFrames = useCallback((frames: Frame[], done: () => void) => {
    for (const t of beatTimers.current) window.clearTimeout(t);
    beatTimers.current = [];
    beatsLeft.current = null;
    setFrame(frames[0]);
    if (frames.length === 1) { setStaging(false); done(); return; }
    setStaging(true);
    beatsLeft.current = { last: frames[frames.length - 1], done };
    let at = 0;
    frames.slice(0, -1).forEach((f, i) => {
      at += f.ms;
      const next = frames[i + 1];
      beatTimers.current.push(window.setTimeout(i + 1 === frames.length - 1 ? endBeats : () => setFrame(next), at));
    });
  }, [endBeats]);

  /** Takes the server's copy of the duel and plays the difference (`fresh`: a new duel, no beats). */
  const take = useCallback((r: R, opts: { fresh?: boolean; quiet?: boolean } = {}) => {
    const prev = opts.fresh ? null : frameRef.current?.play ?? null;
    setRun(r);
    setOffset(Date.parse(r.serverNow) - Date.now());
    const frames = framesBetween(prev, r.play, nonce.current, { quiet: opts.quiet });
    nonce.current += frames.length + 1;
    let done = () => {};
    if (r.status === "done" && !finished.current.has(r.id)) {
      finished.current.add(r.id);
      setHolding(true);
      done = () => later(reducedMotion() ? 0 : OVER_MS, () => {
        setHolding(false);
        requestAnimationFrame(() => {
          const el = document.getElementById("duel-result");
          if (!el) return;
          el.focus({ preventScroll: true });
          const top = el.getBoundingClientRect().top + window.scrollY - 88;
          window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
        });
      });
      onFinishedRef.current?.(r);
    }
    playFrames(frames, done);
  }, [playFrames]);

  /** A duel picked back up (no beats). */
  const resume = useCallback((r: R) => {
    setRun(r);
    setOffset(Date.parse(r.serverNow) - Date.now());
    setFrame(framesBetween(null, r.play, nonce.current++)[0]);
    setStaging(false);
    setHolding(false);
  }, []);

  const send = useCallback(async (step: DuelStep) => {
    if (!run || busy || staging) return;
    setBusy(true);
    const res = await fetcher(runPath(run.id), { method: "POST", body: JSON.stringify(step) }).catch(() => null);
    if (res?.ok) {
      const body = (await res.json()) as { run: R };
      setBusy(false);
      take(body.run);
      return;
    }
    const status = res?.status ?? 0;
    // Out of step with the server (two taps at once, another tab): take the server's copy.
    const fresh = await fetcher(runPath(run.id)).then((x) => (x.ok ? x.json() : null)).catch(() => null) as { run: R } | null;
    setBusy(false);
    if (fresh) take(fresh.run, { quiet: true });
    if (status === 422) toast.error("That isn't allowed right now.");
    else if (!fresh) toast.error("Couldn't send that. Check your connection.");
  }, [busy, fetcher, run, runPath, staging, take, toast]);

  const onTurn = useCallback((attach: number, act: DuelAct, use?: number) => void send(use != null ? { attach, act, use } : { attach, act }), [send]);
  const onNext = useCallback((card: number) => void send({ next: card }), [send]);
  const onBring = useCallback((cards: number[]) => void send({ bring: cards }), [send]);
  const onTip = useCallback(async () => {
    if (!run) return null;
    const res = await fetcher(runPath(run.id), { method: "POST", body: JSON.stringify({ action: "tip" }) });
    if (!res.ok) throw new Error(`tip ${res.status}`);
    const { hint } = (await res.json()) as { hint: DuelHintView | null };
    setRun((r) => (r ? { ...r, asked: true } : r));
    return hint;
  }, [fetcher, run, runPath]);

  const clear = useCallback(() => { setRun(null); setFrame(null); setHolding(false); }, []);

  return { run, frame, holding, busy, setBusy, staging, offset, take, resume, clear, endBeats, onTurn, onNext, onBring, onTip };
}
