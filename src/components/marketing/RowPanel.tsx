import type { ReactNode } from "react";
import Link from "next/link";
import type { Icon } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";

/**
 * One surface with a row per thing, thin lines between rows and three across
 * on wide screens (the containers rule, Britton's picks 2026-10-19,
 * https://claude.ai/artifact/QaSjiFxbYHkNBAQq53xvpq). Replaces a row of
 * outlined cards where each card only held an icon, two lines and a button:
 * the homepage's Run the night and Pokémon sections, and the rows of
 * PlansPanel. The icon tile is the shared IconTile, beside the text at every
 * width (design round 3, 2026-10-20: it used to flip above at 900px).
 * Server-safe.
 */
export type RowTone = "blue" | "violet" | "green" | "teal" | "magenta" | "orange" | "red";

export interface PanelRow {
  key: string;
  Icon: Icon;
  tone?: RowTone;
  /** A small label over the name: one short label ("GS Pro"), never two joined with " · ". */
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
          <IconTile icon={r.Icon} tone={r.tone ?? "blue"} className="row-panel__tile" />
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

/** A row's text link ("Start a tournament", with the shared arrow), tagged for analytics when given a class. */
export function RowLink({ href, children, className, external }: { href: string; children: ReactNode; className?: string; external?: boolean }) {
  return <ArrowLink href={href} external={external} className={`row-panel__link${className ? ` ${className}` : ""}`}>{children}</ArrowLink>;
}
