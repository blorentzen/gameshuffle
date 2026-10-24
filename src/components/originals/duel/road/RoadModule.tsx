"use client";

/**
 * Trainer Road as its own module on the Daily Duel page (Britton's picks, 2026-10-24,
 * https://claude.ai/artifact/8W2gSfoiW5PFHXnxVd7bG5): "Battle more trainers on the road", above the
 * Duel's questions before you play and after. Signed out: the Gym Leaders of today's trainer's region,
 * how big the road is, and a way in through today's trainer. Signed in with a road under way: the
 * next trainer on your path, one tap away. Two actions at most. Loads in the browser, because the
 * Daily Duel page is built ahead.
 */

import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { IconSwords } from "@tabler/icons-react";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { useChallenger } from "@/components/originals/duel/DuelChallenger";
import { TrainerArt } from "@/components/originals/duel/TrainerArt";
import { useRoadPath } from "./RoadPath";
import { RoadEncounterCard } from "./RoadEncounter";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/road-module.css";

const n = (v: number) => v.toLocaleString("en-US");

export function RoadModule() {
  const router = useRouter();
  const c = useChallenger(null);
  const { progress, path } = useRoadPath("current");
  if (!c?.road) return null;
  const next = progress?.next ?? null;
  const faces = next && path ? path.gyms.map((g) => ({ name: g.name, picture: g.picture })) : c.road.faces;
  const go = (href: string) => { track(EVENTS.duelToRoad, { from: next ? "duel-module-next" : "duel-module" }); router.push(href); };
  return (
    <section className="road-mod" aria-labelledby="road-mod-title">
      {faces.length > 0 && (
        <ul className="road-mod__faces" aria-hidden="true">
          {faces.slice(0, 8).map((f) => (
            <li key={f.name} className="road-mod__face">{f.picture ? <TrainerArt picture={f.picture} shape="round" /> : f.name.charAt(0)}</li>
          ))}
        </ul>
      )}
      <div className="road-mod__body">
        <p className="road-mod__eyebrow">Trainer Road</p>
        <h2 id="road-mod-title" className="road-mod__title">Battle more trainers on the road</h2>
        <p className="road-mod__text">Every Gym Leader, Elite Four member, Champion, rival and villain from the games, with their teams. Duel any of them any time, or follow the road region by region to earn badges and XP.</p>
        {progress?.encounter ? (
          <RoadEncounterCard e={progress.encounter} from="duel-module" flat />
        ) : next ? (
          <div className="road-mod__next">
            <span className="road-mod__ring" aria-hidden="true">{next.picture ? <TrainerArt picture={next.picture} shape="round" /> : next.name.charAt(0)}</span>
            <p><b>Next on your path: {next.name}</b><span>{next.label}</span></p>
          </div>
        ) : (
          <p className="road-mod__count">{n(c.road.trainers)} trainers · {n(c.road.teams)} teams · {c.road.regions} regions</p>
        )}
        {progress?.encounter ? (
          <div className="road-mod__actions">
            <ArrowLink href="/pokemon-trainers" className="road-mod__link">Your road</ArrowLink>
          </div>
        ) : (
          <div className="road-mod__actions">
            <Button variant="primary" size="large" iconBefore={IconSwords} className="road-mod__go" onClick={() => go(next ? next.href : "/pokemon-trainers")}>{next ? `Continue: ${next.name}` : "Go to Trainer Road"}</Button>
            <ArrowLink href={next ? "/pokemon-trainers" : c.road.href} className="road-mod__link">{next ? "Your road" : `${c.name}'s other teams`}</ArrowLink>
          </div>
        )}
      </div>
    </section>
  );
}
