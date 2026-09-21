"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Chip, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

/**
 * "My board games" — the member's saved collection, managed in one place.
 * Backed by /api/account/board-games; the same list powers the Game Picker's
 * "Load my games" and the "From your collection" quick-add when hosting a night.
 * Autosaves on every change (debounced) so it stays in sync everywhere.
 */
export function BoardGamesManager() {
  const toast = useToast();
  const [games, setGames] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/board-games")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) { if (Array.isArray(j?.games)) setGames(j.games as string[]); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const persist = async (next: string[]) => {
    try {
      const res = await fetch("/api/account/board-games", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ games: next }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        if (j?.error === "migration_pending") setMigrationPending(true);
        else toast.error("Couldn't save. Try again.");
      }
    } catch { toast.error("Network error. Try again."); }
  };

  const add = () => {
    const names = input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    setGames((prev) => {
      const seen = new Set(prev.map((g) => g.toLowerCase()));
      const next = [...prev];
      for (const n of names) if (!seen.has(n.toLowerCase())) { next.push(n); seen.add(n.toLowerCase()); }
      void persist(next);
      return next;
    });
    setInput("");
  };

  const remove = (name: string) => {
    setGames((prev) => { const next = prev.filter((g) => g !== name); void persist(next); return next; });
  };

  return (
    <div className="account-mycards">
      <h2 style={{ marginBottom: "var(--spacing-8)" }}>Board Games</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-20)", maxWidth: "44rem" }}>
        The games you own or play. Your Game Picker can draw from this, and it&rsquo;s one tap to add them when you host a{" "}
        <Link href="/game-nights">game night</Link>.
      </p>

      {migrationPending && (
        <p style={{ color: "var(--warning-700, #a15c00)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-16)" }}>
          Saved collections aren&rsquo;t enabled on this environment yet.
        </p>
      )}

      <div className="account-card" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
        <div className="bgn-roster__add">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Add a game, or paste a comma-separated list"
            aria-label="Add a board game"
          />
          <Button variant="secondary" onClick={add} disabled={!input.trim()}>Add</Button>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>Loading your collection…</p>
        ) : games.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>No games yet. Add the ones you own or play most.</p>
        ) : (
          <>
            <div className="bgn-roster__chips">
              {games.map((g) => <Chip key={g} label={g} removable onRemove={() => remove(g)} />)}
            </div>
            <span style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>{games.length} game{games.length === 1 ? "" : "s"}</span>
          </>
        )}
      </div>
    </div>
  );
}
