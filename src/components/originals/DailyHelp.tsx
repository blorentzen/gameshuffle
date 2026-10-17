"use client";

/**
 * Help bought with tokens on the dailies' last chance (Britton's picks,
 * 2026-10-16, https://claude.ai/artifact/ToPbxWXmsKsbxSzr4gdQNf): another
 * letter of the name (gold squares) or one more guess. Accounts and Discord
 * players spend from their wallet; guests are offered a free account (they'd
 * start with 10,000). A solve with help is a save, like the last chance.
 * Server: src/lib/daily/help.ts.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { OriginalsLink, useOriginalsHost } from "@/components/originals/OriginalsHost";
import { EVENTS, track } from "@/lib/analytics/events";
import { NO_HELP, helpCells, helpCellsLabel, type HelpCell, type HelpCounts, type HelpPrices } from "@/lib/originals/dailyHelp";

interface HelpInfo { signedIn: boolean; ready?: boolean; balance?: number | null; prices?: HelpPrices; help?: HelpCounts; lettersLeft?: number }

/**
 * The game's help: what this player bought today (from the server for accounts
 * and Discord players, else `local`, which the game also keeps in the browser
 * so a reload can't end a game early) and the panel's prices and balance.
 */
export function useDailyHelp(game: "shuffle" | "dex", local: HelpCounts | null | undefined) {
  const { api } = useOriginalsHost();
  const [info, setInfo] = useState<HelpInfo | null>(null);
  const load = useCallback(() => api(`/api/daily/help?game=${game}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: HelpInfo | null) => { if (d) setInfo(d); }).catch(() => {}), [api, game]);
  useEffect(() => { void load(); }, [load]);
  const server = info?.help ?? NO_HELP;
  const help: HelpCounts = { letters: Math.max(server.letters, local?.letters ?? 0), guesses: Math.max(server.guesses, local?.guesses ?? 0) };
  return { info, setInfo, help, reload: load };
}

/** The name as squares: given letters green, bought ones gold, the rest blank. */
export function HelpWord({ name, free, bought, note }: { name: string; free: number; bought: number; note: string }) {
  const cells = helpCells(name, free, bought);
  const cls = (c: HelpCell) => (c.kind === "free" ? "first" : c.kind);
  return (
    <div className="dex-reveal">
      <div className="dex-reveal__word" role="img" aria-label={helpCellsLabel(cells)}>
        {cells.map((c, i) => (
          <span key={i} className={`dex-reveal__cell dex-reveal__cell--${cls(c)}`} aria-hidden>
            {c.kind === "free" || c.kind === "bought" || c.kind === "mark" ? c.ch : ""}
          </span>
        ))}
      </div>
      <span className="party-muted">{note}</span>
    </div>
  );
}

export function DailyHelpPanel({ game, info, help, onBought, signupPath }: {
  game: "shuffle" | "dex";
  info: HelpInfo | null;
  help: HelpCounts;
  onBought: (help: HelpCounts, balance: number) => void;
  /** Where a guest signs up and comes back to. */
  signupPath: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { api } = useOriginalsHost();
  const [busy, setBusy] = useState(false);
  if (!info) return null;
  if (!info.signedIn) {
    return (
      <p className="daily-help__guest">
        Stuck? <OriginalsLink href={`/signup?redirect=${signupPath}`}>Make a free account</OriginalsLink>{" "}to use tokens for another letter or one more guess. You&apos;d start with 10,000.
      </p>
    );
  }
  if (!info.ready || !info.prices) return null;
  const prices = info.prices;
  const balance = info.balance ?? 0;
  const lettersLeft = info.lettersLeft ?? 0;
  const guessesLeft = Math.max(0, prices.guesses - help.guesses);

  const buy = async (kind: "letter" | "guess") => {
    const price = kind === "letter" ? prices.letter : prices.guess;
    const what = kind === "letter" ? (game === "shuffle" && help.letters === 0 ? "the first letter" : "the next letter") : "one more guess";
    if (!(await confirm({ title: `Spend ${price} tokens on ${what}?`, body: "Tokens only go if it works. A solve with help counts as a save.", confirmLabel: `Spend ${price} tokens`, danger: false }))) return;
    setBusy(true);
    const res = await api("/api/daily/help", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, kind }) }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string; help?: HelpCounts; balance?: number } | null;
    setBusy(false);
    if (d?.ok && d.help) {
      onBought(d.help, d.balance ?? balance - price);
      track(EVENTS.dailyHelpBought, { game, kind });
      toast.success(kind === "letter" ? "Here's another letter." : "One more guess added.");
    } else if (d?.error === "insufficient_balance") {
      toast.error(`Not enough tokens: you have ${(d.balance ?? balance).toLocaleString("en-US")}.`);
    } else if (d?.error === "limit") {
      toast.error(kind === "letter" ? "That's every letter you can buy today." : "That's every extra guess you can buy today.");
    } else if (d?.error === "finished") {
      toast.error("Today's game is already over.");
    } else {
      toast.error("Couldn't buy that just now. Try again.");
    }
  };

  return (
    <section className="daily-help" aria-labelledby={`daily-help-${game}`}>
      <div className="daily-help__head">
        <h2 id={`daily-help-${game}`} className="daily-help__title">Need a hand?</h2>
        <span className="daily-help__balance">You have {balance.toLocaleString("en-US")} tokens</span>
      </div>
      <div className="daily-help__row">
        <span className="daily-help__what">
          {game === "shuffle" && help.letters === 0 ? "First letter and length" : "The next letter"}
          <small>{lettersLeft ? `${lettersLeft} more you can buy` : "No more letters today"}</small>
        </span>
        <Button variant="primary" size="small" disabled={busy || !lettersLeft || balance < prices.letter} onClick={() => void buy("letter")}>{prices.letter} tokens</Button>
      </div>
      <div className="daily-help__row">
        <span className="daily-help__what">
          One more guess
          <small>{guessesLeft ? `${guessesLeft} more you can buy, before your last guess` : "No more extra guesses today"}</small>
        </span>
        <Button variant="primary" size="small" disabled={busy || !guessesLeft || balance < prices.guess} onClick={() => void buy("guess")}>{prices.guess} tokens</Button>
      </div>
    </section>
  );
}
