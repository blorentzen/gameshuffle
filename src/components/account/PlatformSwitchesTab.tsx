"use client";

/**
 * Platform admin ▸ Switches: every platform switch the code reads (from
 * src/lib/platform/switches.ts), whether or not it has a database row yet,
 * grouped by what it affects. Each says what On and Off mean and who changed
 * it last. Admins flip them, after a confirmation; staff can see them.
 * Changes reach the site within about 30 seconds (the flags are cached).
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { SWITCHES, SWITCH_GROUPS } from "@/lib/platform/switches";

interface FlagRow { key: string; enabled: boolean; updated_at: string; updated_by?: string | null }

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export function PlatformSwitchesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Map<string, FlagRow> | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/platform-flags", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { setError(true); return; }
    setRows(new Map((d.flags as FlagRow[]).map((f) => [f.key, f])));
    setNames(d.names ?? {});
    setCanEdit(!!d.canEdit);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const flip = async (key: string, next: boolean) => {
    const def = SWITCHES.find((s) => s.key === key)!;
    const ok = await confirm({ title: `Turn ${next ? "on" : "off"} "${def.name}"?`, body: next ? def.turnOn : def.turnOff, confirmLabel: next ? "Turn on" : "Turn off" });
    if (!ok) return;
    setBusy(key);
    const r = await fetch("/api/admin/platform-flags", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, enabled: next }) }).then((res) => res.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) { toast.error(r?.error === "admins_only" ? "Only admins can change switches." : "That didn't save. Try again."); return; }
    toast.success(`${def.name}: ${next ? "on" : "off"}`);
    void load();
  };

  return (
    <div className="account-card switches">
      <h2 className="account-tab__heading">Switches</h2>
      <p className="account-tab__intro">Turn platform features on or off without a deploy. Changes reach the site within about 30 seconds.</p>
      {!canEdit && rows && <Alert variant="info">Only admins can change switches. You can see where each one stands.</Alert>}
      {error ? <Alert variant="error">Couldn&apos;t load the switches. Try again in a minute.</Alert> : !rows ? <LoadingLines label="Loading" /> : (
        SWITCH_GROUPS.map((group) => (
          <section key={group} className="switches__group" aria-labelledby={`sw-${group}`}>
            <h3 id={`sw-${group}`} className="switches__h">{group}</h3>
            <ul className="switches__list">
              {SWITCHES.filter((s) => s.group === group).map((s) => {
                const row = rows.get(s.key);
                const on = !!row?.enabled;
                const by = row?.updated_by ? names[row.updated_by] : null;
                return (
                  <li key={s.key} className="switches__row">
                    <div className="switches__text">
                      <div className="switches__name">{s.name} <Badge variant={on ? "success" : "default"} size="small">{on ? "On" : "Off"}</Badge></div>
                      <p className="switches__desc">{s.description}</p>
                      <p className="switches__meta">{row ? `Changed ${when(row.updated_at)}${by ? ` by ${by}` : ""}` : "Never changed"} · <span className="switches__key">{s.key}</span></p>
                    </div>
                    <Switch aria-label={s.name} checked={on} disabled={!canEdit || busy === s.key} onChange={(e) => void flip(s.key, e.target.checked)} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="switches__code">Set in code (changes need a deploy): Guides, and the hidden-game switches in <span className="switches__key">src/lib/games-visibility.ts</span>.</p>
    </div>
  );
}
