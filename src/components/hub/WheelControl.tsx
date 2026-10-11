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
import { Button, Select } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
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
      <Lever
        label="Wheel"
        hint="No wheels yet"
        actions={
          <Link href="/account/streaming?tab=wheels" className="hub-detail__header-link-action">
            <Button variant="secondary" size="small" className="hub-lever__main">Set up a wheel</Button>
          </Link>
        }
      />
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
    <Lever
      label="Wheel"
      hint={entryCount > 0 ? `${entryCount} from chat` : undefined}
      option={
        wheels.length > 1 ? (
          <Select
            size="small"
            aria-label="Wheel to spin"
            value={selected}
            onChange={(v) => setSelected(String(v))}
            options={wheels.map((w) => ({ value: w.id, label: w.name }))}
          />
        ) : (
          <span className="hub-lever__fixed">{wheels[0].name}</span>
        )
      }
      actions={
        <>
          <Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={spin}>Spin the wheel</Button>
          {entryCount > 0 && <Button variant="ghost" size="small" disabled={pending} onClick={clear}>Clear entries</Button>}
        </>
      }
      status={result ? <>Landed on <strong>{result}</strong></> : null}
    />
  );
}
