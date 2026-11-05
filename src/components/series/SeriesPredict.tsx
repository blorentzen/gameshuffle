"use client";

/**
 * Predictions on a series night (pick 7A), on the event page and each streamer's live page. One answer per
 * question; more tokens can go on the same answer. Pots are shared by every stream. On GameShuffle it's
 * "predict": tokens can't be bought or cashed out, and prizes never go to predictions.
 */

import { useState } from "react";
import Link from "next/link";
import { Button, FormField, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { NightView, PredictionView, SeriesTeamView } from "@/lib/series/view";
import { TeamTag } from "./SeriesBits";
import { EVENTS, track } from "@/lib/analytics/events";

export interface MyPicks { [predictionId: string]: { option: string; amount: number; paid: number | null } }

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");
const fmt = (n: number) => n.toLocaleString("en-US");

function statusLine(p: PredictionView, labelOf: (k: string) => string): string {
  if (p.status === "open") return "Open until the first race starts";
  if (p.status === "locked") return "Closed. Pays out after the last race.";
  if (p.status === "cancelled") return "Cancelled. Every token went back.";
  return p.result?.length ? `Result: ${p.result.map(labelOf).join(" and ")}` : "Settled";
}

function PredictionItem({ p, slug, from, mine, signedIn, loginHref, level, onDone }: {
  p: PredictionView; slug: string; from: string | null; mine: MyPicks[string] | undefined; signedIn: boolean; loginHref: string; level: 3 | 4; onDone: (balance?: number) => void;
}) {
  const H = level === 3 ? "h3" : "h4";
  const toast = useToast();
  const [pick, setPick] = useState<string | null>(mine?.option ?? null);
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const labelOf = (k: string) => p.options.find((o) => o.key === k)?.label ?? k;
  const chosen = mine?.option ?? pick;
  const open = p.status === "open";

  const send = async () => {
    if (!chosen) return;
    setBusy(true);
    const res = await fetch(`/api/series/${slug}/predict`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictionId: p.id, option: chosen, amount: Number(amount), from }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { error?: string; balance?: number } | null;
    setBusy(false);
    if (!res?.ok) { toast.error(j?.error ?? "Couldn't save that prediction."); return; }
    toast.success(`${fmt(Number(amount))} tokens on ${labelOf(chosen)}`);
    track(EVENTS.seriesPredicted, { kind: p.kind, from: from ? "live" : "series" });
    onDone(j?.balance);
  };

  const won = p.status === "settled" && mine && p.result?.includes(mine.option);
  return (
    <li className="ss-pred">
      <div className="ss-pred__head">
        <H className="ss-pred__q">{p.question}</H>
        <span className="ss-muted ss-small">{statusLine(p, labelOf)} · {fmt(p.pot)} tokens from {fmt(p.picks)} {p.picks === 1 ? "person" : "people"}</span>
      </div>
      <div className={`ss-pred__opts ss-pred__opts--${p.options.length > 3 ? "grid" : "row"}`} role="group" aria-label={p.question}>
        {p.options.map((o) => {
          const isWin = !!p.result?.includes(o.key);
          const selected = chosen === o.key;
          return (
            <Button
              key={o.key}
              variant={selected ? "primary" : "secondary"}
              size="small"
              aria-pressed={selected}
              disabled={!open || !signedIn || (!!mine && mine.option !== o.key)}
              onClick={() => setPick(o.key)}
              className={`ss-pred__opt${isWin ? " is-win" : ""}`}
            >
              <span className="ss-pred__in">
                <span className="ss-pred__label">{o.label}</span>
                <span className="ss-pred__share">{pct(o.pot, p.pot)}<span className="sr-only"> of the tokens</span></span>
              </span>
            </Button>
          );
        })}
      </div>
      {mine && (
        <p className="ss-pred__mine">
          You put {fmt(mine.amount)} on {labelOf(mine.option)}.
          {p.status === "settled" && (won ? ` You got ${fmt(mine.paid ?? 0)} back.` : mine.paid ? ` Nobody was right, so you got ${fmt(mine.paid)} back.` : " Not this time.")}
          {p.status === "cancelled" && " It came back to you."}
        </p>
      )}
      {open && signedIn && chosen && (
        <div className="ss-pred__send">
          <FormField label="Tokens" htmlFor={`ss-amt-${p.id}`}>
            <Input id={`ss-amt-${p.id}`} type="number" inputMode="numeric" min={10} max={5000} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <Button variant="primary" onClick={send} disabled={busy || !(Number(amount) >= 10)}>
            {busy ? "Saving" : mine ? `Add ${fmt(Number(amount) || 0)}` : `Predict ${labelOf(chosen)}`}
          </Button>
        </div>
      )}
      {open && !signedIn && <p className="ss-small"><Link href={loginHref}>Sign in to predict</Link></p>}
    </li>
  );
}

export function SeriesPredict({ slug, night, teams, predictions, picks, balance, signedIn, loginHref, focusTeamId, from, bare, onChanged }: {
  slug: string;
  night: NightView;
  teams: SeriesTeamView[];
  predictions: PredictionView[];
  picks: MyPicks;
  balance: number | null;
  signedIn: boolean;
  loginHref: string;
  /** On a streamer's live page: their team's questions come first. */
  focusTeamId?: string | null;
  from?: string | null;
  /** One team only (a player's live page): no team heading over its questions. */
  bare?: boolean;
  onChanged: () => void;
}) {
  const list = predictions.filter((p) => p.nightId === night.id);
  if (!list.length) return <p className="ss-muted">Predictions for the {night.label} open before it starts.</p>;
  const winner = list.filter((p) => p.kind === "night_winner");
  const byTeam = [...teams].sort((a, b) => (a.id === focusTeamId ? -1 : b.id === focusTeamId ? 1 : a.n - b.n));
  const item = (p: PredictionView, level: 3 | 4 = 3) => (
    <PredictionItem key={p.id} p={p} slug={slug} from={from ?? null} mine={picks[p.id]} signedIn={signedIn} loginHref={loginHref} level={level} onDone={() => onChanged()} />
  );
  return (
    <div className="ss-predict">
      <p className="ss-predict__note">
        {signedIn && balance != null ? <>You have <b>{fmt(balance)}</b> GameShuffle tokens. </> : null}
        Everyone who picks right shares the tokens put in on that question. Tokens can&rsquo;t be bought or cashed out.
      </p>
      {focusTeamId == null && winner.length > 0 && <ul className="ss-preds">{winner.map((p) => item(p, 3))}</ul>}
      {byTeam.map((t) => {
        const mine = list.filter((p) => p.teamId === t.id).sort((a, b) => (a.kind === "team_finish" ? -1 : b.kind === "team_finish" ? 1 : 0));
        if (!mine.length) return null;
        if (bare) return <ul key={t.id} className="ss-preds">{mine.map((p) => item(p, 3))}</ul>;
        return (
          <section key={t.id} className="ss-predict__team" aria-label={t.name}>
            <h3 className="ss-predict__teamname"><TeamTag team={t} size="sm" />{t.name}</h3>
            <ul className="ss-preds">{mine.map((p) => item(p, 4))}</ul>
          </section>
        );
      })}
      {focusTeamId != null && winner.length > 0 && <ul className="ss-preds">{winner.map((p) => item(p, 3))}</ul>}
    </div>
  );
}

