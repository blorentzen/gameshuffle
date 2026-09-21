"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button, Chip, Input } from "@empac/cascadeds";
import { useLocalState } from "@/lib/game-nights/companion/useLocalState";
import { STARTER_BOARD_GAMES } from "@/data/board-game-catalog";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";

/**
 * Random game picker — settle what to play. Draws from your pool, or from the
 * popular catalog if you haven't added any. A short shuffle animation before it
 * lands. The pool is saved on the device; signed-in members can also save it to
 * their account as a board-game collection (and load it on any device).
 */
export function GamePicker() {
  const { user } = useAuth();
  const toast = useToast();
  const [games, setGames] = useLocalState<string[]>("gs-bgn-gamepicker", []);
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const rollTimer = useRef<number | null>(null);

  const mergeIn = (names: string[]) =>
    setGames((prev) => {
      const seen = new Set(prev.map((g) => g.toLowerCase()));
      const next = [...prev];
      for (const n of names) { const t = n.trim(); if (t && !seen.has(t.toLowerCase())) { next.push(t); seen.add(t.toLowerCase()); } }
      return next;
    });

  const loadCollection = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/account/board-games");
      const j = await res.json().catch(() => null);
      if (res.ok && Array.isArray(j?.games)) {
        if (j.games.length === 0) toast.success("Your saved collection is empty.");
        else { mergeIn(j.games as string[]); toast.success(`Loaded ${j.games.length} saved game${j.games.length === 1 ? "" : "s"}.`); }
      } else {
        toast.error("Couldn't load your collection.");
      }
    } catch { toast.error("Network error. Try again."); }
    setSyncing(false);
  };

  const saveCollection = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/account/board-games", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ games }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) toast.success("Collection saved to your account.");
      else toast.error(j?.error === "migration_pending" ? "Saving collections isn't enabled yet." : "Couldn't save. Try again.");
    } catch { toast.error("Network error. Try again."); }
    setSyncing(false);
  };

  const pool = games.length > 0 ? games : STARTER_BOARD_GAMES.map((g) => g.name);

  const add = () => {
    const names = input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    mergeIn(names);
    setInput("");
  };

  const pick = () => {
    if (pool.length === 0 || rolling) return;
    setRolling(true);
    let ticks = 0;
    const spin = () => {
      setPicked(pool[Math.floor(Math.random() * pool.length)]);
      ticks += 1;
      if (ticks < 12) {
        rollTimer.current = window.setTimeout(spin, 60 + ticks * 12);
      } else {
        setRolling(false);
      }
    };
    spin();
  };

  return (
    <div className="account-card">
      <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Add a game to the pool (optional)"
            aria-label="Add a game"
          />
        </div>
        <Button variant="secondary" onClick={add} disabled={!input.trim()}>Add</Button>
      </div>

      {games.length > 0 && (
        <div className="bgn-tools__roster">
          {games.map((g) => (
            <Chip key={g} label={g} removable onRemove={() => setGames((p) => p.filter((x) => x !== g))} />
          ))}
        </div>
      )}
      <p className="bgn-tools__hint" style={{ marginTop: "var(--spacing-12)" }}>
        {games.length > 0 ? `Picking from your ${games.length} game${games.length === 1 ? "" : "s"}.` : "No games added yet — picking from popular titles."}
      </p>

      {/* Collection: signed-in members save/load; signed-out get a nudge. */}
      {user ? (
        <div className="bgn-picker__collection">
          <Button variant="ghost" size="small" onClick={loadCollection} disabled={syncing}>Load my games</Button>
          <Button variant="ghost" size="small" onClick={saveCollection} disabled={syncing || games.length === 0}>Save to my account</Button>
        </div>
      ) : (
        <p className="bgn-picker__upsell">
          <Link href="/signup">Create a free account</Link> to save your game collection and load it on any device.
        </p>
      )}

      <div className="bgn-picker__stage">
        <div className={`bgn-picker__result${rolling ? " bgn-picker__result--rolling" : ""}`}>
          {picked ?? "Ready when you are"}
        </div>
        <Button variant="primary" size="large" onClick={pick} disabled={rolling || pool.length === 0}>
          {rolling ? "Picking…" : picked ? "Pick again" : "Pick a game"}
        </Button>
      </div>
    </div>
  );
}
