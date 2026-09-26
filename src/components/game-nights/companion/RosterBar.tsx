"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Chip, Input } from "@empac/cascadeds";
import { useRoster, type RosterPlayer } from "@/lib/game-nights/companion/roster";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";

/**
 * Shared roster editor — the single place to add or remove the people at the
 * table. Every companion tool reads the same roster, so players added here show
 * up on every score sheet without re-adding. Rendered at the top of each tool.
 * The roster is on-device by default; signed-in members can save it to their
 * account so it travels across devices.
 */
export function RosterBar() {
  const { players, addMany, remove, clear, replace } = useRoster();
  const { user } = useAuth();
  const toast = useToast();
  const [input, setInput] = useState("");
  const [syncing, setSyncing] = useState(false);

  const submit = () => { addMany(input); setInput(""); };

  const saveRoster = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/account/board-roster", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ players }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) toast.success("Roster saved to your account.");
      else toast.error(j?.error === "migration_pending" ? "Saving rosters isn't enabled yet." : "Couldn't save. Try again.");
    } catch { toast.error("Network error. Try again."); }
    setSyncing(false);
  };

  const loadRoster = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/account/board-roster");
      const j = await res.json().catch(() => null);
      if (res.ok && Array.isArray(j?.players)) {
        if (j.players.length === 0) toast.success("Your saved roster is empty.");
        else { replace(j.players as RosterPlayer[]); toast.success(`Loaded ${j.players.length} player${j.players.length === 1 ? "" : "s"}.`); }
      } else {
        toast.error("Couldn't load your roster.");
      }
    } catch { toast.error("Network error. Try again."); }
    setSyncing(false);
  };

  return (
    <div className="account-card bgn-roster">
      <div className="bgn-roster__head">
        <h2 className="bgn-roster__title">Players</h2>
        {players.length > 0 && (
          <span className="bgn-roster__count">{players.length} at the table</span>
        )}
      </div>
      {players.length === 0 && (
        <p className="bgn-roster__empty">Add everyone at the table once, and every score sheet and tool uses the same list.</p>
      )}
      <div className="bgn-roster__add">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="Add a player, or paste a comma-separated list"
          aria-label="Add a player"
        />
        <Button variant="secondary" onClick={submit} disabled={!input.trim()}>Add</Button>
      </div>
      {players.length > 0 && (
        <div className="bgn-roster__chips">
          {players.map((p) => (
            <Chip key={p.id} label={p.name} removable onRemove={() => remove(p.id)} />
          ))}
        </div>
      )}
      <div className="bgn-roster__foot">
        {players.length > 0 && (
          <Button variant="ghost" size="small" onClick={() => { if (window.confirm("Remove everyone from the roster?")) clear(); }}>Clear all</Button>
        )}
        {user ? (
          <>
            <Button variant="ghost" size="small" onClick={loadRoster} disabled={syncing}>Load saved</Button>
            <Button variant="ghost" size="small" onClick={saveRoster} disabled={syncing || players.length === 0}>Save roster</Button>
          </>
        ) : (
          <span className="bgn-roster__upsell">
            <Link href="/signup">Free account</Link> to save your table across devices.
          </span>
        )}
      </div>
    </div>
  );
}
