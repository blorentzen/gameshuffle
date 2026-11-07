/**
 * A ranked list, the same everywhere (game spaces picks 2026-11-05, 1A: one component per thing): place, a picture
 * (a person, a course tile or a division medal), a name with a line under it, the number that ranks it, and the
 * viewer's own row tinted. Rows link where they can. Boards move here as they're touched.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import "@/styles/boards.css";

export interface RankRow {
  key: string;
  place?: number | null;
  pic?: ReactNode;
  name: string;
  line?: string | null;
  value?: ReactNode;
  /** A small mark after the value ("Record", "+109"). */
  tag?: ReactNode;
  href?: string | null;
  you?: boolean;
}

export function RankList({ rows, label, numbered = true }: { rows: RankRow[]; label?: string; numbered?: boolean }) {
  return (
    <ol className={`rank-list${numbered ? "" : " rank-list--plain"}`} aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className={`rank-row${r.you ? " rank-row--you" : ""}`}>
          {numbered && <span className="rank-row__place">{r.place ?? "·"}</span>}
          {r.pic && <span className="rank-row__pic" aria-hidden="true">{r.pic}</span>}
          <span className="rank-row__text">
            {r.href ? <Link href={r.href} className="rank-row__name">{r.name}</Link> : <span className="rank-row__name">{r.name}</span>}
            {r.line && <span className="rank-row__line">{r.line}</span>}
          </span>
          {r.value != null && <span className="rank-row__value">{r.value}</span>}
          {r.tag && <span className="rank-row__tag">{r.tag}</span>}
        </li>
      ))}
    </ol>
  );
}
