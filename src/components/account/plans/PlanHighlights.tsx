"use client";

/**
 * The "what you actually get" blocks on the Plans tab.
 *
 * Deliberately more verbose than the old six-label checklist: each feature gets
 * a sentence explaining what it does. Someone on this tab is deciding whether to
 * pay, and "Picks & bans modules" does not tell them anything they can weigh.
 */

import type { HighlightGroup, LimitRow } from "@/lib/plans/highlights";

export function HighlightGroups({ groups }: { groups: HighlightGroup[] }) {
  return (
    <div className="plan-highlights">
      {groups.map((g) => (
        <section key={g.group} className="plan-highlights__group">
          <h4 className="plan-highlights__title">{g.group}</h4>
          <ul className="plan-highlights__list">
            {g.items.map((item) => (
              <li key={item.label} className="plan-highlights__item">
                <span className="plan-highlights__check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 14 14" focusable="false">
                    <path d="M2.5 7.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>
                  <strong className="plan-highlights__label">{item.label}</strong>
                  <span className="plan-highlights__detail">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Free vs Pro on the numbers. A caps table answers "am I actually hitting a
 * wall?", which the feature list cannot.
 */
export function LimitsTable({ rows, currentIsFree }: { rows: LimitRow[]; currentIsFree: boolean }) {
  return (
    <div className="plan-limits">
      <div className="plan-limits__row plan-limits__row--head">
        <span />
        <span className={currentIsFree ? "plan-limits__col is-current" : "plan-limits__col"}>
          Free{currentIsFree ? " · you" : ""}
        </span>
        <span className="plan-limits__col plan-limits__col--pro">Pro</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="plan-limits__row">
          <span className="plan-limits__label">{r.label}</span>
          <span className="plan-limits__col">{r.free}</span>
          <span className="plan-limits__col plan-limits__col--pro">{r.pro}</span>
        </div>
      ))}
    </div>
  );
}
