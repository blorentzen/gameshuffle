"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Chip } from "@empac/cascadeds";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { SortableList } from "@/components/ui/SortableList";
import { NIGHT_GAMES, type NightGame } from "@/lib/nights/games";

/**
 * The Gauntlet (a GameShuffle Original): a multi-game decathlon on one
 * scoreboard. Pick 4 to 8 events (console games and our phone games), order
 * them, and start a live night where every event's placements add up to one
 * Gauntlet champion.
 */

export const GAUNTLET_MIN = 4;
export const GAUNTLET_MAX = 8;

export function GauntletBuilder() {
  const { players: roster } = useRoster();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [events, setEvents] = useState<NightGame[]>([]);
  const [starting, setStarting] = useState(false);

  const toggle = (g: NightGame) => setEvents((ev) => (ev.some((e) => e.slug === g.slug)
    ? ev.filter((e) => e.slug !== g.slug)
    : ev.length >= GAUNTLET_MAX ? ev : [...ev, g]));

  const surprise = () => {
    const pool = [...NIGHT_GAMES];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    setEvents(pool.slice(0, Math.min(6, pool.length)));
  };

  const start = async () => {
    setStarting(true);
    const r = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: events[0].slug, lineup: events.slice(1).map((e) => e.slug), config: { format: "gauntlet" }, visibility: "secret",
        seats: roster.slice(0, 8).map((p) => ({ name: p.name, isCpu: false, character: null })), hostSeat: null,
      }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStarting(false);
    if (!r?.ok || !j.code) { toast.error("Couldn't start the Gauntlet. Please try again."); return; }
    track(EVENTS.nightStarted, { format: "gauntlet", source: "the-gauntlet" });
    track(EVENTS.toolUsed, { tool: "the-gauntlet" });
    router.push(`/party/${j.code}`);
  };

  const ready = events.length >= GAUNTLET_MIN && roster.length >= 2;

  return (
    <div className="account-card oddone-tool">
      <p className="party-options__label">Pick {GAUNTLET_MIN} to {GAUNTLET_MAX} events</p>
      <div className="party-chips">
        {NIGHT_GAMES.map((g) => {
          const on = events.some((e) => e.slug === g.slug);
          return <Chip key={g.slug} clickable selected={on} variant={on ? "primary" : "default"} label={g.kind === "activity" ? `${g.short} (phones)` : g.short} onClick={() => toggle(g)} />;
        })}
      </div>
      <span className="party-row">
        <Button variant="ghost" size="small" onClick={surprise}>Surprise me with six</Button>
        {events.length > 0 && <Button variant="ghost" size="small" onClick={() => setEvents([])}>Clear</Button>}
      </span>

      {events.length > 0 && (
        <div className="gauntlet__order">
          <p className="party-options__label">Running order ({events.length})</p>
          <SortableList items={events} getId={(e) => e.slug} onReorder={setEvents} handleLabel={(e) => `Reorder ${e.label}`}>
            {(e, handle, i) => (
              <div className="gauntlet__row">
                {handle}
                <span className="gauntlet__num">{i + 1}</span>
                <span className="gauntlet__name">{e.label}</span>
                {e.kind === "activity" && <Badge variant="info" size="small">Phones + TV</Badge>}
              </div>
            )}
          </SortableList>
          <p className="bgn-tools__hint">On the night you can play them in this order or spin for the next event. Every event pays 10, 6, 3 and 1 points for the top four; most points is the Gauntlet champion.</p>
        </div>
      )}

      <div className="oddone-tool__phones">
        <p className="bgn-tools__hint">Players come from the roster above ({roster.length}). They join on their own phones with the room code, and the scoreboard goes on the TV.</p>
        {user
          ? <Button variant="primary" disabled={starting || !ready} onClick={start}>{events.length < GAUNTLET_MIN ? `Pick at least ${GAUNTLET_MIN} events` : roster.length < 2 ? "Add at least 2 players above" : "Start the Gauntlet"}</Button>
          : <Link href={`/signup?redirect=${encodeURIComponent("/game-nights/tools/the-gauntlet")}`}>Create a free account to host the Gauntlet</Link>}
      </div>
    </div>
  );
}
