"use client";

/** Small pieces of the War room: team marks, faces, and the twelve places. */

import { useState } from "react";
import { tagColor } from "@/lib/wars/look";

export function TeamMark({ team, size = "md" }: { team: { tag: string; logo: string | null }; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  if (team.logo && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- a team logo through our own address, any size
    return <img className={`wrm wrm--${size}`} src={team.logo} alt="" onError={() => setFailed(true)} />;
  }
  return <span className={`wrm wrm--${size} wrm--text`} style={{ background: tagColor(team.tag) }} aria-hidden="true">{[...team.tag].slice(0, 4).join("")}</span>;
}

const FACE_COLORS = ["#c2410c", "#0f766e", "#2b52d6", "#9333ea", "#b45309", "#be185d", "#4d7c0f", "#0e7490"];
function faceColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FACE_COLORS[h % FACE_COLORS.length];
}

/** A person's initial on their own color (the same color every race). */
export function Face({ id, name, small = false }: { id: string; name: string; small?: boolean }) {
  return <span className={`wr-face${small ? " wr-face--sm" : ""}`} style={{ background: faceColor(id) }} aria-hidden="true">{[...name.trim()][0]?.toUpperCase() ?? "?"}</span>;
}

export const placeName = (p: number) => `${p}${p % 10 === 1 && p !== 11 ? "st" : p % 10 === 2 && p !== 12 ? "nd" : p % 10 === 3 && p !== 13 ? "rd" : "th"}`;

/**
 * The room's places as toggle buttons (aria-pressed): 12 for 6v6, fewer in a smaller room. CascadeDS has no toggle grid (on its fix list), so these are plain
 * buttons, like the bingo boards. `people` shows who tapped each place; `picked` marks the places chosen in a form.
 */
export function PlaceGrid({ people = {}, picked, mine = null, clashes = [], onPick, label, disabled = false, room = 12 }: {
  /** Players in the room. */
  room?: number;
  people?: Record<number, { id: string; name: string }[]>;
  picked?: number[];
  mine?: number | null;
  clashes?: number[];
  onPick: (place: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    // Rows that come out even: 8 places in two rows of 4, 10 in two of 5, else rows of 6.
    <div className="wr-places" role="group" aria-label={label} style={{ "--wr-cols": String(room <= 6 ? room : room === 8 ? 4 : room === 10 ? 5 : 6) } as React.CSSProperties}>
      {Array.from({ length: room }, (_, i) => {
        const p = i + 1;
        const who = people[p] ?? [];
        const on = picked ? picked.includes(p) : who.length > 0;
        const clash = clashes.includes(p);
        const isMine = mine === p;
        const names = who.map((w) => w.name).join(" and ");
        const aria = `${placeName(p)}${names ? `, ${names}` : ""}${clash ? ", tapped twice" : ""}${isMine ? ", your place" : ""}`;
        return (
          <button
            key={p}
            type="button"
            className={`wr-place${on ? " is-on" : ""}${clash ? " is-clash" : ""}${isMine ? " is-mine" : ""}`}
            aria-pressed={picked ? on : isMine}
            aria-label={aria}
            disabled={disabled}
            onClick={() => onPick(p)}
          >
            <b>{p}</b>
            {who.length > 0 && (
              <span className="wr-place__who">
                <span className="wr-place__faces">{who.slice(0, 3).map((w) => <Face key={w.id} id={w.id} name={w.name} small />)}</span>
                {who.length === 1 && <small>{who[0].name}</small>}
              </span>
            )}
            {isMine && <span className="wr-place__you" aria-hidden="true">You</span>}
          </button>
        );
      })}
    </div>
  );
}
