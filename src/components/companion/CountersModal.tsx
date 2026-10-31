"use client";

/**
 * The counter tray: opens from a Pokémon's damage pill on the board, so
 * damage goes on in a tap or two without the full window. Players count in
 * damage counters (10 small, 50 medium, 100 large), so the tray offers those
 * tokens, shows the damage as the counters you'd have on the table, and says
 * how many more Knock it Out. Every tap is its own Undo step. A Knock Out
 * closes the tray and says so with Undo.
 */

import { useState } from "react";
import { Button, Modal } from "@empac/cascadeds";
import { useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import type { PlayerId, SlotPosition } from "@/lib/companion/types";
import { useToast } from "@/components/toast/ToastProvider";
import { CardArt, CounterToken, countersFor } from "./glyphs";
import { TablerIcon } from "./TablerIcon";

const TOKENS = [10, 50, 100] as const;
const SIZE_WORD = { 10: "Small", 50: "Medium", 100: "Large" } as const;

export function CountersModal({ isOpen, player, position, onClose }: { isOpen: boolean; player: PlayerId; position: SlotPosition; onClose: () => void }) {
  const { state, dispatch, undo } = useSession();
  const toast = useToast();
  const slot = findSlot(state, player, position);
  const [taking, setTaking] = useState(false);
  const [recent, setRecent] = useState<number[]>([]);
  if (!slot?.occupied) return null;

  const name = slot.name ?? "This Pokémon";
  const hpLeft = slot.maxHp != null ? Math.max(0, slot.maxHp - slot.damage) : null;
  const toKo = hpLeft != null ? Math.ceil(hpLeft / 10) : null;
  const tokens = countersFor(slot.damage);

  const tap = (value: number) => {
    const delta = taking ? -Math.min(value, slot.damage) : value;
    if (delta === 0) return;
    const knocksOut = !taking && slot.maxHp != null && slot.damage + delta >= slot.maxHp;
    dispatch({ type: "ADJUST_DAMAGE", player, position, delta });
    setRecent((r) => [...r.slice(-5), delta]);
    if (knocksOut) {
      onClose();
      toast.toast({ variant: "info", message: `${name} was Knocked Out.`, action: { label: "Undo", onClick: undo } });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={name}
      size="small"
      footer={
        <div className="companion-counters__footer">
          {slot.damage > 0 && (
            <Button variant="ghost" size="small" onClick={() => { dispatch({ type: "RESET_DAMAGE", player, position }); setRecent([]); }}>
              Clear all
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="companion-counters">
        <div className="companion-counters__who">
          {slot.cardImage && <CardArt src={slot.cardImage} className="companion-counters__art" />}
          <div className="companion-counters__hp">
            {hpLeft != null ? (
              <>
                <span className="companion-counters__hp-line"><TablerIcon name="heart" size="14" color="#ff8fa3" /><strong>{hpLeft}</strong> HP left</span>
                <span className="companion-counters__ko">{toKo === 0 ? "Knocked Out" : `${toKo} more counter${toKo === 1 ? "" : "s"} to Knock Out`}</span>
              </>
            ) : (
              <span className="companion-counters__ko">No HP set, so the board won&apos;t Knock it Out on its own.</span>
            )}
          </div>
        </div>

        <div className="companion-counters__total" aria-live="polite">
          <span className="companion-counters__number">{slot.damage}</span>
          <span className="companion-counters__as">
            <span className="companion-counters__label">Damage on it</span>
            <span className="companion-counters__stack" role="img" aria-label={tokens.length ? `As counters: ${tokens.join(", ")}` : "No counters"}>
              {tokens.length ? tokens.map((v, i) => <CounterToken key={i} value={v} size={v === 100 ? 20 : v === 50 ? 17 : 14} label={null} />) : <span className="companion-counters__none">No counters yet</span>}
            </span>
          </span>
        </div>

        <div className="companion-counters__mode" role="group" aria-label="Add or take off counters">
          <Button variant={taking ? "ghost" : "secondary"} size="small" aria-pressed={!taking} onClick={() => setTaking(false)}>Add counters</Button>
          <Button variant={taking ? "secondary" : "ghost"} size="small" aria-pressed={taking} disabled={slot.damage === 0 && !taking} onClick={() => setTaking(true)}>Take off</Button>
        </div>

        <div className="companion-counters__tokens">
          {TOKENS.map((v) => (
            <Button
              key={v}
              variant="ghost"
              className="companion-counters__token"
              aria-label={`${taking ? "Take off" : "Add"} ${v} damage`}
              disabled={taking && slot.damage === 0}
              onClick={() => tap(v)}
            >
              <CounterToken value={v} size={v === 100 ? 64 : v === 50 ? 56 : 48} label={`${taking ? "−" : "+"}${v}`} />
              <span className="companion-counters__token-word">{SIZE_WORD[v]}</span>
            </Button>
          ))}
        </div>

        {recent.length > 0 && (
          <p className="companion-counters__recent">
            Just now: {recent.map((d) => (d > 0 ? `+${d}` : `${d}`)).join(" ")} · each tap is one Undo
          </p>
        )}
      </div>
    </Modal>
  );
}
