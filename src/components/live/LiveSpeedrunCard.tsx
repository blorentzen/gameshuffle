"use client";

/**
 * The speedrun "PB this run" prediction on the live page (approved mockup screen 7): the run as the stream shows it
 * (the clock, the split being run, ahead or behind), the question, PB or No PB with the room's split, a token amount,
 * and what it would pay right now. After the lock it turns into the viewer's bet, then the result. Same pool as chat's
 * `!bet pb 100` / `!bet no 100`. The run waits out the streamer's stream delay so the page never shows a split before
 * the stream does (the market itself already moves on the stream's time).
 *
 * `SpeedrunPredictionCard` draws it from the market route's speedrun body (the Predict tab passes it in);
 * `LiveSpeedrunCard` fetches it itself for the live page when no GameShuffle stream is running.
 */

import { useEffect, useState } from "react";
import { Badge, Button, Card, Chip } from "@empac/cascadeds";
import { IconCaretDownFilled, IconCaretUpFilled, IconStopwatch } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { TokenIcon } from "@/components/TokenIcon";
import { useToast } from "@/components/toast/ToastProvider";
import { useLiveHost } from "@/components/live/LiveHost";
import { everyVisible } from "@/lib/hooks/everyVisible";
import { refreshViewerBalance, useViewerBalance } from "@/lib/economy/useViewerBalance";
import { fmtClock, fmtDelta } from "@/lib/speedrun/time";
import { currentIndex, lastDelta } from "@/lib/speedrun/rules";
import { shownState } from "@/lib/speedrun/splitGroups";
import { payoutIfWon } from "@/lib/speedrun/chat";
import type { LiveSpeedrunBody } from "@/lib/speedrun/prediction";
import type { RelayState } from "@/lib/speedrun/types";
import "@/styles/speedrun-live.css";

const STAKES = [25, 50, 100, 250] as const;
const n0 = (n: number) => n.toLocaleString("en-US");

/** The run as the stream shows it: each state from the relay, shown once the stream delay has passed. */
export function useDelayedRun(state: RelayState | null, ageMs: number | null, streamDelayMs: number) {
  // A second more than the delay: `now` only ticks once a second between runs, so a state's age is read late by up to that.
  const delayMs = streamDelayMs + 1000;
  const [now, setNow] = useState(() => Date.now());
  const [queue, setQueue] = useState<{ madeAt: number; state: RelayState }[]>([]);
  const [seen, setSeen] = useState<number | null>(null);
  if (state && state.seq !== seen) {
    setSeen(state.seq);
    setQueue((q) => [...q.filter((e) => e.state.attempt === state.attempt).slice(-9), { madeAt: now - (ageMs ?? 0), state }]);
  }
  let shown: { madeAt: number; state: RelayState } | null = null;
  for (const e of queue) if (e.madeAt + delayMs <= now) shown = e;
  const running = shown?.state.phase === "running";
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), running ? 100 : 1000);
    return () => window.clearInterval(id);
  }, [running]);
  if (!shown) return null;
  const st = shownState(shown.state);
  const ms = st.phase === "running" ? st.elapsedMs + Math.max(0, now - (shown.madeAt + delayMs)) : st.elapsedMs;
  return { st, ms };
}

function RunLine({ body }: { body: LiveSpeedrunBody }) {
  const run = useDelayedRun(body.run.state, body.run.ageMs, body.delayMs);
  const title = [body.run.game, body.run.category].filter(Boolean).join(" · ") || "Speedrun";
  let now: string | null = null;
  let chip: { ms: number } | null = null;
  if (run) {
    const st = run.st;
    if (st.phase === "ended") now = "Finished";
    else if (st.phase !== "idle") now = `${st.segments[currentIndex(st) ?? 0]?.name ?? ""} now${st.phase === "paused" ? " (paused)" : ""}`;
    const d = lastDelta(st);
    chip = d ? { ms: d.ms } : null;
  }
  return (
    <div className="lsrp-run">
      <IconTile icon={IconStopwatch} tone="teal" />
      <div className="lsrp-run__body">
        <b>{title}</b>
        {run && run.st.phase !== "idle" && (
          <div className="lsrp-run__now">
            <span className="lsrp-run__clock">{fmtClock(run.ms)}</span>
            {now && <span>{now}</span>}
            {chip && (
              <span className={`lsrp-d ${chip.ms <= 0 ? "is-ahead" : "is-behind"}`}>
                {chip.ms <= 0 ? <IconCaretDownFilled size={16} aria-hidden="true" /> : <IconCaretUpFilled size={16} aria-hidden="true" />}
                {fmtDelta(chip.ms)} {chip.ms <= 0 ? "ahead" : "behind"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  body: LiveSpeedrunBody;
  streamerSlug: string;
  /** Ask the viewer to sign in with Twitch. */
  onSignIn: () => void;
  /** After a bet: refresh the body. */
  onPlaced: () => void;
  /** The live page's run card above already shows the run. */
  hideRun?: boolean;
}

export function SpeedrunPredictionCard({ body, streamerSlug, onSignIn, onPlaced, hideRun = false }: CardProps) {
  const toast = useToast();
  const { activated, balance } = useViewerBalance();
  const [side, setSide] = useState<"pb" | "no">("pb");
  const [stake, setStake] = useState<number | "all">(100);
  const [busy, setBusy] = useState(false);
  const p = body.prediction;
  const me = body.viewer;
  const signedIn = !!me;
  const amount = stake === "all" ? Math.max(0, balance ?? 0) : stake;
  const sideWord = (k: "pb" | "no") => (k === "pb" ? "PB" : "No PB");
  const pct = (k: "pb" | "no") => (p.total > 0 ? Math.round(((k === "pb" ? p.pb.total : p.no.total) / p.total) * 100) : 0);

  const place = async () => {
    if (!signedIn) { onSignIn(); return; }
    if (!amount) { toast.error("You don't have any tokens to put in yet."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/live/${encodeURIComponent(streamerSlug)}/bet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId: body.market.id, optionKey: side, amount }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; mode?: string; error?: string; message?: string; balance?: number };
      if (!res.ok || !out.ok) {
        const words: Record<string, string> = {
          market_not_open: "Bets on this run just locked.",
          insufficient_balance: "You don't have that many tokens.",
          twitch_identity_required: "Sign in with Twitch to bet.",
          unauthenticated: "Sign in with Twitch to bet.",
        };
        toast.error(out.message ?? words[out.error ?? ""] ?? "That didn't go through. Try again.");
        return;
      }
      toast.success(out.mode === "spectator" ? `Picked ${sideWord(side)} (no tokens in your region).` : `${n0(amount)} tokens on ${sideWord(side)}.`);
      refreshViewerBalance();
      onPlaced();
    } catch {
      toast.error("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── After the lock, and after the end: the viewer's bet, then the result ──
  if (p.status !== "open") {
    let tag: { text: string; variant: "success" | "warning" | "info" | "default" };
    let head: string;
    let sub: string;
    const stakeWords = me?.stake ? `${n0(me.stake)} on ${sideWord(me.side ?? "pb")}` : null;
    if (p.status === "locked") {
      tag = { text: "Locked", variant: "info" };
      head = stakeWords ? `You have ${stakeWords}` : "Bets are locked";
      sub = p.total > 0 ? `${p.pbPct ?? 0}% say PB, ${n0(p.total)} tokens in. It settles when the run ends.` : "Nobody put tokens in this time. It settles when the run ends.";
    } else if (p.status === "cancelled") {
      tag = { text: "Tokens back", variant: "default" };
      head = "Reset before the bets locked";
      sub = "Everyone has their tokens back.";
    } else {
      const r = p.result;
      const won = r?.winner === "pb";
      tag = { text: won ? "New PB" : "No PB", variant: won ? "success" : "default" };
      if (me?.stake && me.payout != null) {
        head = me.payout > me.stake || (me.payout === me.stake && r?.refunded)
          ? r?.refunded ? `You got your ${n0(me.stake)} back` : `You got ${n0(me.payout)} tokens back for your ${n0(me.stake)}`
          : `Your ${n0(me.stake)} on ${sideWord(me.side ?? "pb")} didn't come back this time`;
      } else {
        head = won ? `${body.runner} got a personal best` : "No personal best this run";
      }
      sub = !r || p.total === 0
        ? "Nobody put tokens in this time."
        : r.refunded
          ? "Everyone picked the same side, so everyone got their tokens back."
          : `${n0(r.winners)} ${r.winners === 1 ? "person" : "people"} called it and split ${n0(r.pot)} tokens.`;
    }
    return (
      <Card variant="outlined" padding="none" className="lsrp lsrp--mini">
        <div className="lsrp__in">
          <span className="live-poll__eyebrow">This run</span>
          {!hideRun && <RunLine body={body} />}
          <div className="lsrp-mini">
            <Badge variant={tag.variant} size="small">{tag.text}</Badge>
            <b>{head}</b>
            <p>{sub}</p>
          </div>
        </div>
      </Card>
    );
  }

  // ── Open: pick a side, a token amount, and see what it would pay ──
  const est = amount > 0 ? payoutIfWon(amount, side, p.pb.total, p.no.total) : 0;
  return (
    <Card variant="outlined" padding="none" className="lsrp">
      <div className="lsrp__in">
        <span className="live-poll__eyebrow">This run</span>
        {!hideRun && <RunLine body={body} />}
        <div>
          <h3 className="lsrp__q">{body.market.question || `Will ${body.runner} get a personal best this run?`}</h3>
          <p className="lsrp__meta">
            {p.lockName ? `Bets lock after ${p.lockName}` : "Bets lock early in the run"}
            {p.total > 0 ? ` · ${n0(p.total)} tokens from ${n0(p.people)} ${p.people === 1 ? "person" : "people"}` : " · no tokens in yet"}
          </p>
        </div>
        <div className="lsrp-opts" role="group" aria-label="Your pick">
          {(["pb", "no"] as const).map((k) => (
            <Card key={k} variant="outlined" padding="none" interactive selected={side === k} onClick={() => setSide(k)} className="lsrp-opt" aria-pressed={side === k}>
              <span className="lsrp-opt__in">
                <b>{sideWord(k)}</b>
                <span className="lsrp-bar" aria-hidden="true"><i style={{ width: `${pct(k)}%` }} /></span>
                <small>{pct(k)}% · {n0(k === "pb" ? p.pb.total : p.no.total)} tokens</small>
              </span>
            </Card>
          ))}
        </div>
        {me?.isRunner ? (
          <p className="lsrp__fine">You&apos;re the runner, so this prediction is for chat.</p>
        ) : (
          <>
            <div className="lsrp-stake">
              <div className="lsrp-stake__row">
                <span id="lsrp-stake-label">Tokens to put in</span>
                {signedIn && activated && balance != null && <span>You have <b>{n0(balance)}</b> <TokenIcon size={14} /></span>}
              </div>
              <div className="lsrp-stake__chips" role="group" aria-labelledby="lsrp-stake-label">
                {STAKES.map((v) => (
                  <Chip key={v} label={n0(v)} clickable selected={stake === v} onClick={() => setStake(v)} />
                ))}
                <Chip label="All in" clickable selected={stake === "all"} onClick={() => setStake("all")} />
              </div>
            </div>
            {me?.stake ? <p className="lsrp__fine">You have {n0(me.stake)} on {sideWord(me.side ?? "pb")} so far.</p> : null}
            <Button variant="primary" fullWidth onClick={() => void place()} disabled={busy}>
              {signedIn ? `Put ${n0(amount)} on ${sideWord(side)}` : "Sign in with Twitch to bet"}
            </Button>
            {signedIn && amount > 0 && (
              <p className="lsrp__est">
                {(side === "pb" ? p.no.total : p.pb.total) > 0
                  ? `If ${sideWord(side)} wins now, your ${n0(amount)} comes back as about ${n0(est)}.`
                  : `Nobody's on the other side yet: if it stays that way, you get your ${n0(amount)} back.`}
              </p>
            )}
            <p className="lsrp__fine">Everyone who picks right shares the tokens put in. Chat can bet with !bet pb 100 or !bet no 100. Tokens can&apos;t be bought or cashed out.</p>
          </>
        )}
      </div>
    </Card>
  );
}

/** The card on its own, for the live page when no GameShuffle stream is running: shows only while a prediction is. */
export function LiveSpeedrunCard({ streamerSlug, hideRun = false }: { streamerSlug: string; /** The run card above shows the run. */ hideRun?: boolean }) {
  const host = useLiveHost();
  const [body, setBody] = useState<LiveSpeedrunBody | null>(null);
  const [nudge, setNudge] = useState(0);
  const active = !!body;
  useEffect(() => {
    let live = true;
    const load = async () => {
      const d = await host.api(`/api/live/${encodeURIComponent(streamerSlug)}/market`);
      if (live) setBody(d && d.kind === "speedrun" ? (d as LiveSpeedrunBody) : null);
    };
    void load();
    const stop = everyVisible(() => void load(), active ? 5000 : 20_000);
    return () => { live = false; stop(); };
  }, [host, streamerSlug, active, nudge]);
  if (!body) return null;
  return (
    <section className="live-srp" aria-label="Speedrun prediction">
      <SpeedrunPredictionCard body={body} streamerSlug={streamerSlug} onSignIn={() => host.signIn("bet on this run")} onPlaced={() => setNudge((x) => x + 1)} hideRun={hideRun} />
    </section>
  );
}
