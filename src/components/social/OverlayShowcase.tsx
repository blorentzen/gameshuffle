"use client";

/**
 * The stage behind /social/overlays: one of our real OBS overlay pieces on a
 * 1280×720 "stream", fed SAMPLE data shaped exactly like the overlay's
 * `/latest` payload, for screenshots in the Twitch chat games guide. Pieces
 * sit where the default layout puts them (`placementStyle`, landscape), the
 * stage's transform standing in for the OBS canvas.
 *
 * Times are relative to the page's clock, restarted every CYCLE_MS so every
 * countdown keeps reading sensibly however long the page is open (the wheel
 * keeps its id, so it lands once and stays landed). Nothing here is saved or
 * fetched. Everyday handles only; no real people.
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { IconBolt, IconChecklist, IconListDetails, IconSwords, IconTargetArrow } from "@tabler/icons-react";
import { ChatBrainOverlay } from "@/components/overlay/ChatBrainOverlay";
import { TriviaOverlay } from "@/components/overlay/TriviaOverlay";
import { NumberBingoOverlay, type NumberBingoOverlayPayload } from "@/components/overlay/NumberBingoOverlay";
import { PollOverlay, type PollOverlayPayload } from "@/components/overlay/PollOverlay";
import { DraftOverlay } from "@/components/overlay/DraftOverlay";
import { BreakScreenOverlay } from "@/components/overlay/BreakScreenOverlay";
import { WheelOverlay, type WheelSpinView } from "@/components/overlay/WheelOverlay";
import { RollSlotArt } from "@/components/twitch/RollSlotArt";
import { TokenIcon } from "@/components/TokenIcon";
import { rollKind, rollSlots, rollTitle, type ChatRoll } from "@/lib/twitch/chatRoll";
import { placementStyle, type LayoutProfile } from "@/lib/overlay/format";
import { WHEEL_PRESETS } from "@/data/wheel-presets";
import type { StreamGameView } from "@/lib/chatbrain/streamGame";
import type { TriviaStreamView } from "@/lib/trivia/stream";
import type { StreamDraftView } from "@/lib/drafts/store";
import type { BreakView } from "@/lib/break/types";
import type { LiveEvents } from "@/lib/economy/events/live";
import "@/styles/overlay.css";
import "@/styles/overlay-showcase.css";

export type ShowcasePiece =
  | "chat_brain"
  | "trivia"
  | "number_bingo"
  | "poll"
  | "whosaid"
  | "draft"
  | "break_screen"
  | "break_boss"
  | "wheel"
  | "battle"
  | "chaos"
  | "picks_bans";

/** How often the sample clock restarts; every countdown below starts further out than this. */
const CYCLE_MS = 20_000;

const iso = (ms: number) => new Date(ms).toISOString();
const FORMAT = "landscape" as const;
/** The overlay's default layout (what a streamer gets before moving anything). */
const LAYOUT: LayoutProfile | null = null;

// ─── Samples ────────────────────────────────────────────────────────────────

function brainSample(t: number): StreamGameView {
  const board: [string, number][] = [
    ["Grab a snack", 27],
    ["Talk in chat", 19],
    ["Check socials", 15],
    ["Get a drink", 12],
    ["Use the bathroom", 10],
    ["Spam emotes", 8],
    ["Watch another stream", 5],
    ["Lurk quietly", 4],
  ];
  const found = new Set([1, 3, 6]);
  return {
    id: "sample-brain",
    mode: "host",
    status: "playing",
    boardIndex: 0,
    boardCount: 3,
    question: "Name something people do while waiting for a stream to start",
    slots: board.map(([label, points], i) => {
      const up = found.has(i + 1);
      return { rank: i + 1, label: up ? label : null, points: up ? points : null, found: up };
    }),
    strikes: 1,
    score: 50,
    seconds: 30,
    phase: "guessing",
    window: { opensAt: iso(t - 6_000), closesAt: iso(t + 26_000), guesses: 143 },
    // Long enough ago that the reveal flash has already faded.
    last: { result: "hit", label: "Spam emotes", rank: 6, already: false, overruled: false, at: iso(t - 40_000) },
    leaning: [
      { label: "Get a drink", share: 0.34 },
      { label: "go afk", share: 0.21 },
      { label: "Grab a snack", share: 0.12 },
    ],
    playalong: [
      { name: "PogPriya", points: 50 },
      { name: "kartkev", points: 42 },
      { name: "LurkerLou", points: 35 },
    ],
    canOverrule: false,
    familySafe: true,
    prize: 100,
  };
}

function triviaSample(t: number): TriviaStreamView {
  return {
    id: "sample-trivia",
    title: "Game night trivia",
    status: "live",
    phase: "question",
    round: { index: 0, count: 3, title: "Game night", style: "classic", questionCount: 6 },
    questionIndex: 2,
    question: {
      prompt: "Add up every pip on a standard six-sided die. What do you get?",
      kind: "choice",
      options: ["18", "21", "24", "36"],
      imageUrl: null,
      category: "Game night",
    },
    closesAt: iso(t + 25_000),
    answer: null,
    answered: 87,
    gotIt: null,
    standings: [],
    you: null,
  };
}

function bingoSample(t: number): NumberBingoOverlayPayload {
  return {
    status: "open",
    patternLabel: "Any line",
    called: [3, 9, 12, 14, 17, 22, 25, 28, 33, 38, 41, 44, 47, 52, 58, 61, 66, 70, 74],
    last: 52,
    prizeTokens: 250,
    prizeText: "Pick the next game",
    winnerName: null,
    players: 64,
    shape: null,
    doorsCloseAt: iso(t - 180_000),
  };
}

const POLL: PollOverlayPayload = {
  id: "sample-poll",
  question: "What should we play next?",
  options: [
    { id: "1", label: "Mario Kart 8 Deluxe" },
    { id: "2", label: "Smash Ultimate" },
    { id: "3", label: "Mario Party Jamboree" },
  ],
  tally: { total: 212, byOption: { "1": 98, "2": 71, "3": 43 } },
};

/** Who Said It? is a poll on the overlay (gs_polls.kind = 'whosaid'), asked the way !whosaid asks it. */
const WHOSAID: PollOverlayPayload = {
  id: "sample-whosaid",
  question: 'Who said: "That shortcut was on purpose, I promise."',
  options: [
    { id: "1", label: "kartkev" },
    { id: "2", label: "PogPriya" },
    { id: "3", label: "novastreams" },
    { id: "4", label: "LurkerLou" },
  ],
  tally: { total: 154, byOption: { "1": 37, "2": 22, "3": 71, "4": 24 } },
};

function draftSample(t: number): StreamDraftView {
  const slots = Array.from({ length: 6 }, (_, i) => ({ key: `pick-${i + 1}`, label: `Pick ${i + 1}` }));
  const mon = (slot: number, label: string, types: string[]) => ({
    slot: `pick-${slot}`,
    id: label.toLowerCase(),
    label,
    detail: types.join(" / "),
    tags: types,
  });
  return {
    id: "sample-draft",
    poolId: "pokemon:sv",
    title: "Pokémon team (Scarlet and Violet)",
    status: "open",
    slots,
    // Fully evolved, no legendaries, no repeated type: the pool's default rules.
    picks: [mon(1, "Meowscarada", ["Grass", "Dark"]), mon(2, "Skeledirge", ["Fire", "Ghost"]), mon(3, "Garchomp", ["Dragon", "Ground"])],
    mode: "vote",
    captains: null,
    current: {
      pollId: "sample-draft-poll",
      question: "Pick 4 of 6: who joins the team?",
      options: [
        { id: "1", label: "Corviknight", detail: "Flying / Steel", votes: 38 },
        { id: "2", label: "Gardevoir", detail: "Psychic / Fairy", votes: 52 },
        { id: "3", label: "Dondozo", detail: "Water", votes: 21 },
        { id: "4", label: "Pawmot", detail: "Electric / Fighting", votes: 17 },
      ],
      total: 128,
      closesAt: iso(t + 24_000),
    },
  };
}

const LEADERS = [
  { name: "kartkev", points: 7 },
  { name: "PogPriya", points: 6 },
  { name: "LurkerLou", points: 4 },
  { name: "CozyCait", points: 3 },
  { name: "TurboTess", points: 2 },
];

function breakBase(t: number): Omit<BreakView, "game" | "next" | "gameRound" | "gameRounds" | "round" | "answering"> {
  return {
    id: "sample-break",
    status: "running",
    phase: "open",
    phaseEndsAt: iso(t + 27_000),
    answerUntil: iso(t + 27_000),
    countdownEndsAt: iso(t + 22_000),
    reveal: null,
    leaders: LEADERS,
    players: 23,
    backBy: iso(t + 6 * 60_000),
    startedAt: iso(t - 8 * 60_000),
    endingRequested: false,
    champion: null,
    handicap: null,
    nextPick: null,
    found: null,
    bingo: null,
    chatStreak: 3,
    show: "panel",
    streamer: "novastreams",
  };
}

const MK8DX_ART = "https://cdn.empac.co/gameshuffle/images/mk8dx/characters";

function breakHigherLowerSample(t: number): BreakView {
  return {
    ...breakBase(t),
    game: { id: "higher-lower", name: "Higher or Lower", howTo: "Type 1 or 2" },
    next: { id: "boss-fight", name: "Boss Fight" },
    gameRound: 3,
    gameRounds: 5,
    round: {
      layout: "choice",
      prompt: "Which one is heavier in Mario Kart 8 Deluxe?",
      options: [
        { key: "1", label: "Peach", img: `${MK8DX_ART}/peach.png` },
        { key: "2", label: "Donkey Kong", img: `${MK8DX_ART}/donkey-kong.png` },
      ],
      hint: "Type 1 or 2",
      tag: "Mario Kart 8 Deluxe",
      openedAt: iso(t - 3_000),
    },
    answering: 31,
  };
}

function breakBossSample(t: number): BreakView {
  return {
    ...breakBase(t),
    game: { id: "boss-fight", name: "Boss Fight", howTo: "Type hit" },
    next: { id: "five-letters", name: "Five Letters" },
    gameRound: 3,
    gameRounds: 5,
    round: {
      layout: "boss",
      prompt: "The Dice Dragon is still standing",
      hint: "Type hit",
      // Health follows the crowd: 40 per fighter at the busiest round (7 → 280).
      boss: { name: "The Dice Dragon", glyph: "dice", hp: 164, maxHp: 280 },
      fighters: 7,
      tag: "Co-op",
      openedAt: iso(t - 3_000),
    },
    answering: 6,
  };
}

const KART_CHALLENGES = WHEEL_PRESETS.find((p) => p.id === "mario-kart-challenges")!;
/** A fixed spin (stable id), so the wheel lands once and stays landed. */
const WHEEL: WheelSpinView = {
  id: "sample-wheel",
  segments: KART_CHALLENGES.segments.map((label) => ({ label })),
  winningIndex: 1,
  winningLabel: KART_CHALLENGES.segments[1],
  triggeredBy: "PogPriya",
  themeId: "classic",
  fillStyle: "solid",
  theme: null,
};

/** The live event banner's payload (`events` on /latest is LiveEvents): one modifier, one public challenge. */
function chaosSample(t: number): LiveEvents {
  return {
    modifiers: [{ id: "sample-mod", effect: "Bananas only", scope: "round", expiresAt: iso(t + 4 * 60_000) }],
    challenges: [
      { id: "sample-challenge", variableType: "placement", condition: { max_position: 3 }, reward: 250, penalty: null, targetName: null, text: "Chat challenge: finish in the top 3 this race" },
    ],
  };
}

/**
 * OverlayClient's PicksBansOverlayPayload. It's a module-private interface
 * there (and inline in the /latest route), so the shape is mirrored here;
 * keep it in step if that one changes.
 */
interface PicksBansOverlayPayload {
  roundId: string;
  gameSlug: string;
  streamerSlug: string;
  locked: number;
  inProgress: number;
  topPicks: Array<{ id: string; count: number; pool: string }>;
  topBans: Array<{ id: string; count: number; pool: string }>;
}

/** Track ids are MK8DX_TRACKS ids (src/lib/randomizers/race/tracks/mk8dx.ts). The banner itself shows only the link and counts. */
const PICKS_BANS: PicksBansOverlayPayload = {
  roundId: "sample-round",
  gameSlug: "mario-kart-8-deluxe",
  streamerSlug: "novastreams",
  locked: 47,
  inProgress: 6,
  topPicks: [
    { id: "special-rainbow-road", count: 31, pool: "tracks" },
    { id: "golden-dash-coconut-mall", count: 24, pool: "tracks" },
    { id: "star-mount-wario", count: 19, pool: "tracks" },
  ],
  topBans: [
    { id: "crossing-baby-park", count: 22, pool: "tracks" },
    { id: "flower-twisted-mansion", count: 9, pool: "tracks" },
  ],
};

// ─── Pieces ─────────────────────────────────────────────────────────────────

// OverlayClient's own label helpers (module-private there), copied so the banner reads exactly as on stream.
function tidyLabel(s: string): string {
  const t = (s ?? "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function describeChallenge(c: LiveEvents["challenges"][number]): string {
  if (c.text) return c.text;
  const cond = c.condition
    ? Object.values(c.condition)
        .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
        .filter(Boolean)
        .join(", ")
    : "";
  return cond ? `${tidyLabel(c.variableType)}: ${cond}` : tidyLabel(c.variableType);
}

/** The live event banner, as OverlayClient draws it inline (top left, from overlay.css). */
function EventsBanner({ events }: { events: LiveEvents }) {
  if (events.modifiers.length === 0 && events.challenges.length === 0) return null;
  return (
    <div className="gs-overlay-events">
      {events.modifiers.length > 0 && (
        <div className="gs-overlay-events__group">
          <div className="gs-overlay-events__heading">
            <IconBolt size={15} stroke={2} className="gs-overlay-events__icon" aria-hidden /> Active modifiers
          </div>
          {events.modifiers.map((m) => (
            <div key={m.id} className="gs-overlay-events__row">
              <span className="gs-overlay-events__label">{tidyLabel(m.effect)}</span>
              <span className="gs-overlay-events__meta">{tidyLabel(m.scope)}</span>
            </div>
          ))}
        </div>
      )}
      {events.challenges.length > 0 && (
        <div className="gs-overlay-events__group">
          <div className="gs-overlay-events__heading">
            <IconTargetArrow size={15} stroke={2} className="gs-overlay-events__icon" aria-hidden /> Open challenges
          </div>
          {events.challenges.map((c) => (
            <div key={c.id} className="gs-overlay-events__row">
              <span className="gs-overlay-events__label">{describeChallenge(c)}</span>
              {c.reward !== null && (
                <span className="gs-overlay-events__reward">+{c.reward.toLocaleString()}<TokenIcon size={14} /></span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The "Picks & bans open" banner, as OverlayClient draws it inline (top right, from overlay.css). */
function PicksBansBanner({ picksBans }: { picksBans: PicksBansOverlayPayload }) {
  return (
    <div className="gs-overlay-picks-bans">
      <div className="gs-overlay-picks-bans__headline">
        <IconChecklist size={16} stroke={2} className="gs-overlay-picks-bans__icon" aria-hidden />
        <span>Picks &amp; bans open</span>
      </div>
      <div className="gs-overlay-picks-bans__url">
        gameshuffle.co/live/{picksBans.streamerSlug}
      </div>
      <div className="gs-overlay-picks-bans__counts">
        <strong>{picksBans.locked}</strong> locked
        {picksBans.inProgress > 0 && (
          <> · {picksBans.inProgress} in progress</>
        )}
      </div>
    </div>
  );
}

/** The live overlay's combo card, as OverlayClient draws it (the battle lineup is inline there, not in ComboOverlay). */
function BattleCard({ roll }: { roll: ChatRoll }) {
  const slots = rollSlots(roll);
  const title = rollTitle(roll);
  const isSetup = rollKind(roll) === "setup";
  // Even rows of at most six (eight players: 4 + 4, not 7 + 1).
  const battleCols = Math.ceil(slots.length / Math.ceil(slots.length / 6));
  const comboId = slots.length > 2 ? "randomizer_mk8dx" : "randomizer_mkw";
  return (
    <div className="gs-overlay gs-overlay--holding" style={{ ...placementStyle(FORMAT, comboId, LAYOUT), right: "auto", bottom: "auto" }}>
      <div className={`gs-overlay__card${title ? " gs-overlay__card--battle" : ""}`}>
        <div className="gs-overlay__header">
          {isSetup
            ? <IconListDetails size={18} stroke={1.9} className="gs-overlay__dice" aria-hidden />
            : <IconSwords size={18} stroke={1.9} className="gs-overlay__dice" aria-hidden />}
          <span className="gs-overlay__name">{title}</span>
        </div>
        <div className="gs-overlay__slots" style={title ? ({ "--battle-cols": battleCols } as CSSProperties) : undefined}>
          {slots.map((slot, i) => (
            <div key={i} className="gs-overlay__slot">
              <RollSlotArt slot={slot} className="gs-overlay__slot-img" glyphSize={64} />
              {slot.kind !== "text" && <div className="gs-overlay__slot-name">{slot.name}</div>}
              {slot.detail && <div className="gs-overlay__slot-detail">{slot.detail}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Piece({ piece, t, battle }: { piece: ShowcasePiece; t: number; battle: ChatRoll | null }) {
  const at = (toolId: string) => placementStyle(FORMAT, toolId, LAYOUT);
  switch (piece) {
    case "chat_brain":
      return <ChatBrainOverlay game={brainSample(t)} style={at("chat_brain")} />;
    case "trivia":
      return <TriviaOverlay trivia={triviaSample(t)} style={at("trivia")} />;
    case "number_bingo":
      return <NumberBingoOverlay bingo={bingoSample(t)} style={at("number_bingo")} />;
    case "poll":
      return <PollOverlay poll={POLL} style={at("poll")} />;
    case "whosaid":
      return <PollOverlay poll={WHOSAID} style={at("poll")} />;
    case "draft":
      return <DraftOverlay draft={draftSample(t)} style={at("chat_draft")} />;
    case "break_screen":
      return <BreakScreenOverlay view={breakHigherLowerSample(t)} style={at("break_screen")} />;
    case "break_boss":
      return <BreakScreenOverlay view={breakBossSample(t)} style={at("break_screen")} />;
    case "wheel":
      return <WheelOverlay spin={WHEEL} style={at("wheel")} />;
    case "battle":
      return battle ? <BattleCard roll={battle} /> : null;
    case "chaos":
      return <EventsBanner events={chaosSample(t)} />;
    case "picks_bans":
      return <PicksBansBanner picksBans={PICKS_BANS} />;
  }
}

export function OverlayShowcase({ piece, battle }: { piece: ShowcasePiece; battle: ChatRoll | null }) {
  // Null until mounted: the samples' times come from this browser's clock.
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setT(Date.now());
    const first = window.setTimeout(tick, 0);
    const iv = window.setInterval(tick, CYCLE_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, []);
  const content = useMemo(() => (t === null ? null : <Piece piece={piece} t={t} battle={battle} />), [piece, t, battle]);

  return (
    <main className="overlay-showcase">
      <div className="overlay-showcase__stage" data-piece={piece} data-ready={t !== null ? "1" : undefined}>
        {content}
      </div>
    </main>
  );
}
