/**
 * A section of trainers as tiles: the round picture, the name, their title, the team on the tile and
 * your stars this month. Each tile links to the trainer's page. `badges` (by tile href) adds a Gym Leader's
 * type and badge, server-rendered, so the tiles carry the region's leaders in badge order for search too.
 */

import Link from "next/link";
import type { RoadSectionView } from "@/lib/originals/duel/roadPages";
import { TrainerArt } from "../TrainerArt";
import { RoadTileStars } from "./RoadTileStars";

export function RoadSection({ section, headingLevel = 2, badges }: { section: RoadSectionView; headingLevel?: 2 | 3; badges?: Map<string, { type: string; badge: string }> }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const id = `road-${section.tier}`;
  return (
    <section className="road-section" aria-labelledby={id}>
      <H id={id} className="road-section__title">{section.label}</H>
      <ul className="road-tiles">
        {section.tiles.map((t) => (
          <li key={t.slug}>
            <Link href={t.href} className="road-tile">
              <span className="road-tile__face">{t.picture ? <TrainerArt picture={t.picture} shape="round" /> : <span className="road-tile__initial" aria-hidden="true">{t.name.charAt(0)}</span>}</span>
              <span className="road-tile__name">{t.name}</span>
              <span className="road-tile__title">{t.title}</span>
              {/* Type and badge on lines of their own, so a card never wraps one into the other (Britton, 2026-11-05). */}
              {badges?.has(t.href) && <span className="road-tile__badge"><span>{`${badges.get(t.href)!.type} type`}</span><span>{badges.get(t.href)!.badge}</span></span>}
              <span className="road-tile__team">{t.species.join(", ")}</span>
              {t.games > 1 && <span className="road-tile__games">{t.games} teams</span>}
              <RoadTileStars teamIds={t.teamIds} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
