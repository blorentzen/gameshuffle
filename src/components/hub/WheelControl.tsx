"use client";

/**
 * WheelControl — Hub "Spin the wheel" button (Pro).
 *
 * Loads the streamer's wheels, lets them pick one (when they have more than
 * one), and spins via the `spinWheelAction` server action. The result lands
 * on the overlay; we also surface the winning label inline for quick
 * feedback. Renders nothing for non-Pro / no-wheels-yet beyond a setup link.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import {
  clearWheelEntriesAction,
  spinWheelAction,
  wheelEntryCountAction,
} from "@/app/hub/sessions/[slug]/actions";
import type { Wheel } from "@/lib/wheels/types";

export function WheelControl() {
  const [wheels, setWheels] = useState<Wheel[] | null>(null);
  const [proRequired, setProRequired] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [result, setResult] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [pending, startTransition] = useTransition();

  const refreshCount = useCallback(async (wheelId: string) => {
    const res = await wheelEntryCountAction(wheelId || undefined);
    if (res.ok) setEntryCount(res.count);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/wheels", { cache: "no-store" });
        if (!alive) return;
        if (res.status === 403) {
          setProRequired(true);
          setWheels([]);
          return;
        }
        if (!res.ok) {
          setWheels([]);
          return;
        }
        const body = (await res.json()) as { wheels: Wheel[] };
        setWheels(body.wheels);
        const def = body.wheels.find((w) => w.isDefault) ?? body.wheels[0];
        if (def) setSelected(def.id);
      } catch {
        if (alive) setWheels([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Keep the chat-entry count in sync with the selected wheel.
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    (async () => {
      const res = await wheelEntryCountAction(selected);
      if (alive && res.ok) setEntryCount(res.count);
    })();
    return () => {
      alive = false;
    };
  }, [selected]);

  if (wheels === null || proRequired) return null; // loading / non-Pro

  if (wheels.length === 0) {
    return (
      <Link href="/account?tab=wheels" className="hub-detail__header-link-action">
        <Button variant="secondary">Set up a wheel</Button>
      </Link>
    );
  }

  const spin = () => {
    setResult(null);
    startTransition(async () => {
      const res = await spinWheelAction(selected || undefined);
      if (res.ok && res.winningLabel) {
        setResult(res.winningLabel);
        window.setTimeout(() => setResult(null), 6000);
      }
      void refreshCount(selected);
    });
  };

  const clear = () => {
    startTransition(async () => {
      const res = await clearWheelEntriesAction(selected || undefined);
      if (res.ok) setEntryCount(0);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
      {wheels.length > 1 ? (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Wheel to spin"
          style={{
            height: 36,
            borderRadius: "var(--radius-8, 0.5rem)",
            border: "1px solid var(--border-default)",
            padding: "0 var(--spacing-8)",
            background: "var(--surface-default)",
            color: "var(--text-primary)",
          }}
        >
          {wheels.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      ) : null}
      <Button variant="primary" loading={pending} onClick={spin}>
        🎡 Spin wheel
      </Button>
      {entryCount > 0 ? (
        <>
          <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>
            {entryCount} from chat
          </span>
          <Button variant="ghost" size="small" loading={pending} onClick={clear}>
            Clear
          </Button>
        </>
      ) : null}
      {result ? (
        <span style={{ fontWeight: "var(--font-weight-semibold)" }}>→ {result}</span>
      ) : null}
    </div>
  );
}
