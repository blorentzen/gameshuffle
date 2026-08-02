"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Textarea, Checkbox } from "@empac/cascadeds";

type Mode = "numbers" | "text";

interface Cell {
  text: string;
  free: boolean;
  marked: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffle a phrase pool into a 25-cell card, with an optional marked free center. */
function dealTextCard(pool: string[], freeSpace: string, useFree: boolean): Cell[] {
  const picks = shuffle(pool).slice(0, 25);
  const next: Cell[] = [];
  let p = 0;
  for (let i = 0; i < 25; i++) {
    if (useFree && i === 12) {
      next.push({ text: freeSpace || "FREE", free: true, marked: true });
    } else {
      next.push({ text: picks[p++], free: false, marked: false });
    }
  }
  return next;
}

/** Classic 75-ball number card: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75. */
function dealNumberCard(useFree: boolean): Cell[] {
  const cols = Array.from({ length: 5 }, (_, c) => {
    const start = c * 15 + 1;
    const range = Array.from({ length: 15 }, (_, k) => start + k);
    return shuffle(range).slice(0, 5);
  });
  const next: Cell[] = [];
  for (let i = 0; i < 25; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    if (useFree && i === 12) {
      next.push({ text: "FREE", free: true, marked: true });
    } else {
      next.push({ text: String(cols[col][row]), free: false, marked: false });
    }
  }
  return next;
}

export function BingoCardTool({
  storageKey = "gs-bingo",
  seedSquares,
  seedFreeSpace = "FREE",
  defaultTitle = "Bingo",
}: {
  /** Per-board localStorage key (templates get their own). */
  storageKey?: string;
  /** Squares to pre-load into the pool (a template). Absent = classic number card. */
  seedSquares?: string[];
  seedFreeSpace?: string;
  defaultTitle?: string;
} = {}) {
  const seeded = !!seedSquares?.length;
  const [mode, setMode] = useState<Mode>(seeded ? "text" : "numbers");
  const [title, setTitle] = useState(defaultTitle);
  const [pool, setPool] = useState("");
  const [freeSpace, setFreeSpace] = useState(seedFreeSpace);
  const [useFree, setUseFree] = useState(true);
  const [cells, setCells] = useState<Cell[]>([]);
  const firstPersist = useRef(true);

  // Load saved state, or seed + auto-deal so the page never lands on a bare form.
  useEffect(() => {
    firstPersist.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const d = JSON.parse(raw) as {
          mode?: Mode;
          title?: string;
          pool?: string;
          freeSpace?: string;
          useFree?: boolean;
          cells?: Cell[];
        };
        const m: Mode = d.mode ?? (d.pool ? "text" : "numbers");
        const wantFree = d.useFree !== false;
        setMode(m);
        if (d.title) setTitle(d.title);
        setUseFree(wantFree);
        if (d.freeSpace) setFreeSpace(d.freeSpace);
        if (d.pool) setPool(d.pool);
        if (d.cells?.length) {
          setCells(d.cells);
        } else if (m === "numbers") {
          setCells(dealNumberCard(wantFree));
        } else {
          const savedSquares = (d.pool ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
          if (savedSquares.length >= (wantFree ? 24 : 25)) {
            setCells(dealTextCard(savedSquares, d.freeSpace ?? seedFreeSpace, wantFree));
          }
        }
        return;
      }
    } catch {
      // ignore corrupt storage
    }
    // No saved state: template → deal its pool; blank → deal a classic number card.
    if (seeded) {
      setPool(seedSquares!.join("\n"));
      setCells(dealTextCard(seedSquares!, seedFreeSpace, true));
    } else {
      setCells(dealNumberCard(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ mode, title, pool, freeSpace, useFree, cells }));
    } catch {
      // storage blocked or full — no-op
    }
  }, [storageKey, mode, title, pool, freeSpace, useFree, cells]);

  const squares = pool.split("\n").map((s) => s.trim()).filter(Boolean);
  const needed = useFree ? 24 : 25;
  const enough = mode === "numbers" || squares.length >= needed;

  function generate() {
    if (!enough) return;
    setCells(mode === "numbers" ? dealNumberCard(useFree) : dealTextCard(squares, freeSpace, useFree));
  }

  function toggleCell(i: number) {
    setCells((c) => c.map((cell, idx) => (idx === i && !cell.free ? { ...cell, marked: !cell.marked } : cell)));
  }

  return (
    <div className="tool-panel bingo-tool">
      <div className="bingo-tool__modes" role="tablist" aria-label="Card type">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "numbers"}
          className={`bingo-tool__mode${mode === "numbers" ? " is-active" : ""}`}
          onClick={() => setMode("numbers")}
        >
          Number card
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "text"}
          className={`bingo-tool__mode${mode === "text" ? " is-active" : ""}`}
          onClick={() => setMode("text")}
        >
          Custom words
        </button>
      </div>

      <Input floatingLabel="Card title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />

      {mode === "text" && (
        <Textarea
          floatingLabel="Squares (one per line — 24+ for a full card)"
          value={pool}
          onChange={(e) => setPool(e.target.value)}
          rows={6}
          fullWidth
        />
      )}

      <div className="bingo-tool__opts">
        <Checkbox label="Free center space" checked={useFree} onChange={(e) => setUseFree(e.target.checked)} />
        {useFree && mode === "text" && (
          <Input
            floatingLabel="Free space label"
            value={freeSpace}
            onChange={(e) => setFreeSpace(e.target.value)}
          />
        )}
      </div>

      <div className="bingo-tool__actions">
        <Button variant="primary" onClick={generate} disabled={!enough}>
          {cells.length ? "New card" : "Generate card"}
        </Button>
        {cells.length > 0 && (
          <Button variant="secondary" onClick={() => window.print()}>
            Print / save
          </Button>
        )}
      </div>

      {mode === "text" && (
        <p className="bingo-tool__note">
          {squares.length} {squares.length === 1 ? "square" : "squares"}
          {!enough && ` — add ${needed - squares.length} more for a full card`}
        </p>
      )}

      {cells.length > 0 && (
        <div className={`bingo-card${mode === "numbers" ? " bingo-card--numbers" : ""}`} aria-label={`${title} bingo card`}>
          {title && <div className="bingo-card__title">{title}</div>}
          <div className="bingo-card__header" aria-hidden="true">
            {["B", "I", "N", "G", "O"].map((letter) => (
              <span key={letter} className="bingo-card__letter">
                {letter}
              </span>
            ))}
          </div>
          <div className="bingo-card__grid">
            {cells.map((cell, i) => (
              <button
                key={i}
                type="button"
                className={`bingo-cell${cell.free ? " bingo-cell--free" : ""}${cell.marked ? " is-marked" : ""}`}
                onClick={() => toggleCell(i)}
                aria-pressed={cell.marked}
              >
                <span className="bingo-cell__text">{cell.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
