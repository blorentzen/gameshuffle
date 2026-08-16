"use client";

/**
 * NamePickerControl — Hub raffle widget (Pro). Viewers join with !enter; the
 * streamer can also add/remove entrants by hand ("Manage entries"), then draws
 * N winners (reveal animates on the overlay) and can clear the pool for a fresh
 * giveaway. Session-scoped. Self-hides for non-Pro (actions return `pro_required`).
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button, Input } from "@empac/cascadeds";
import {
  clearRaffleAction,
  drawRaffleAction,
  raffleEntryCountAction,
  addRaffleEntryAction,
  listRaffleEntriesAction,
  removeRaffleEntryAction,
} from "@/app/hub/sessions/[slug]/actions";

const COUNTS = [1, 2, 3, 5, 10];

export function NamePickerControl({ slug }: { slug: string }) {
  const [count, setCount] = useState(1);
  const [remove, setRemove] = useState(true);
  const [entries, setEntries] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  const [manage, setManage] = useState(false);
  const [newName, setNewName] = useState("");
  const [entryList, setEntryList] = useState<{ id: string; displayName: string }[]>([]);

  const loadEntries = useCallback(async () => {
    const res = await listRaffleEntriesAction(slug);
    if (res.ok) {
      setEntryList(res.entries);
      setEntries(res.entries.length);
    } else if (res.error === "pro_required") {
      setHidden(true);
    }
  }, [slug]);

  // Poll the entrant count so the streamer can see the pool grow.
  useEffect(() => {
    if (hidden) return;
    let alive = true;
    const load = async () => {
      const res = await raffleEntryCountAction(slug);
      if (!alive) return;
      if (res.ok) setEntries(res.count);
      else if (res.error === "pro_required") setHidden(true);
    };
    void load();
    const id = window.setInterval(load, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [slug, hidden]);

  // Keep the manage list fresh while it's open.
  useEffect(() => {
    if (!manage) return;
    void loadEntries();
    const id = window.setInterval(() => void loadEntries(), 8000);
    return () => window.clearInterval(id);
  }, [manage, loadEntries]);

  if (hidden) return null;

  const draw = () => {
    setResult(null);
    startTransition(async () => {
      const res = await drawRaffleAction(slug, count, remove);
      if (res.ok) {
        setResult(res.winners && res.winners.length ? `🎉 ${res.winners.join(", ")}` : "No entries yet");
        if (manage) void loadEntries();
        else setEntries((e) => (res.entries != null ? Math.max(0, res.entries - (remove ? (res.winners?.length ?? 0) : 0)) : e));
        window.setTimeout(() => setResult(null), 8000);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  const clear = () => {
    startTransition(async () => {
      const res = await clearRaffleAction(slug);
      if (res.ok) {
        setEntries(0);
        setEntryList([]);
        setResult(null);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  const addEntry = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    startTransition(async () => {
      const res = await addRaffleEntryAction(slug, name);
      if (res.ok) void loadEntries();
      else if (res.error === "pro_required") setHidden(true);
    });
  };

  const removeEntry = (id: string) => {
    startTransition(async () => {
      const res = await removeRaffleEntryAction(slug, id);
      if (res.ok) void loadEntries();
      else if (res.error === "pro_required") setHidden(true);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="Number of winners"
          style={{
            height: 36,
            borderRadius: "var(--radius-8, 0.5rem)",
            border: "1px solid var(--border-default)",
            padding: "0 var(--spacing-8)",
            background: "var(--surface-default)",
            color: "var(--text-primary)",
          }}
        >
          {COUNTS.map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "winner" : "winners"}
            </option>
          ))}
        </select>
        <Button variant="primary" loading={pending} onClick={draw}>
          🎟️ Draw{entries != null ? ` (${entries})` : ""}
        </Button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-14)" }}>
          <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
          Remove winners
        </label>
        <Button variant="ghost" onClick={() => setManage((m) => !m)} disabled={pending}>
          {manage ? "Done" : "Manage entries"}
        </Button>
        <Button variant="ghost" onClick={clear} disabled={pending || !entries}>
          Clear
        </Button>
        {result ? <span style={{ fontWeight: "var(--font-weight-semibold)" }}>{result}</span> : null}
      </div>

      {manage && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)", maxWidth: 420 }}>
          <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 80))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEntry();
                }
              }}
              placeholder="Add an entrant by name…"
              fullWidth
            />
            <Button variant="secondary" onClick={addEntry} disabled={pending || !newName.trim()}>
              Add
            </Button>
          </div>
          {entryList.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
              No entrants yet. Viewers join with <strong>!enter</strong>, or add them here.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {entryList.map((en) => (
                <span
                  key={en.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-default)",
                    fontSize: "var(--font-size-14)",
                  }}
                >
                  {en.displayName}
                  <button
                    type="button"
                    aria-label={`Remove ${en.displayName}`}
                    onClick={() => removeEntry(en.id)}
                    disabled={pending}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-secondary)", lineHeight: 1, fontSize: 16 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
