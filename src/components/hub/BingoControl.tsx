"use client";

/**
 * BingoControl — Hub community-bingo widget (Pro). The Hub is the primary mark
 * surface: a "Bingo" button expands a panel with New/Clear plus a clickable
 * grid. Clicking a square toggles it (server recomputes lines); the overlay
 * updates via the persistent bingo overlay event. Self-hides for non-Pro
 * (actions return `pro_required`).
 */

import { useEffect, useState, useTransition } from "react";
import { Button, Select } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
import {
  getBingoBoardAction,
  newBingoAction,
  markBingoAction,
  clearBingoAction,
} from "@/app/hub/sessions/[slug]/actions";

interface Board {
  size: number;
  squares: string[];
  marked: number[];
  freeCenter: boolean;
  lines: number;
}

const SIZES = [3, 4, 5];

export function BingoControl() {
  const [board, setBoard] = useState<Board | null>(null);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(5);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getBingoBoardAction();
      if (!alive) return;
      if (res.ok) setBoard(res.board);
      else if (res.error === "pro_required") setHidden(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (hidden) return null;

  const createBoard = () => {
    startTransition(async () => {
      const res = await newBingoAction(size);
      if (res.ok) {
        setBoard(res.board);
        setOpen(true);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  const toggleSquare = (i: number) => {
    // Optimistic: reflect the click immediately, reconcile with server return.
    startTransition(async () => {
      const res = await markBingoAction(i + 1);
      if (res.ok && res.board) setBoard(res.board);
      else if (!res.ok && res.error === "pro_required") setHidden(true);
    });
  };

  const clear = () => {
    startTransition(async () => {
      const res = await clearBingoAction();
      if (res.ok) {
        setBoard(null);
        setOpen(false);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  const center = board && board.freeCenter && board.size % 2 === 1
    ? Math.floor((board.size * board.size) / 2)
    : -1;
  const markedSet = new Set(board?.marked ?? []);

  return (
    <Lever
      label="Bingo board"
      hint={board ? `${board.lines} ${board.lines === 1 ? "line" : "lines"} so far` : undefined}
      option={
        <Select
          size="small"
          aria-label="Board size"
          value={String(size)}
          onChange={(v) => setSize(Number(v))}
          options={SIZES.map((n) => ({ value: String(n), label: `${n}×${n}` }))}
        />
      }
      actions={
        <>
          <Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={createBoard}>{board ? "New board" : "Start a board"}</Button>
          {board && <Button variant="ghost" size="small" onClick={() => setOpen((o) => !o)}>{open ? "Hide the board" : "Mark squares"}</Button>}
          {board && <Button variant="ghost" size="small" onClick={clear} disabled={pending}>Clear</Button>}
        </>
      }
    >
      {open && board && (
        <div className="hub-lever__board" style={{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }}>
          {board.squares.map((text, i) => {
            const isCenter = i === center;
            const isMarked = isCenter || markedSet.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => !isCenter && toggleSquare(i)}
                disabled={isCenter || pending}
                title={text}
                aria-pressed={isMarked}
                className={`hub-lever__square${isMarked ? " is-marked" : ""}`}
              >
                {isCenter ? "★" : text}
              </button>
            );
          })}
        </div>
      )}
    </Lever>
  );
}
