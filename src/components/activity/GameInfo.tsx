"use client";

/**
 * "What is this game?" for the Discord Activity: an info button beside a
 * game's name that opens a short explanation (what it is, how a round plays,
 * who it's for, how long). All the copy lives in GAME_INFO below, so every
 * surface says the same thing. Every claim matches the real rules: the room
 * (src/lib/activity/room.ts, roomRules.ts, roomParty.ts, roomBrain.ts), break
 * mode's games (src/lib/break/types.ts) and the Originals' rules. Change a
 * rule there, change the line here.
 *
 * Built on CDS IconButton + Popover. The Popover wraps its own trigger in a
 * span with role="button", so an IconButton inside it would be a button in a
 * button; instead the Popover's trigger is a hidden anchor laid over the
 * IconButton (so the panel still lines up with it) and the IconButton drives
 * it as a controlled Popover. This wrapper adds what the Popover leaves out:
 * the panel gets a name and description and takes focus when it opens, and
 * Escape, Tab or a tap outside closes it, with focus back on the button.
 * (CascadeDS gaps, on the fix list.)
 */

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { IconButton, Popover } from "@empac/cascadeds";
import { IconInfoCircle } from "@tabler/icons-react";
import { PARTY_GAMES, QUICKFIRE_SETS, type PartyRoomView, type QuickfireSetId } from "@/lib/activity/roomRules";
import { dayKey, guessLimits, puzzleFor } from "@/lib/originals/daily";

export type GameInfoId =
  | "daily" | "dex" | "together" | "weekly" | "brain" | "trivia"
  | "quickfire" | `quickfire-${QuickfireSetId}`
  | "roll" | PartyRoomView["slug"] | "brain-boards";

interface GameInfo {
  name: string;
  /** Two to four short sentences: what it is, how a round plays, how it scores. */
  lines: string[];
  /** Players, length and the like, shown small under the lines. */
  meta: string[];
}

const party = (slug: PartyRoomView["slug"]) => PARTY_GAMES.find((g) => g.slug === slug)?.name ?? slug;

/** The Daily's card follows today's puzzle: the game days, or the All-Stars pool with its Last chance. */
function dailyInfo(): GameInfo {
  const p = puzzleFor(dayKey());
  const { main } = guessLimits(p);
  if (p.lastChance) {
    return {
      name: "The Daily Shuffle",
      lines: [
        `Guess today's mystery character from ${p.characters.length} across Nintendo, plus Smash's guests.`,
        "A hint shows before your first guess and a new one after each miss, each a little more specific. Each guess shows which facts match the answer or come close.",
        `Miss all ${main} and you get a last chance with their silhouette: it keeps your streak, but isn't a win. A new puzzle every midnight Pacific.`,
      ],
      meta: ["Solo", `${main} guesses and a last chance`, "One puzzle a day"],
    };
  }
  return {
    name: "The Daily Shuffle",
    lines: [
      `Guess today's mystery character in ${main} tries.`,
      "Each guess shows which of that character's facts match the answer or come close, so you can narrow it down.",
      "Everyone gets the same puzzle, with a new one at midnight Pacific. The game changes with the day: Mario Kart, Mario Party or Smash.",
    ],
    meta: ["Solo", `${main} guesses`, "One puzzle a day"],
  };
}

export const GAME_INFO: Record<GameInfoId, GameInfo> = {
  // ── The Activity's tabs ──
  get daily() { return dailyInfo(); },
  dex: {
    name: "The Daily Dex",
    lines: [
      "Guess today's Pokémon from all 1,025.",
      "A hint shows before your first guess and a new one after each miss. Each guess shows which facts match or come close, with arrows on generation, height and weight.",
      "Miss all five and you get a last chance with the first letter and a square for every letter: it keeps your streak, but isn't a win. A new Pokémon every midnight Pacific.",
    ],
    meta: ["Solo", "5 guesses and a last chance", "One Pokémon a day"],
  },
  together: {
    name: "Play together",
    lines: [
      "Games for everyone in this call. Each person plays on their own screen while you talk in voice.",
      "The first person here runs the room and picks the game. They can hand it to someone else, and if they step away, someone else here takes over.",
      "Open this tab to join in. Most games keep score and name a winner.",
    ],
    meta: ["Everyone in the call", "No account needed"],
  },
  weekly: {
    name: "The Weekly Challenge",
    lines: [
      "One challenge for everyone, all week long.",
      "Most weeks it's a survey question: give your answer, then guess up to three of the crowd's top answers. Some weeks it's a Tier War, where you rank six things from S to D.",
      "Results come out Monday at midnight Pacific. You score for each guess on the crowd's board, or each item you ranked where the crowd did.",
    ],
    meta: ["Solo", "Free GameShuffle account", "Once a week"],
  },
  brain: {
    name: "Chat Brain",
    lines: [
      "A survey game built from real answers.",
      "Answer short questions with the first thing that comes to mind. Once enough people answer one, its top answers become a board, and the game is guessing what everyone said.",
      "Only grouped answers are ever shown, never yours on its own.",
    ],
    meta: ["Solo", "One short answer per question", "No account needed"],
  },
  trivia: {
    name: "Trivia",
    lines: [
      "When this server's streamer runs a GameShuffle trivia night on stream, play along right here and score with everyone in chat.",
      "The rest of the time it's a practice round: five questions from the GameShuffle trivia pack, checked one at a time.",
      "Practice rounds are just for fun. Nothing is scored or saved.",
    ],
    meta: ["Solo", "5 questions a practice round"],
  },

  // ── Play together's lobby ──
  quickfire: {
    name: "Quick-fire rounds",
    lines: [
      "Short rounds everyone answers at the same time, each on their own screen.",
      "Every round is a quick mini game from the set you pick. The game checks the answers: right answers score, and some games give more for being quick or close.",
      "Most rounds end early once everyone has answered.",
    ],
    meta: ["Any group size", "5, 10 or 15 rounds", "Most rounds under a minute"],
  },
  "quickfire-mixed": {
    name: QUICKFIRE_SETS.mixed.name,
    lines: [
      "A shuffled mix of nine quick games: character facts (which is heavier, true or false, which one doesn't belong), zoomed-in pictures, emoji puzzles, scrambled names, year guesses, trivia and this-or-that questions.",
      "This-or-that rounds score for picking what most of the room picks.",
      "Character questions can stick to Mario Kart, Mario Party or Smash, or use any game.",
    ],
    meta: ["Any group size", "12 to 32 seconds a round"],
  },
  "quickfire-characters": {
    name: QUICKFIRE_SETS.characters.name,
    lines: [
      "Questions about the characters in games like Mario Kart, Mario Party and Smash.",
      "Rounds ask which of two is heavier or came first, which of four doesn't belong and whether a fact is true. Others have you unscramble a name, name a zoomed-in picture or guess a year.",
      "Pick a series under Characters from, or leave it on Any game.",
    ],
    meta: ["Any group size", "12 to 32 seconds a round"],
  },
  "quickfire-trivia": {
    name: QUICKFIRE_SETS.trivia.name,
    lines: [
      "Questions from the GameShuffle trivia pack.",
      "Type your answer before time runs out. Close spellings count, and everyone who gets it right scores a point.",
    ],
    meta: ["Any group size", "20 seconds a question"],
  },
  "quickfire-words": {
    name: QUICKFIRE_SETS.words.name,
    lines: [
      "Name the game told in emoji, or unscramble a character's name.",
      "Type your answer before time runs out. Everyone who gets it right scores.",
    ],
    meta: ["Any group size", "25 seconds a round"],
  },
  "quickfire-rush": {
    name: QUICKFIRE_SETS.rush.name,
    lines: [
      "Name every character on a game's roster together before the clock runs out.",
      "Type as many names as you know: each one you get fills the board for everyone. You score a point per name, up to 10.",
      "Clear the whole roster and everyone who named one gets 5 more.",
    ],
    meta: ["Any group size", "1, 2 or 3 rosters", "60 to 100 seconds each"],
  },
  roll: {
    name: "Roll for the call",
    lines: [
      "About to play a game together? Pick it here and everyone gets a random pick from our randomizers, like a kart combo, a fighter or a hero.",
      "Reroll your own pick whenever you like. Whoever runs the room can reroll everyone and, for games that have one, roll the match setup: tracks, a stage or a board.",
      "Nothing is scored. It just settles who plays what.",
    ],
    meta: ["Any group size", "Takes seconds"],
  },
  "most-likely-to": {
    name: party("most-likely-to"),
    lines: [
      "A prompt goes up and everyone votes for the person in the call who fits it best, yourself included.",
      "Votes stay anonymous: the reveal only shows counts. You score a point when your vote matches the room's top pick, and ties count.",
      "Whoever runs the room deals each prompt and reveals the votes.",
    ],
    meta: ["3 or more players", "8 rounds suggested"],
  },
  "odd-one-out": {
    name: party("odd-one-out"),
    lines: [
      "Everyone gets the same secret word except one player, who only sees the category.",
      "Take turns giving one-word hints in voice, then vote for who's faking it.",
      "Everyone who votes for the odd one out scores 2. If the most votes miss them, they score 3; if they're caught, they get one guess at the word for 2.",
    ],
    meta: ["3 or more players", "5 rounds suggested"],
  },
  "tier-wars": {
    name: party("tier-wars"),
    lines: [
      "Everyone ranks the same six things from S to D on their own screen.",
      "The reveal builds the room's tier list from the most popular picks and calls out the hottest take.",
      "You score a point for every item you put where the room did.",
    ],
    meta: ["3 or more players", "4 topics suggested"],
  },
  "number-bingo": {
    name: party("number-bingo"),
    lines: [
      "Everyone gets their own bingo card. Numbers are called every few seconds, or by hand if whoever runs the room prefers.",
      "Mark your card and tap Bingo! when you have the round's pattern: any line, four corners, the X, a picture frame or a blackout.",
      "The first real bingo wins the round, checked against the numbers called.",
    ],
    meta: ["2 or more players", "3 rounds suggested", "1 point per round won"],
  },
  "brain-boards": {
    name: "Chat Brain boards",
    lines: [
      "Name the top answers to a real survey question, everyone racing on the same board.",
      "The first person to type a hidden answer takes its points, and every find resets the 20-second clock. Run out of time and that's a strike; three strikes or a cleared board ends it.",
    ],
    meta: ["Any group size", "1, 3 or 5 boards"],
  },
};

/** The info button for one game; opens its explanation beside it. */
export function GameInfoButton({ game }: { game: GameInfoId }) {
  const info = GAME_INFO[game];
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const panel = () => card.current?.closest<HTMLElement>(".empac-popover") ?? null;
    const close = (refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus(); };
    // The button toggles it itself, so a press on the button isn't "outside".
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrap.current?.contains(t) || panel()?.contains(t)) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      // The panel sits at the end of the page, so Tab from it comes back to the button.
      if (e.key === "Tab" && panel()?.contains(document.activeElement)) { e.preventDefault(); close(true); }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span ref={wrap} className="gs-gameinfo">
      <IconButton
        ref={button}
        variant="tertiary"
        size="small"
        aria-label={`About ${info.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <IconInfoCircle size={18} stroke={1.9} aria-hidden />
      </IconButton>
      <Popover
        trigger={<span className="gs-gameinfo__anchor" />}
        open={open}
        onOpenChange={setOpen}
        closeOnClickOutside={false}
        closeOnEscape={false}
        className="gs-gameinfo__pop"
        content={<InfoCard id={id} info={info} cardRef={card} />}
      />
    </span>
  );
}

/** The panel's words. Names the dialog around it and takes focus, so a screen reader reads it out. */
function InfoCard({ id, info, cardRef }: { id: string; info: GameInfo; cardRef: RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    const dialog = cardRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    dialog.setAttribute("aria-labelledby", `${id}-title`);
    dialog.setAttribute("aria-describedby", `${id}-body`);
    dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
  }, [id, cardRef]);
  return (
    <div ref={cardRef} className="gs-gameinfo__card">
      <p id={`${id}-title`} className="gs-gameinfo__title">{info.name}</p>
      <div id={`${id}-body`} className="gs-gameinfo__body">
        {info.lines.map((line) => <p key={line}>{line}</p>)}
        <p className="gs-gameinfo__meta">{info.meta.join(" · ")}</p>
      </div>
    </div>
  );
}

/** A tab's compact header: the game's name and its info button. */
export function GameHeader({ game }: { game: GameInfoId }) {
  return (
    <div className="gs-gameinfo-head">
      <h2 className="gs-gameinfo-head__title">{GAME_INFO[game].name}</h2>
      <GameInfoButton game={game} />
    </div>
  );
}

/** A labelled row of game names, each with its info button (the quick-fire sets, the party games). */
export function GameInfoList({ label, games }: { label: string; games: GameInfoId[] }) {
  const id = useId();
  return (
    <div className="gs-gameinfo-list">
      <span id={id} className="gs-gameinfo-list__label">{label}</span>
      <ul aria-labelledby={id} className="gs-gameinfo-list__items">
        {games.map((g) => (
          <li key={g} className="gs-gameinfo-list__item">
            <span>{GAME_INFO[g].name}</span>
            <GameInfoButton game={g} />
          </li>
        ))}
      </ul>
    </div>
  );
}
