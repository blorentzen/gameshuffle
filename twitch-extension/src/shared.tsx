/**
 * Pieces every view of the extension shares: the store hook, the header and
 * the channel leaderboard. Styles in ext.css.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { IconCoin, IconTrophy } from "@tabler/icons-react";
import type { LeaderboardRow } from "@/lib/economy/leaderboards";
import { extStore } from "./api";

let version = 0;
const subscribe = (fn: () => void) => extStore().subscribe(() => { version += 1; fn(); });
const snapshot = () => version;

/** The store, re-rendering on every change, and kept fresh every 2 seconds while mounted. */
export function useExt() {
  const st = extStore();
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void st.fresh();
    const iv = window.setInterval(() => void st.fresh(), 2000);
    return () => window.clearInterval(iv);
  }, [st]);
  return st;
}

export function ExtHeader({ channel, tokens }: { channel: string | null; tokens?: number | null }) {
  return (
    <header className="ext-head">
      <h1 className="sr-only">GameShuffle{channel ? ` on ${channel}` : ""}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- not a Next page: Twitch serves these files */}
      <img className="ext-head__logo" src="logo-color.svg" alt="" aria-hidden width={112} height={20} />
      {channel && <span className="ext-head__channel" aria-hidden>{channel}</span>}
      {typeof tokens === "number" && (
        <span className="ext-head__tokens" title="Your tokens on this channel">
          <IconCoin size={14} aria-hidden />
          {tokens.toLocaleString("en-US")}
          <span className="sr-only"> tokens</span>
        </span>
      )}
    </header>
  );
}

export function Leaderboard({ rows, title }: { rows: LeaderboardRow[]; title: ReactNode }) {
  if (!rows.length) return null;
  return (
    <section className="ext-board" aria-label="Leaderboard">
      <h2 className="ext-k"><IconTrophy size={14} aria-hidden /> {title}</h2>
      <ol className="ext-board__list">
        {rows.map((r, i) => (
          <li key={r.identityId}>
            <span className="ext-board__place">{i + 1}</span>
            <span className="ext-board__name">{r.displayName || "A viewer"}</span>
            <span className="ext-board__score">{r.score.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
