"use client";

/**
 * The control room's overlay tools: pick one, and only its row shows (its
 * option and buttons), instead of all eight at once (Britton, 2026-10-10).
 * The pick is remembered in this browser. Each tool is a lever row
 * (Lever.tsx) with the run buttons only; setting tools up (wheel slices,
 * 8-ball answers, bingo prompts, looks) lives in Streaming ▸ Overlay ▸ Tool
 * looks and Wheels. Each control hides itself without GS Pro.
 */

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Tabs } from "@empac/cascadeds";
import { Levers } from "./live/Lever";
import { WheelControl } from "./WheelControl";
import { DiceControl } from "./DiceControl";
import { CoinControl } from "./CoinControl";
import { OracleControl } from "./OracleControl";
import { NamePickerControl } from "./NamePickerControl";
import { TimerControl } from "./TimerControl";
import { BingoControl } from "./BingoControl";
import { TierListControl } from "./TierListControl";

const KEY = "gs-hub-tool";
const EVENT = "gs-hub-tool";

function readTool(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "wheel";
  } catch {
    return "wheel";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function chooseTool(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Private windows can refuse storage; the pick just isn't remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** `setupLink` off on a mod's page: setting tools up stays in the streamer's own Streaming settings. */
export function HubToolsRun({ slug, setupLink = true }: { slug: string; setupLink?: boolean }) {
  const stored = useSyncExternalStore(subscribe, readTool, () => "wheel");

  const tools: { id: string; label: string; control: ReactNode }[] = [
    { id: "wheel", label: "Wheel", control: <WheelControl /> },
    { id: "dice", label: "Dice", control: <DiceControl /> },
    { id: "coin", label: "Coin", control: <CoinControl /> },
    { id: "oracle", label: "8-ball", control: <OracleControl /> },
    { id: "raffle", label: "Raffle", control: <NamePickerControl slug={slug} /> },
    { id: "timer", label: "Timer", control: <TimerControl /> },
    { id: "bingo", label: "Bingo board", control: <BingoControl /> },
    { id: "tierlist", label: "Tier list", control: <TierListControl /> },
  ];
  const active = tools.some((t) => t.id === stored) ? stored : "wheel";

  return (
    <section className="hub-panel hub-toolbox" aria-labelledby="hub-tools-title">
      <div className="hub-panel__head">
        <h2 id="hub-tools-title" className="hub-panel__title">Overlay tools</h2>
        {setupLink && <Link className="hub-panel__link" href="/account/streaming?tab=stream-tools">Set them up</Link>}
      </div>
      <Tabs
        variant="pills"
        size="small"
        activeTab={active}
        onChange={chooseTool}
        tabs={tools.map((t) => ({
          id: t.id,
          label: t.label,
          content: <Levers label={t.label}>{t.control}</Levers>,
        }))}
      />
    </section>
  );
}
