/**
 * What brings someone to GameShuffle (personalization picks 2026-11-05, https://claude.ai/artifact/AfnmTQep1jjHrsrRf9w2NK,
 * all A; Britton: "The point of the free account then is to better curate an experience for that user, and they can
 * adjust it at any time as their preferences and games change"). Client-safe.
 *
 * An account's interests (users.interests, supabase/interests-m1.sql) pick its first steps now and the order of its
 * home later. They're picked after sign-up (preselected from what we already know), changed any time in Settings ▸
 * General, and, until someone picks, inferred from what they do (src/lib/interests/store.ts).
 */

export type Interest = "daily" | "home" | "competitive" | "pokemon" | "stream" | "events";

export interface InterestDef {
  id: Interest;
  /** The tile's name. */
  label: string;
  /** One line under it. */
  line: string;
}

/** In the order the tiles show. */
export const INTERESTS: InterestDef[] = [
  { id: "daily", label: "Daily games", line: "Dailies, quizzes and randomizers" },
  { id: "home", label: "Game night at home", line: "Party games, trivia, plans for tonight" },
  { id: "competitive", label: "Competitive Mario Kart", line: "Time trials, lounge, tournaments" },
  { id: "pokemon", label: "Pokémon", line: "Daily Dex, Duel, Trainer Road, your cards" },
  { id: "stream", label: "Streaming", line: "Chat games, an overlay, a Discord bot" },
  { id: "events", label: "Running events", line: "Tournaments, leagues, game nights" },
];

const IDS = new Set<string>(INTERESTS.map((i) => i.id));
export const isInterest = (v: unknown): v is Interest => typeof v === "string" && IDS.has(v);

/** Known interests only, each once, in the tiles' order. */
export function cleanInterests(raw: unknown): Interest[] {
  const picked = new Set(Array.isArray(raw) ? raw.filter(isInterest) : []);
  return INTERESTS.map((i) => i.id).filter((id) => picked.has(id));
}

export const interestLabel = (id: Interest) => INTERESTS.find((i) => i.id === id)!.label;

/** "Competitive Mario Kart and Pokémon" for the "Showing" line. */
export function interestList(ids: Interest[]): string {
  const names = ids.map(interestLabel);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What a page someone signed up from says about them (the sign-up redirect), or null. */
export function interestFromPath(path: string | null | undefined): Interest | null {
  if (!path) return null;
  const p = path.toLowerCase();
  // The account sections (menus and account picks 2026-11-05).
  if (p.startsWith("/account/competitive")) return "competitive";
  if (p.startsWith("/account/pokemon")) return "pokemon";
  if (p.startsWith("/account/events")) return "events";
  if (p.startsWith("/account/discord") && p.includes("app=comp")) return "competitive";
  if (p.startsWith("/account/discord")) return "stream";
  if (/^\/(lounge|time-trials|mmr-card|competitive|mario-kart|wars?\b|war\/|ranked|summer-series)/.test(p) || p.startsWith("/discord/add?app=comp")) return "competitive";
  if (/^\/(daily-dex|daily-duel|pokemon|tcg-companion|name-every-pokemon)/.test(p) || p.includes("tab=my-cards") || p.includes("tab=tcg-decks")) return "pokemon";
  if (/^\/(daily|weekly|chat-brain|randomizers|tools|wheel-spinner|tier-list)/.test(p)) return "daily";
  if (/^\/(hub|for-streamers|gs-pro|discord)/.test(p) || p.startsWith("/account/streaming")) return "stream";
  if (/^\/(tournament|trivia\/leagues|host-a-tournament|for-organizers|gs-circuit|bracket-generator|round-robin|swiss-pairing|series)/.test(p)) return "events";
  if (/^\/(game-nights|party|trivia)/.test(p)) return "home";
  return null;
}

// ── First steps ──────────────────────────────────────────────────────────────────────────────────────────

/** What a step checks to show as done (worked out on the server, src/lib/interests/store.ts). */
export type StepCheck =
  | "lounge" | "times" | "mmr" | "daily" | "dex" | "games" | "road" | "cards"
  | "party" | "trivia" | "twitch" | "discord" | "stream" | "event" | "profile" | "none";

export interface FirstStep { id: string; label: string; href: string; check: StepCheck }

/** Each interest's steps, most useful first. */
export const STEPS: Record<Interest, FirstStep[]> = {
  daily: [
    { id: "daily", label: "Play today's Daily Shuffle", href: "/daily", check: "daily" },
    { id: "games", label: "Pick the games you play, so your randomizers come first", href: "/account?tab=games", check: "games" },
    { id: "dex", label: "Play today's Daily Dex", href: "/daily-dex", check: "dex" },
  ],
  home: [
    { id: "party", label: "Try a party game on everyone's phones with the TV", href: "/game-nights/tools/odd-one-out", check: "party" },
    { id: "trivia", label: "Host a trivia night from a ready-made template", href: "/trivia", check: "trivia" },
    { id: "games", label: "Pick the games you own, so game night ideas fit", href: "/account?tab=games", check: "games" },
  ],
  competitive: [
    { id: "lounge", label: "Confirm your lounge name", href: "/lounge", check: "lounge" },
    { id: "times", label: "Add your time trial times, or bring them over from Quaxly", href: "/time-trials/import", check: "times" },
    { id: "mmr", label: "Make your MMR card", href: "/mmr-card", check: "mmr" },
  ],
  pokemon: [
    { id: "dex", label: "Play today's Daily Dex", href: "/daily-dex", check: "dex" },
    { id: "road", label: "Beat Brock on Trainer Road", href: "/pokemon-trainers/kanto/brock", check: "road" },
    { id: "cards", label: "Add your first cards or paste a deck list", href: "/account/pokemon?tab=my-cards", check: "cards" },
  ],
  stream: [
    { id: "twitch", label: "Connect Twitch for your stream", href: "/account/streaming?tab=integrations", check: "twitch" },
    { id: "discord", label: "Add the GameShuffle bot to your Discord", href: "/account/discord", check: "discord" },
    { id: "stream", label: "Plan your first stream", href: "/hub", check: "stream" },
  ],
  events: [
    { id: "event", label: "Create your first tournament or game night", href: "/tournament/create", check: "event" },
    { id: "trivia", label: "Run a trivia night or a weekly league", href: "/trivia", check: "trivia" },
    { id: "brackets", label: "Try the free bracket tools", href: "/bracket-generator", check: "none" },
  ],
};

/** For someone who picked nothing: the steps everyone got before interests. */
export const DEFAULT_STEPS: FirstStep[] = [
  { id: "games", label: "Pick the games you play", href: "/account?tab=games", check: "games" },
  { id: "profile", label: "Add a picture and your gamertags", href: "/account?tab=profile", check: "profile" },
  { id: "daily", label: "Play today's Daily to start a streak", href: "/daily", check: "daily" },
];

/**
 * Up to `max` first steps for these interests: each interest's first step in turn, then their second steps, and so
 * on, skipping repeats (the Daily Dex is a step for daily games and for Pokémon).
 */
export function stepsFor(interests: Interest[], max = 3): FirstStep[] {
  if (!interests.length) return DEFAULT_STEPS.slice(0, max);
  const out: FirstStep[] = [];
  const seen = new Set<string>();
  for (let round = 0; out.length < max && round < 3; round++) {
    for (const i of interests) {
      const s = STEPS[i][round];
      if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); if (out.length >= max) break; }
    }
  }
  return out;
}
