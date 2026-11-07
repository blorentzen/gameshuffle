/**
 * Trainer Road's regions as cards (one component per thing, game spaces picks 1A): each region's name, its sections,
 * its Gym Leaders' faces and how many trainers and teams it holds, opening its page. Used by the Trainer Road hub and
 * the Pokémon space's Road tab.
 */

import Link from "next/link";
import { TrainerArt } from "@/components/originals/duel/TrainerArt";
import { ROAD_REGIONS, roadPath } from "@/lib/originals/duel/road";
import { regionView } from "@/lib/originals/duel/roadPages";
import "@/styles/trainer-road.css";

const listOf = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "");

export function RoadRegions() {
  const regions = ROAD_REGIONS.map((r) => regionView(r.slug)).filter((r): r is NonNullable<typeof r> => !!r);
  return (
    <ul className="road-regions">
      {regions.map(({ region, sections, people }) => {
        const gym = sections.find((s) => s.tier === "gym");
        const teams = people.reduce((n, p) => n + p.teams.length, 0);
        return (
          <li key={region.slug}>
            <Link href={roadPath(region.slug)} className="road-region">
              <span className="road-region__name">{region.name}</span>
              <span className="road-region__line">{listOf(sections.filter((s) => s.tier === "gym" || s.tier === "elite" || s.tier === "champion").map((s) => s.label))}</span>
              <span className="road-region__faces" aria-hidden="true">
                {(gym?.tiles ?? []).slice(0, 8).map((t) => (
                  <span key={t.slug} className="road-region__face">{t.picture ? <TrainerArt picture={t.picture} shape="round" /> : t.name.charAt(0)}</span>
                ))}
              </span>
              <span className="road-region__count">{people.length} trainers · {teams} teams</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
