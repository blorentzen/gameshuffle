"use client";

/**
 * The lounge boards (lookup picks, 2026-10-21): game pills over CascadeDS Tabs (World top 10,
 * Climbing this week, Countries, On GameShuffle), the tab kept in the address as `?board=` like
 * the player page's tabs: the server reads it, so the first paint shows that tab, and switching
 * rewrites the address with history.replaceState (no reload). The game pills are links that keep
 * whichever tab is open. Panels are server-rendered nodes.
 */

import { useState, type ReactNode } from "react";
import { Tabs } from "@empac/cascadeds";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import { MMR_GAMES, MMR_GAME_IDS, type MmrGame } from "@/lib/mmr/rules";
import { EVENTS, track } from "@/lib/analytics/events";

export interface BoardTab { id: string; label: string; content: ReactNode }

export function LoungeBoards({ tabs, initial, game, scope }: {
  tabs: BoardTab[];
  initial: string;
  game: MmrGame;
  /** The On GameShuffle board's scope (friends, crew, country), kept when the game changes. */
  scope: string | null;
}) {
  const first = tabs[0]?.id ?? "";
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial : first);
  const href = (g: MmrGame) => {
    const q = new URLSearchParams();
    if (g !== "mkworld12p") q.set("game", g);
    if (active !== first) q.set("board", active);
    if (active === "gs" && scope) q.set("scope", scope);
    const s = q.toString();
    return `/lounge${s ? `?${s}` : ""}#boards`;
  };
  const select = (id: string) => {
    setActive(id);
    track(EVENTS.loungeBoardViewed, { board: id });
    const sp = new URLSearchParams(window.location.search);
    if (id === first) sp.delete("board");
    else sp.set("board", id);
    if (id !== "gs") sp.delete("scope");
    const q = sp.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
  };
  return (
    <div className="lounge-boards">
      <LabeledSubNav label="Game for the boards" variant="pills" className="lounge-games" items={MMR_GAME_IDS.map((g) => ({ label: MMR_GAMES[g].short, href: href(g), active: g === game }))} />
      <div className="lounge-tabs">
        <Tabs tabs={tabs} variant="underline" activeTab={active} onChange={select} />
      </div>
    </div>
  );
}
