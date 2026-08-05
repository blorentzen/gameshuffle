"use client";

/**
 * BingoControl — Hub community-bingo widget (Pro). The Hub is the primary mark
 * surface: a "Bingo" button expands a panel with New/Clear plus a clickable
 * grid. Clicking a square toggles it (server recomputes lines); the overlay
 * updates via the persistent bingo overlay event. Self-hides for non-Pro
 * (actions return `pro_required`).
 */

import { useEffect, useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          🅱️ Bingo{board ? ` (${board.lines} line${board.lines === 1 ? "" : "s"})` : ""}
        </Button>
        {open && (
          <>
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              aria-label="Board size"
              style={{
                height: 36,
                borderRadius: "var(--radius-8, 0.5rem)",
                border: "1px solid var(--border-default)",
                padding: "0 var(--spacing-8)",
                background: "var(--surface-default)",
                color: "var(--text-primary)",
              }}
            >
              {SIZES.map((n) => (
                <option key={n} value={n}>{n}×{n}</option>
              ))}
            </select>
            <Button variant="primary" loading={pending} onClick={createBoard}>
              {board ? "New board" : "Start board"}
            </Button>
            {board && (
              <Button variant="ghost" onClick={clear} disabled={pending}>
                Clear
              </Button>
            )}
          </>
        )}
      </div>

      {open && board && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${board.size}, 1fr)`,
            gap: 4,
            maxWidth: 360,
          }}
        >
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
                style={{
                  aspectRatio: "1 / 1",
                  padding: 4,
                  borderRadius: 8,
                  border: "1px solid var(--border-default)",
                  background: isMarked ? "var(--bg-primary, #7c3aed)" : "var(--surface-default)",
                  color: isMarked ? "var(--text-on-primary, #fff)" : "var(--text-primary)",
                  fontSize: 9,
                  fontWeight: 700,
                  lineHeight: 1.05,
                  cursor: isCenter ? "default" : "pointer",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {isCenter ? "★" : text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
