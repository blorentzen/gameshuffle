"use client";

/**
 * Airtime's page (client): a short header, the start card (a drawing of the
 * course with you in it, your best score, Play), how to play, and the run
 * itself full screen once you press Play.
 */

import { useEffect, useMemo, useState } from "react";
import { Accordion, Button, Card } from "@empac/cascadeds";
import { IconRocket } from "@tabler/icons-react";
import { generateDicebearAvatarDataUri } from "@/lib/avatar/dicebear";
import { COURSE_NAME, GAME_NAME } from "@/lib/airtime/content";
import { newSeed } from "@/lib/airtime/rng";
import { AirtimeRun } from "./AirtimeRun";
import { Sound } from "./engine/audio";
import type { OwnAvatar } from "./engine/avatar";
import type { Quality } from "./engine/engine";
import { useAirtimeSaves, writeSaves } from "./saves";

const n = (v: number) => v.toLocaleString("en-US");

/** The start card's picture: our own drawing of the rooftops, with your face on the flyer. */
function CourseArt({ own }: { own: OwnAvatar }) {
  const face = useMemo(() => (own.kind === "photo" ? own.url : generateDicebearAvatarDataUri(own.seed, { ...(own.options ?? {}), backgroundColor: "transparent" })), [own]);
  const windows = (x: number, y: number, cols: number, rows: number, lit: number[], w = 9, h = 11, gx = 16, gy = 18) =>
    Array.from({ length: cols * rows }, (_, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      return <rect key={i} x={x + c * gx} y={y + r * gy} width={w} height={h} rx={1} fill={lit.includes(i) ? "#ffd98a" : "#3d5a8a"} />;
    });
  return (
    <svg className="airtime-art" viewBox="0 0 640 300" role="img" aria-label="Your flyer over the city rooftops, a walker on the next roof and a flyer ahead">
      <defs>
        <linearGradient id="at-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a6bd6" />
          <stop offset="0.55" stopColor="#86aef0" />
          <stop offset="1" stopColor="#ffcf9e" />
        </linearGradient>
        <radialGradient id="at-sun" cx="0.82" cy="0.7" r="0.4">
          <stop offset="0" stopColor="#fff3cf" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff3cf" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="at-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.4" stopColor="#ffb347" />
          <stop offset="1" stopColor="#ff7a1c" stopOpacity="0" />
        </linearGradient>
        <clipPath id="at-face">
          <circle cx="0" cy="0" r="20" />
        </clipPath>
      </defs>
      <rect width="640" height="300" fill="url(#at-sky)" />
      <rect width="640" height="300" fill="url(#at-sun)" />
      {/* Clouds */}
      <g fill="#fff6ee" opacity="0.9">
        <ellipse cx="120" cy="58" rx="46" ry="14" />
        <ellipse cx="150" cy="50" rx="30" ry="14" />
        <ellipse cx="430" cy="40" rx="40" ry="11" />
        <ellipse cx="455" cy="34" rx="24" ry="11" />
      </g>
      {/* The far skyline */}
      <g fill="#a49ac4" opacity="0.85">
        <rect x="0" y="150" width="40" height="150" />
        <rect x="46" y="120" width="30" height="180" />
        <rect x="58" y="96" width="4" height="26" />
        <rect x="84" y="160" width="46" height="140" />
        <rect x="140" y="130" width="26" height="170" />
        <rect x="210" y="140" width="36" height="160" />
        <rect x="300" y="110" width="28" height="190" />
        <rect x="336" y="150" width="44" height="150" />
        <rect x="400" y="124" width="30" height="176" />
        <rect x="470" y="146" width="40" height="154" />
        <rect x="560" y="118" width="34" height="182" />
        <rect x="600" y="152" width="40" height="148" />
      </g>
      {/* The buildings behind, windows lit */}
      <g>
        <rect x="10" y="168" width="80" height="140" fill="#b99a7c" />
        {windows(18, 178, 4, 3, [1, 6, 9])}
        <rect x="170" y="150" width="70" height="160" fill="#7f8fa8" />
        {windows(178, 160, 4, 4, [0, 5, 7, 14])}
        <rect x="380" y="160" width="76" height="150" fill="#a07884" />
        {windows(388, 170, 4, 3, [2, 3, 8, 10])}
        <rect x="520" y="140" width="64" height="170" fill="#86a093" />
        {windows(528, 150, 3, 4, [1, 4, 8, 11], 11, 11, 18)}
      </g>
      {/* Foreground roofs: brick on the left, a gap, ochre on the right with a water tank */}
      <g>
        <rect x="-10" y="226" width="250" height="90" fill="#c1694f" />
        <rect x="-10" y="220" width="256" height="9" fill="#ecdccb" />
        <rect x="-10" y="214" width="256" height="7" fill="#7c7a77" />
        {windows(10, 246, 12, 2, [3, 8, 14, 20], 11, 16, 19, 28)}
        <rect x="350" y="206" width="300" height="110" fill="#d6a067" />
        <rect x="344" y="200" width="306" height="9" fill="#f6e7cf" />
        <rect x="344" y="194" width="306" height="7" fill="#8a857d" />
        {windows(366, 226, 12, 3, [2, 7, 16, 25, 30], 12, 16, 22, 28)}
        <g transform="translate(560 140)">
          <rect x="-3" y="28" width="4" height="26" fill="#5a4a3f" />
          <rect x="30" y="28" width="4" height="26" fill="#5a4a3f" />
          <rect x="-8" y="0" width="46" height="30" rx="3" fill="#a8744a" />
          <rect x="-8" y="10" width="46" height="3" fill="#5a4636" />
          <rect x="-8" y="20" width="46" height="3" fill="#5a4636" />
          <path d="M-11 0 L15 -16 L41 0 Z" fill="#6a5140" />
        </g>
      </g>
      {/* A walker on the right roof */}
      <g transform="translate(470 172)">
        <rect x="-15" y="0" width="30" height="20" rx="5" fill="#f0644a" />
        <rect x="-15" y="10" width="30" height="4" fill="#c9452f" />
        <circle cx="-8" cy="7" r="5" fill="#ffffff" />
        <circle cx="-11" cy="7" r="2.4" fill="#1b2033" />
        <rect x="-10" y="20" width="6" height="5" fill="#3a404c" />
        <rect x="4" y="20" width="6" height="5" fill="#3a404c" />
        <rect x="3" y="-9" width="2" height="9" fill="#3a404c" />
        <circle cx="4" cy="-10" r="3" fill="#ffd23e" />
      </g>
      {/* A flyer ahead */}
      <g transform="translate(520 92)">
        <circle cx="0" cy="0" r="14" fill="#7b5cff" />
        <rect x="-15" y="-2" width="30" height="4" fill="#5a3fd6" />
        <circle cx="-8" cy="0" r="5" fill="#7cf3ff" />
        <rect x="-14" y="-20" width="12" height="2" fill="#d9dfe8" />
        <rect x="2" y="-20" width="12" height="2" fill="#d9dfe8" />
      </g>
      {/* A row of stars over the gap */}
      <g fill="#ffd23e">
        {[268, 296, 324, 352].map((x, i) => (
          <path key={x} transform={`translate(${x} ${150 - Math.sin((i / 3) * Math.PI) * 12}) scale(0.9)`} d="M0 -9 L2.6 -3 L9 -2.8 L4 1.4 L5.6 8 L0 4.4 L-5.6 8 L-4 1.4 L-9 -2.8 L-2.6 -3 Z" />
        ))}
      </g>
      {/* Blaster shots toward the flyer */}
      <g stroke="#7fe8ff" strokeWidth="4" strokeLinecap="round">
        <line x1="300" y1="112" x2="322" y2="108" />
        <line x1="372" y1="102" x2="394" y2="98" />
      </g>
      {/* You: smoke, a flame, the jetpack, a jacket, your face */}
      <g opacity="0.75" fill="#f2ece4">
        <circle cx="150" cy="196" r="11" />
        <circle cx="172" cy="182" r="8" />
        <circle cx="128" cy="206" r="14" />
      </g>
      <g transform="translate(206 128) rotate(-8) scale(1.55)">
        <path d="M-22 22 L-14 22 L-18 62 Z" fill="url(#at-flame)" />
        <rect x="-26" y="-6" width="12" height="30" rx="5" fill="#d7dde5" />
        <rect x="-26" y="-8" width="12" height="6" rx="3" fill="#ff8a3d" />
        <rect x="-12" y="-4" width="26" height="30" rx="6" fill="#2f66ec" />
        <rect x="-3" y="-2" width="4" height="26" fill="#ffffff" />
        <rect x="-10" y="26" width="8" height="18" rx="3" fill="#27324a" transform="rotate(18 -6 26)" />
        <rect x="2" y="26" width="8" height="18" rx="3" fill="#27324a" transform="rotate(30 6 26)" />
        <rect x="8" y="4" width="30" height="7" rx="3" fill="#eef2f7" />
        <rect x="34" y="3" width="6" height="9" rx="2" fill="#ff8a3d" />
        <g transform="translate(2 -26)">
          <circle cx="0" cy="0" r="23" fill="#ffffff" />
          <circle cx="0" cy="0" r="20" fill="#2f66ec" />
          <image href={face} x="-21" y="-19" width="42" height="42" clipPath="url(#at-face)" preserveAspectRatio="xMidYMid slice" />
        </g>
      </g>
    </svg>
  );
}

export function AirtimeGame({
  own,
  seed: firstSeed,
  staffPreview,
  debug,
  autopilot = false,
  quality = "auto",
  startLevel = 1,
  pinnedSeed = false,
}: {
  own: OwnAvatar | null;
  seed: number;
  staffPreview: boolean;
  debug: boolean;
  autopilot?: boolean;
  quality?: Quality;
  startLevel?: number;
  /** Development: ?seed= keeps every run on the same seed. */
  pinnedSeed?: boolean;
}) {
  const saves = useAirtimeSaves();
  const [seed, setSeed] = useState(firstSeed);
  const [playing, setPlaying] = useState(false);
  const [runNo, setRunNo] = useState(0);

  // Signed out: a generated avatar from a seed kept in this browser.
  useEffect(() => {
    if (!own && saves.guest === null) writeSaves((s) => ({ ...s, guest: s.guest ?? `airtime-${newSeed().toString(36)}` }));
  }, [own, saves.guest]);
  const guest = saves.guest ?? "airtime";
  const me = useMemo<OwnAvatar>(() => own ?? { kind: "dicebear", seed: guest, options: null }, [own, guest]);

  const play = () => {
    Sound.prime();
    if (!pinnedSeed && runNo > 0) setSeed(newSeed());
    setRunNo((k) => k + 1);
    setPlaying(true);
  };
  const again = () => {
    Sound.prime();
    if (!pinnedSeed) setSeed(newSeed());
    setRunNo((k) => k + 1);
  };

  return (
    <div className="airtime-page">
      <header className="airtime-page__head">
        <h1 className="airtime-page__title">{GAME_NAME}</h1>
        <p className="airtime-page__lede">A jetpack side-scroller over the city. Fly over the gaps, land on a roof to run, and aim and fire at what gets in your way.</p>
        {staffPreview && <p className="airtime-page__note">Staff preview: only staff can open this page until it launches.</p>}
      </header>

      <Card variant="elevated" padding="large" className="airtime-start">
        <div className="airtime-start__art">
          <CourseArt own={me} />
        </div>
        <div className="airtime-start__body">
          <h2 className="airtime-start__title">{COURSE_NAME}</h2>
          <p className="airtime-start__line">Hold the left side to fly. Press and drag on the right to aim and fire.</p>
          <p className="airtime-start__line">About a minute a level, ending at a finish gate. Clear one, then keep going for a bigger score or bank it.</p>
          <p className="airtime-start__best">{saves.best > 0 ? `Your best: ${n(saves.best)}${saves.bestLevels ? ` (${saves.bestLevels} ${saves.bestLevels === 1 ? "level" : "levels"} cleared)` : ""}.` : "No score yet. Your best is kept in this browser."}</p>
          <div className="airtime-start__actions">
            <Button variant="primary" size="large" iconBefore={IconRocket} onClick={play}>
              Play
            </Button>
          </div>
        </div>
      </Card>

      <Accordion
        variant="flush"
        className="airtime-help"
        items={[
          {
            id: "how",
            title: "How to play",
            content: (
              <ul className="airtime-help__list">
                <li>On a phone, hold the left side of the screen to fire your jetpack, and let go to fall. The Fly button marks the spot.</li>
                <li>Press the right side to fire and drag your thumb to aim. Firing keeps going while your thumb is down. The Fire ring marks the spot, and a line shows where you&apos;re aiming.</li>
                <li>With a keyboard and mouse, hold Space, W or Up to fly. Aim with the mouse and hold the left button to fire. Without a mouse, J fires and I and K turn your aim up and down.</li>
                <li>With a controller, A or the left trigger flies, the right stick aims, and the right trigger or bumper fires.</li>
                <li>The city moves you forward. Land on any roof or plank and you run along it. Walls stop you until you fly over them.</li>
                <li>Your shots bend a little toward an enemy close to your aim. Grab Spread (three shots in a fan) or Rapid (fast shots) for 20 seconds.</li>
                <li>Walkers patrol the roofs (land on one to knock it out), flyers drift in waves, and turrets fire slow shots you can dodge. You can reach a turret before it can reach you. Mind the crane&apos;s swinging load.</li>
                <li>Three hearts a run. A hit or a fall costs one; after a fall you drop onto the next roof. Clearing a level gives one back, and a heart turns up now and then.</li>
                <li>Score: distance, enemies, pickups and stars, a bonus for each level cleared, and more for clearing one without a hit.</li>
              </ul>
            ),
          },
        ]}
      />

      <p className="airtime-page__credit">Avatars: &ldquo;Adventurer&rdquo; by Lisa Wischofsky, CC BY 4.0 (via DiceBear).</p>

      {playing && (
        <AirtimeRun
          key={`${seed}-${runNo}`}
          seed={seed}
          own={me}
          muted={saves.muted}
          best={saves.best}
          debug={debug}
          autopilot={autopilot}
          quality={quality}
          startLevel={startLevel}
          onExit={() => setPlaying(false)}
          onAgain={again}
        />
      )}
    </div>
  );
}
