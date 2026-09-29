"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Select } from "@empac/cascadeds";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";

/**
 * Chaos Cup (a GameShuffle Original): a Mario Kart cup where every race gets a
 * modifier. Before each race the host rolls three (an item rule, a race
 * setting, a handicap for the leader) and chat votes, or the host picks.
 */

const GAMES = [
  { value: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe" },
  { value: "mario-kart-world", label: "Mario Kart World" },
];

export function ChaosCupBuilder() {
  const { players: roster } = useRoster();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [game, setGame] = useState(GAMES[0].value);
  const [races, setRaces] = useState("4");
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    const n = Number(races);
    const r = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: game, lineup: Array.from({ length: n - 1 }, () => game), config: { format: "chaoscup" }, visibility: "secret",
        seats: roster.slice(0, 8).map((p) => ({ name: p.name, isCpu: false, character: null })), hostSeat: null,
      }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStarting(false);
    if (!r?.ok || !j.code) { toast.error("Couldn't start the Chaos Cup. Please try again."); return; }
    router.push(`/party/${j.code}`);
  };

  return (
    <div className="account-card oddone-tool">
      <div className="party-row">
        <Select floatingLabel="Game" value={game} onChange={(v) => setGame(String(v))} options={GAMES} />
        <Select floatingLabel="Races" value={races} onChange={(v) => setRaces(String(v))} options={["2", "3", "4", "6", "8"].map((n) => ({ value: n, label: `${n} races` }))} />
      </div>
      <p className="bgn-tools__hint">Before every race you roll three modifiers: an item rule (shells only, no items), a race setting (Mirror, 200cc, random picks) and a handicap for whoever&apos;s leading the cup. Pick one, or let your chat vote on it. Every race pays 10, 6, 3 and 1; most points wins the cup.</p>
      <div className="oddone-tool__phones">
        <p className="bgn-tools__hint">Players come from the roster above ({roster.length}). Streaming? Chat votes use your GameShuffle community and show on your overlay like any poll.</p>
        {user
          ? <Button variant="primary" disabled={starting || roster.length < 2} onClick={start}>{roster.length < 2 ? "Add at least 2 players above" : "Start the Chaos Cup"}</Button>
          : <Link href={`/signup?redirect=${encodeURIComponent("/game-nights/tools/chaos-cup")}`}>Create a free account to host a Chaos Cup</Link>}
      </div>
    </div>
  );
}
