"use client";

/**
 * Who's playing the Daily in this Discord call, above the Daily in the
 * Activity: each person's face, how it's going, and their rows as squares
 * (never the guesses, so nothing is spoiled). Hidden when you're the only one.
 * Checks every 15 seconds while the Daily tab is open.
 */

import { useEffect, useState } from "react";
import { Avatar } from "@empac/cascadeds";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import type { CallDailyPlayer } from "@/lib/activity/callDaily";

const POLL_MS = 15_000;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

function statusLine(p: CallDailyPlayer): string {
  if (p.status === "solved") return `Solved in ${p.guesses}`;
  if (p.status === "out") return "Out of guesses";
  if (p.status === "playing") return `${p.guesses} ${p.guesses === 1 ? "guess" : "guesses"} in`;
  return "Not started";
}

export function DailyCallStrip({ active }: { active: boolean }) {
  const { api } = useOriginalsHost();
  const [players, setPlayers] = useState<CallDailyPlayer[]>([]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    const read = async () => {
      const r = await api("/api/activity/daily/call", { cache: "no-store" }).catch(() => null);
      const j = (await r?.json().catch(() => null)) as { ok?: boolean; players?: CallDailyPlayer[] } | null;
      if (live && j?.ok && j.players) setPlayers(j.players);
    };
    void read();
    const iv = window.setInterval(() => void read(), POLL_MS);
    return () => { live = false; window.clearInterval(iv); };
  }, [active, api]);

  if (players.length < 2) return null;
  return (
    <section className="gs-callstrip" aria-label="Who's playing in this call">
      <p className="gs-callstrip__label">In this call</p>
      {/* Scrolls sideways on a phone: focusable so it can be scrolled from the keyboard. */}
      <div className="gs-callstrip__scroll" tabIndex={0} role="region" aria-label="Players in this call">
      <ul className="gs-callstrip__list">
        {players.map((p) => (
          <li key={p.id} className={`gs-callstrip__player is-${p.status}${p.me ? " is-me" : ""}`}>
            <Avatar size="small" src={p.avatar ?? undefined} initials={initials(p.name)} alt="" />
            <span className="gs-callstrip__text">
              <span className="gs-callstrip__name">{p.me ? "You" : p.name}</span>
              <span className="gs-callstrip__status">{statusLine(p)}</span>
            </span>
            {p.rows.length > 0 && (
              <span className="gs-callstrip__rows" aria-hidden>
                {p.rows.slice(0, 6).map((row, i) => (
                  <span key={i} className="gs-callstrip__row">{row.map((c, j) => <span key={j} className={`gs-callstrip__sq is-${c}`} />)}</span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}
