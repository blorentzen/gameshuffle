"use client";

/**
 * Shuffle Kart's page (client): the roll card (driver, kart, track and twist,
 * dealt from one seed, with one reroll), your best time on the track, how to
 * drive, and the race itself full screen once you press Race.
 */

import { useEffect, useMemo, useState } from "react";
import { Accordion, Button, Card } from "@empac/cascadeds";
import { IconArrowsShuffle, IconFlag, IconFlipHorizontal, IconRoad, IconSteeringWheel } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { cupOf, rideName, TRACKS, type RideId } from "@/lib/kart/content";
import { formatTime } from "@/lib/kart/race";
import { dealRoll } from "@/lib/kart/roll";
import { BODIES, driverFor, kartTraits, statsFor, TWISTS, WEIGHT_LABEL, WHEELS } from "@/lib/kart/roster";
import { newSeed } from "@/lib/kart/rng";
import { trackKey } from "@/lib/kart/track";
import { DriverFace } from "./DriverFace";
import { KartPreview } from "./KartPreview";
import { KartRace } from "./KartRace";
import { Sound } from "./engine/audio";
import type { OwnAvatar } from "./engine/avatars";
import type { Quality } from "./engine/engine";
import type { CharacterLook } from "@/components/games3d/character/types";
import { useKartSaves, writeSaves } from "./saves";

export function KartGame({
  own,
  seed: firstSeed,
  staffPreview,
  debug,
  autopilot = false,
  quality = "auto",
  ride = null,
  look = null,
  pose = null,
  driverId = null,
}: {
  own: OwnAvatar | null;
  seed: number;
  staffPreview: boolean;
  debug: boolean;
  autopilot?: boolean;
  quality?: Quality;
  /** Development only: draw this ride's model instead of the rolled one (looks only). */
  ride?: RideId | null;
  /** Development only: the drivers as 3D characters in this look (helmet, token, built, cutout). */
  look?: CharacterLook | null;
  /** Development only: the roll card's turntable shows the 3D driver on its own, standing or flying. */
  pose?: "stand" | "fly" | null;
  /** Development only: deal this driver (a cast id or "you"). */
  driverId?: string | null;
}) {
  const saves = useKartSaves();
  const [seed, setSeed] = useState(firstSeed);
  const [rerolled, setRerolled] = useState(false);
  const [racing, setRacing] = useState(false);
  const [raceNo, setRaceNo] = useState(0);
  const roll = useMemo(() => {
    const r = dealRoll(seed);
    return driverId ? { ...r, driver: driverId } : r;
  }, [seed, driverId]);

  // Signed out: a generated avatar from a seed kept in this browser.
  useEffect(() => {
    // Keeps an existing seed (the first render reads the server's empty saves).
    if (!own && saves.guest === null) writeSaves((s) => ({ ...s, guest: s.guest ?? `kart-${newSeed().toString(36)}` }));
  }, [own, saves.guest]);
  const guest = saves.guest ?? "shuffle-kart";
  const me = useMemo<OwnAvatar>(() => own ?? { kind: "dicebear", seed: guest, options: null }, [own, guest]);

  const driver = useMemo(() => driverFor(roll.driver), [roll.driver]);
  const stats = statsFor(roll.driver, roll.body, roll.wheels);
  const traits = kartTraits(stats);
  const def = TRACKS[roll.track] ?? Object.values(TRACKS)[0];
  const key = trackKey(def.id, roll.twist === "mirror");
  const best = saves.bests[key] ?? null;
  const bestLap = saves.bestLaps[key] ?? null;
  const twist = TWISTS[roll.twist];
  const cup = cupOf(def.id);
  const kartName = `${ride ? rideName(ride) : BODIES[roll.body].name} on ${WHEELS[roll.wheels].name}`;

  const race = () => {
    Sound.prime();
    setRacing(true);
  };
  const reroll = () => {
    if (rerolled) return;
    setRerolled(true);
    setSeed(newSeed());
  };
  const newRoll = () => {
    setRacing(false);
    setRerolled(false);
    setSeed(newSeed());
  };

  return (
    <div className="kart-page">
      <header className="kart-page__head">
        <h1 className="kart-page__title">Shuffle Kart</h1>
        <p className="kart-page__lede">GameShuffle&apos;s own kart racer, in everyday rides. The roll deals your racer, ride, track and twist. Race what you get, or reroll once.</p>
        {staffPreview && <p className="kart-page__note">Staff preview: only staff can open this page until it launches.</p>}
      </header>

      <Card variant="elevated" padding="large" className="kart-roll">
        <h2 className="kart-roll__title">Your roll</h2>
        <div className="kart-roll__grid">
          <div className="kart-roll__show">
            <KartPreview roll={roll} ride={ride} own={me} label={`${driver.cast ? driver.name : "You"} in the ${kartName}`} paused={racing} look={look} pose={pose} />
          </div>
          <ul className="kart-roll__rows">
            <li className="kart-roll__row">
              <DriverFace driver={driver} own={me} />
              <div>
                <h3 className="kart-roll__label">Racer</h3>
                <p className="kart-roll__name">{driver.cast ? driver.name : "You"}</p>
                <p className="kart-roll__line">{driver.cast ? driver.cast.archetype : `${WEIGHT_LABEL[driver.weight]} driver, in your own avatar`}</p>
              </div>
            </li>
            <li className="kart-roll__row">
              <IconTile icon={IconSteeringWheel} tone={driver.tone} />
              <div>
                <h3 className="kart-roll__label">Kart</h3>
                <p className="kart-roll__name">{kartName}</p>
                <p className="kart-roll__line">{traits.length ? traits.join(", ") : "Even all round"}</p>
              </div>
            </li>
            <li className="kart-roll__row">
              <IconTile icon={IconRoad} tone="green" />
              <div>
                <h3 className="kart-roll__label">Track</h3>
                <p className="kart-roll__name">{def.name}</p>
                <p className="kart-roll__line">{cup ? `${cup}, ${def.laps} laps` : `${def.laps} laps`}</p>
              </div>
            </li>
            <li className="kart-roll__row">
              <IconTile icon={roll.twist === "mirror" ? IconFlipHorizontal : IconArrowsShuffle} tone="violet" />
              <div>
                <h3 className="kart-roll__label">Twist</h3>
                <p className="kart-roll__name">{twist.name}</p>
                <p className="kart-roll__line">{twist.line}</p>
              </div>
            </li>
          </ul>
        </div>
        <p className="kart-roll__best">
          {best
            ? `Your best here: ${formatTime(best.totalMs)}${bestLap !== null ? `, best lap ${formatTime(bestLap)}` : ""}. Your ghost races with you.`
            : "No time here yet. Your best run becomes a ghost you race next time."}
        </p>
        <div className="kart-roll__actions">
          <Button variant="primary" size="large" iconBefore={IconFlag} onClick={race}>
            Race
          </Button>
          <Button variant="secondary" size="large" iconBefore={IconArrowsShuffle} onClick={reroll} disabled={rerolled}>
            {rerolled ? "Rerolled" : "Reroll once"}
          </Button>
        </div>
      </Card>

      <Accordion
        variant="flush"
        className="kart-help"
        items={[
          {
            id: "drive",
            title: "How to drive",
            content: (
              <ul className="kart-help__list">
                <li>On a phone the kart drives itself. Hold the left or right side of the screen to steer.</li>
                <li>On a keyboard: up or W to drive, down or S to brake, left and right (or A and D) to steer, Space to drift, Escape to pause.</li>
                <li>With a controller: A or the right trigger to drive, the stick to steer, a shoulder button to drift.</li>
                <li>Drift through a bend: hold Drift while you steer. Blue sparks, then orange. Let go for a boost; orange is the bigger one.</li>
                <li>The grass slows you down, the puddle is slippery, and the ramp gives you a jump and a small boost when you land.</li>
              </ul>
            ),
          },
        ]}
      />

      <p className="kart-page__credit">
        Driver avatars: &ldquo;Adventurer&rdquo; by Lisa Wischofsky, CC BY 4.0 (via DiceBear).
      </p>

      {racing && (
        <KartRace
          key={`${seed}-${raceNo}`}
          roll={roll}
          own={me}
          ghost={best?.ghost ?? null}
          muted={saves.muted}
          debug={debug}
          autopilot={autopilot}
          quality={quality}
          ride={ride}
          look={look}
          bestLapMs={bestLap}
          onExit={() => setRacing(false)}
          onAgain={() => {
            Sound.prime();
            setRaceNo((n) => n + 1);
          }}
          onNewRoll={newRoll}
        />
      )}
    </div>
  );
}
