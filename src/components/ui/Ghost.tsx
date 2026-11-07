/**
 * Ghost frames for empty states (Britton, 2026-11-06: "ghost frames or ghost inactive, just to indicate how things
 * will look"; then: no panel floating over the ghost, the notice belongs to the ghost). An empty board, list or row of
 * cards draws the shape it will fill, faded and dashed, and its first row or card carries the notice and first step,
 * so there's one layer, not two. Static on purpose: no shimmer, so it never reads as loading. The faded rows are
 * hidden from screen readers; the notice is the content. `dark` is for navy bands.
 */

import type { ReactNode } from "react";
import "@/styles/ghost.css";

const BAR = [62, 48, 55, 40];

function GhostRow({ i, places, value, lines }: { i: number; places: boolean; value: boolean; lines: boolean }) {
  return (
    <div className="ghost-row" aria-hidden="true">
      {places && <span className="ghost-place">{i + 1}</span>}
      <span className="ghost-face" />
      <span className="ghost-words"><span className="ghost-bar" style={{ width: `${BAR[i % 4]}%` }} />{lines && <span className="ghost-bar ghost-bar--thin" style={{ width: `${[80, 70, 76, 64][i % 4]}%` }} />}</span>
      {value && places && <span className="ghost-value" />}
    </div>
  );
}

/**
 * A ranked list's rows (a board): a place, a face, a name and a value; `lines` drops the place and value and adds a
 * second bar (a feed of posts). With `notice`, the first row is the notice: its place (or face) still shows, the
 * words and first step take the rest of the row.
 */
export function GhostRows({ count = 3, places = true, value = true, lines = false, dark = false, notice }: {
  count?: number; places?: boolean; value?: boolean; lines?: boolean; dark?: boolean; notice?: ReactNode;
}) {
  return (
    <div className={`ghost ghost-rows${lines ? " ghost-rows--lines" : ""}${!lines && !places ? " ghost-rows--noplace" : ""}${dark ? " ghost--dark" : ""}`}>
      {notice ? (
        <div className="ghost-row ghost-row--notice">
          {places && <span className="ghost-place" aria-hidden="true">1</span>}
          <span className="ghost-face" aria-hidden="true" />
          <div className="ghost-notice">{notice}</div>
        </div>
      ) : null}
      {Array.from({ length: notice ? count - 1 : count }, (_, k) => {
        const i = notice ? k + 1 : k;
        return <GhostRow key={i} i={i} places={places} value={value} lines={lines} />;
      })}
    </div>
  );
}

/** A row of cards (events): dashed frames with the lines a card's foot carries; with `notice`, the first card holds it. */
export function GhostCards({ count = 3, dark = false, notice }: { count?: number; dark?: boolean; notice?: ReactNode }) {
  return (
    <div className={`ghost ghost-cards${dark ? " ghost--dark" : ""}`}>
      {notice ? <div className="ghost-card ghost-card--notice"><div className="ghost-notice">{notice}</div></div> : null}
      {Array.from({ length: notice ? count - 1 : count }, (_, i) => (
        <span key={i} className="ghost-card" aria-hidden="true"><span className="ghost-bar ghost-bar--thin" style={{ width: "40%" }} /><span className="ghost-bar" style={{ width: `${[70, 60, 66][i % 3]}%` }} /></span>
      ))}
    </div>
  );
}

/** One dashed card holding a notice: the open slot at the end of a short row of cards (fewer events than the row fits). */
export function GhostCard({ dark = false, children }: { dark?: boolean; children: ReactNode }) {
  return <div className={`ghost ghost-card ghost-card--notice ghost-card--slot${dark ? " ghost--dark" : ""}`}><div className="ghost-notice">{children}</div></div>;
}

/** A roll's frame: the picture, then its parts; with `notice`, the notice sits where the roll's name would. */
export function GhostRoll({ dark = false, notice }: { dark?: boolean; notice?: ReactNode }) {
  return (
    <div className={`ghost ghost-roll${dark ? " ghost--dark" : ""}`}>
      <span className="ghost-roll__art" aria-hidden="true" />
      <span className="ghost-roll__parts">
        {notice ? <div className="ghost-notice">{notice}</div> : <span className="ghost-bar" style={{ width: "50%" }} aria-hidden="true" />}
        {[0, 1, 2].map((i) => <span key={i} className="ghost-roll__part" aria-hidden="true"><span className="ghost-roll__thumb" /><span className="ghost-bar" style={{ width: `${[45, 38, 42][i]}%` }} /></span>)}
      </span>
    </div>
  );
}

/** A stack of faces, dashed, where the people who did it will show. */
export function GhostFaces({ count = 3, dark = false }: { count?: number; dark?: boolean }) {
  return <span className={`ghost ghost-faces${dark ? " ghost--dark" : ""}`} aria-hidden="true">{Array.from({ length: count }, (_, i) => <span key={i} className="ghost-face" />)}</span>;
}
