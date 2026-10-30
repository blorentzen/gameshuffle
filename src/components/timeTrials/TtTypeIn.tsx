"use client";

/**
 * Type them in (pasting picks 2026-10-30, 3A): every track of the game with a time box, for the items
 * setting and speed picked. Tab moves down a cup; pasting a column of times (from a spreadsheet) into a
 * box fills it and the boxes after it in track order. Your saved best shows in grey; a faster new time
 * turns blue. "Check" hands the rows to the same check table as a paste.
 */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button, Chip, Input } from "@empac/cascadeds";
import { formatTime, parseTime } from "@/lib/timeTrials/rules";
import { toCheckRows, type CheckRow } from "@/lib/timeTrials/importRows";
import type { ImportRow } from "@/lib/timeTrials/importText";
import { ITEMS, type TtItems } from "@/lib/timeTrials/categories";
import { TT_GAMES, ttCups, ttTracks, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";

export function TtTypeIn({ game, onCheck }: { game: TtGame; onCheck: (rows: CheckRow[], items: TtItems) => void }) {
  const classes = TT_GAMES[game].classes;
  const [items, setItems] = useState<TtItems>("shrooms");
  const [cc, setCc] = useState<TtClass>(classes[0]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [bests, setBests] = useState<Map<string, number>>(new Map());
  const order = useMemo(() => ttTracks(game).map((t) => t.id), [game]);

  useEffect(() => {
    let live = true;
    void fetch(`/api/time-trials/import?bests=1&game=${game}&items=${items}`).then((r) => r.json()).catch(() => null).then((j: { bests?: Record<string, number> } | null) => {
      if (live) setBests(new Map(Object.entries(j?.bests ?? {})));
    });
    return () => { live = false; };
  }, [game, items]);

  const filled = order.map((id) => ({ id, ms: vals[id] ? parseTime(vals[id]) : null })).filter((x) => vals[x.id]?.trim());
  const good = filled.filter((x) => x.ms);

  function pasteDown(start: string, text: string): boolean {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    const from = order.indexOf(start);
    setVals((v) => {
      const next = { ...v };
      lines.forEach((l, i) => { const id = order[from + i]; if (id) next[id] = l.split(/\t/).pop() ?? l; });
      return next;
    });
    return true;
  }

  function check() {
    const rows: ImportRow[] = good.map(({ id, ms }) => {
      const t = ttTracks(game).find((x) => x.id === id)!;
      return { line: `${t.name} ${vals[id]}`, game, trackId: id, trackName: t.name, trackText: null, cc, timeMs: ms, via: null };
    });
    onCheck(toCheckRows(rows, game, cc, null, bests), items);
  }

  return (
    <div className="tt-typein">
      <div className="tt-typein__bar">
        <div className="tt-add__chips" role="group" aria-label="Items">
          {ITEMS.map((i) => <Chip key={i.id} label={i.label} clickable selected={i.id === items} onClick={() => setItems(i.id)} />)}
        </div>
        {classes.length > 1 && (
          <div className="tt-add__chips" role="group" aria-label="Speed class">
            {classes.map((c) => <Chip key={c} label={`${c}cc`} clickable selected={c === cc} onClick={() => setCc(c)} />)}
          </div>
        )}
        <p className="tt-note tt-typein__hint">Tab moves down. Paste a column of times into a box and it fills down in track order.</p>
      </div>
      <div className="tt-cups">
        {ttCups(game).map((cup) => (
          <section key={cup.cup} className="tt-cupcard" aria-label={`${cup.cup}${/Mario Kart$/.test(cup.cup) ? " courses" : " Cup"}`}>
            <h3 className="tt-cupcard__head"><span>{cup.cup}{/Mario Kart$/.test(cup.cup) ? " courses" : " Cup"}</span><span className="tt-cupcard__col" aria-hidden="true">Your best</span></h3>
            <ul className="tt-cupcard__list">
              {cup.tracks.map((t) => {
                const best = bests.get(`${t.id}|${cc}`);
                const v = vals[t.id] ?? "";
                const ms = v.trim() ? parseTime(v) : null;
                const bad = !!v.trim() && !ms;
                const isNew = !!ms && (best == null || ms < best);
                return (
                  <li key={t.id} className="tt-typein__row">
                    {t.image ? <Image src={t.image} alt="" width={48} height={27} className="tt-track__pic" sizes="48px" /> : <span className="tt-track__pic tt-track__pic--blank" aria-hidden="true">{t.name.replace(/^SNES /, "").slice(0, 1)}</span>}
                    <label htmlFor={`tt-in-${t.id}`} className="tt-typein__name">{t.name}</label>
                    <Input
                      id={`tt-in-${t.id}`}
                      size="small"
                      value={v}
                      onChange={(e) => setVals((x) => ({ ...x, [t.id]: e.target.value }))}
                      onPaste={(e) => { if (pasteDown(t.id, e.clipboardData.getData("text"))) e.preventDefault(); }}
                      placeholder={best != null ? formatTime(best) : "m:ss.mmm"}
                      inputMode="decimal"
                      autoComplete="off"
                      error={bad}
                      aria-describedby={bad ? `tt-in-${t.id}-bad` : undefined}
                      className={`tt-typein__input${isNew ? " tt-typein__input--new" : ""}`}
                    />
                    {bad && <span id={`tt-in-${t.id}-bad`} className="sr-only">Type the time like 1:52.384</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="tt-add__actions">
        <Button variant="primary" onClick={check} disabled={!good.length}>Check {good.length} {good.length === 1 ? "time" : "times"}</Button>
        {filled.length > good.length && <span className="tt-note">{filled.length - good.length} {filled.length - good.length === 1 ? "box doesn't" : "boxes don't"} read as a time yet (like 1:52.384).</span>}
      </div>
    </div>
  );
}
