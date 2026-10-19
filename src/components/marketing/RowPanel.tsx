import type { ReactNode } from "react";
import Link from "next/link";
import type { Icon } from "@tabler/icons-react";

/**
 * One surface with a row per thing, thin lines between rows and three across
 * on wide screens (the containers rule, Britton's picks 2026-10-19,
 * https://claude.ai/artifact/QaSjiFxbYHkNBAQq53xvpq). Replaces a row of
 * outlined cards where each card only held an icon, two lines and a button:
 * the homepage's Run the night and Pokémon sections, and the rows of
 * PlansPanel. The icon tile is a Tabler glyph on a gradient (never emoji).
 * Server-safe.
 */
export type RowTone = "blue" | "violet" | "green" | "teal" | "magenta" | "orange" | "red";

export interface PanelRow {
  key: string;
  Icon: Icon;
  tone?: RowTone;
  /** A small label over the name ("GS Pro · 14 days free"). */
  eyebrow?: ReactNode;
  title: string;
  /** Links the name; leave out when the action already goes there. */
  titleHref?: string;
  text: ReactNode;
  /** The row's button or link, under the text (the bottom of the column on wide screens). */
  action?: ReactNode;
}

export function RowPanel({ rows, className, across = true }: {
  rows: PanelRow[];
  className?: string;
  /** Side by side from 900px (two or three rows). False keeps one row per line. */
  across?: boolean;
}) {
  const wide = across && rows.length >= 2 && rows.length <= 3;
  return (
    <div className={`row-panel${wide ? " row-panel--across" : ""}${className ? ` ${className}` : ""}`}>
      {rows.map((r) => (
        <div key={r.key} className="row-panel__row">
          <span className={`row-panel__tile row-panel__tile--${r.tone ?? "blue"}`} aria-hidden><r.Icon size={20} stroke={2} /></span>
          <div className="row-panel__copy">
            {r.eyebrow && <span className="row-panel__eyebrow">{r.eyebrow}</span>}
            <h3 className="row-panel__name">{r.titleHref ? <Link href={r.titleHref}>{r.title}</Link> : r.title}</h3>
            <p className="row-panel__body">{r.text}</p>
            {r.action && <div className="row-panel__go">{r.action}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A row's text link ("Start a tournament →"), tagged for analytics when given a class. */
export function RowLink({ href, children, className, external }: { href: string; children: ReactNode; className?: string; external?: boolean }) {
  const cls = `row-panel__link${className ? ` ${className}` : ""}`;
  if (external) return <a href={href} className={cls} target="_blank" rel="noopener noreferrer">{children} <span aria-hidden>→</span></a>;
  return <Link href={href} className={cls}>{children} <span aria-hidden>→</span></Link>;
}
