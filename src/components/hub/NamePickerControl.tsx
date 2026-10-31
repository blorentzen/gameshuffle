"use client";

/**
 * NamePickerControl — Hub raffle widget (Pro). Viewers join with !enter; the
 * streamer can also add/remove entrants by hand ("Manage entries"), then draws
 * N winners (reveal animates on the overlay) and can clear the pool for a fresh
 * giveaway. Session-scoped. Self-hides for non-Pro (actions return `pro_required`).
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button, Checkbox, Chip, Input, Select } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadEntries sets state after its server action resolves
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
    <Lever
      label="Raffle"
      hint={entries != null ? `${entries} ${entries === 1 ? "entry" : "entries"}` : undefined}
      option={
        <Select
          size="small"
          aria-label="Number of winners"
          value={String(count)}
          onChange={(v) => setCount(Number(v))}
          options={COUNTS.map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "winner" : "winners"}` }))}
        />
      }
      actions={
        <>
          <Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={draw}>Draw {count === 1 ? "a winner" : "winners"}</Button>
          <Checkbox size="small" label="Remove winners" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
          <Button variant="ghost" size="small" onClick={() => setManage((m) => !m)} disabled={pending}>{manage ? "Done" : "Entries"}</Button>
          <Button variant="ghost" size="small" onClick={clear} disabled={pending || !entries}>Clear</Button>
        </>
      }
      status={result ? <strong>{result}</strong> : null}
    >
      {manage && (
        <div className="hub-lever__panel">
          <div className="hub-lever__add">
            <Input
              size="small"
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 80))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEntry();
                }
              }}
              placeholder="Add someone by name"
              aria-label="Add an entrant"
              fullWidth
            />
            <Button variant="secondary" size="small" onClick={addEntry} disabled={pending || !newName.trim()}>Add</Button>
          </div>
          {entryList.length === 0 ? (
            <p className="hub-lever__note">No entries yet. Viewers enter with <code>!enter</code>, or add them here.</p>
          ) : (
            <div className="hub-lever__chips">
              {entryList.map((en) => (
                <Chip key={en.id} size="small" label={en.displayName} removable disabled={pending} onRemove={() => removeEntry(en.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </Lever>
  );
}
