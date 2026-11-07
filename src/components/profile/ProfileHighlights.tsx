/**
 * A profile's Highlights (context + rooms picks 2026-11-05, 7A): rings for what they're proud of, the automatic ones
 * until the owner pins their own. A ring is the thing's own picture (a course, a division medal) or our glyph in the
 * thing's own color (a daily's streak, Trainer Road). Scrolls sideways when there are more than fit.
 */

import { IconCrown, IconFlame, IconRoute, IconTrophy } from "@tabler/icons-react";
import { HighlightsPicker } from "./HighlightsPicker";
import { MedalCredit } from "@/components/mmr/MedalCredit";
import type { Highlight, HighlightIcon } from "@/lib/profile/highlights";

const GLYPH: Record<HighlightIcon, typeof IconTrophy> = { trophy: IconTrophy, flame: IconFlame, route: IconRoute, crown: IconCrown };

export function ProfileHighlights({ items, options, pinned, owner, creditMedal }: {
  items: Highlight[];
  /** Everything they could pin (the owner's picker). */
  options: Highlight[];
  pinned: string[] | null;
  owner: boolean;
  /** A division medal shows here and the MMR tile (which credits it) doesn't. */
  creditMedal: boolean;
}) {
  if (!items.length && !(owner && options.length)) return null;
  return (
    <section className="pf-hl" aria-labelledby="pf-hl-title">
      <div className="pf-hl__head">
        <h2 id="pf-hl-title" className="pf-section-title">Highlights</h2>
        {owner && options.length > 0 && <HighlightsPicker options={options.map((o) => ({ id: o.id, label: o.label }))} pinned={pinned} />}
      </div>
      {items.length > 0 ? (
        <ul className="pf-hl__list">
          {items.map((h) => {
            const Glyph = h.art.kind === "glyph" ? GLYPH[h.art.icon] : null;
            return (
              <li key={h.id}>
                <a href={h.href} className="pf-hl__item">
                  <span className="pf-hl__ring" aria-hidden="true">
                    <span className={`pf-hl__face${h.art.kind === "glyph" ? ` pf-hl__face--${h.art.tone}` : h.art.fit === "medal" ? " pf-hl__face--medal" : ""}`}>
                      {h.art.kind === "img"
                        // eslint-disable-next-line @next/next/no-img-element -- our course art or a division medal (small files)
                        ? <img src={h.art.src} alt="" loading="lazy" className={`pf-hl__img pf-hl__img--${h.art.fit}`} />
                        : Glyph && <Glyph size={32} stroke={1.8} />}
                    </span>
                  </span>
                  <span className="pf-hl__label">{h.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pf-hl__none">Nothing pinned. Pick what shows here.</p>
      )}
      {creditMedal && <MedalCredit className="pf-hl__credit" />}
    </section>
  );
}
