import "server-only";

/**
 * What's next once today's dailies are done (dailies + explore picks 2026-11-05, 4A, 5A, 6A): three picks by the
 * account's interests, one to play on your own, one to start with friends, one you haven't tried. "With friends" is a
 * one-tap start (a Mario Party or Mario Kart night, a trivia night) that hands you the code and link to send.
 * Signed out: the most played, and an Odd One Out round that needs no account. Our own art: the game's key art,
 * Scrydex card art for Pokémon (the art window only, credited), and our icon tiles.
 */

import { photoArt, type Happening, type HappeningArt } from "@/lib/home/happening";
import { NO_CONTEXT, type PickContext } from "@/lib/home/pickContext";
import type { Interest } from "@/lib/interests/rules";
import { wideArt } from "@/lib/home/art";
import { catalogGame, boxArt } from "@/data/game-catalog";
import { getShowcaseArt } from "@/lib/pokemon/showcase";
import { dexAnswer } from "@/lib/originals/dailyDex";
import { gsDay } from "@/lib/time/gsClock";
import { ROAD_PUBLIC } from "@/lib/games-visibility";

/** A start with friends: the night made in one tap. */
export type QuickGame = "mario-party" | "mario-kart" | "trivia";

export interface Pick extends Happening {
  /** One-tap start (opens the start window) instead of a link. */
  start?: QuickGame;
}

type Slot = "own" | "friends" | "new";
const KICKER: Record<Slot, string> = { own: "On your own", friends: "With friends", new: "Something new" };

/** Crowd-pleasers for the Pokémon picks' card art, in rotation (never today's Dex answer). */
const POKEMON_ART: { dex: number; name: string }[] = [
  { dex: 25, name: "Pikachu" }, { dex: 6, name: "Charizard" }, { dex: 133, name: "Eevee" }, { dex: 94, name: "Gengar" },
  { dex: 150, name: "Mewtwo" }, { dex: 448, name: "Lucario" }, { dex: 197, name: "Umbreon" }, { dex: 384, name: "Rayquaza" },
  { dex: 249, name: "Lugia" }, { dex: 658, name: "Greninja" }, { dex: 445, name: "Garchomp" }, { dex: 143, name: "Snorlax" },
];

const dayIndex = (day: string) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);

async function pokemonArt(day: string, offset: number): Promise<HappeningArt | null> {
  const answer = (() => { try { return dexAnswer(day).name; } catch { return null; } })();
  const pool = POKEMON_ART.filter((p) => p.name !== answer);
  const art = await getShowcaseArt(pool.map((p) => p.dex)).catch(() => ({} as Awaited<ReturnType<typeof getShowcaseArt>>));
  const ready = pool.filter((p) => art[p.dex]);
  if (!ready.length) return null;
  const pick = ready[(dayIndex(day) + offset) % ready.length];
  const a = art[pick.dex];
  return { kind: "card", src: a.src, fullArt: a.fullArt, credit: `${a.card}${a.set ? `, ${a.set}` : ""}` };
}

const photo = photoArt;

const gameArtFor = (slug: string): HappeningArt => {
  const wide = wideArt(slug);
  if (wide) return { kind: "img", src: wide };
  const box = boxArt(catalogGame(slug));
  return box ? { kind: "img", src: box } : { kind: "tone", tone: "magenta", icon: "dice" };
};

/** The first favorite that has a randomizer, else Mario Kart 8 Deluxe. */
function favoriteRandomizer(favorites: string[]): { slug: string; name: string; href: string } {
  for (const f of favorites) {
    const g = catalogGame(f);
    if (g?.href?.startsWith("/randomizers/")) return { slug: g.slug, name: g.name, href: g.href };
  }
  return { slug: "mario-kart-8-deluxe", name: "Mario Kart 8 Deluxe", href: "/randomizers/mario-kart-8-deluxe" };
}

/** The Mario Party or Mario Kart the account plays, for the night's art and game. */
export function quickGameSlug(game: QuickGame, favorites: string[]): string {
  const names = favorites.map((f) => catalogGame(f)?.slug ?? "");
  if (game === "mario-party") return names.find((s) => s === "mario-party-superstars" || s === "super-mario-party-jamboree") ?? "super-mario-party-jamboree";
  if (game === "mario-kart") return names.find((s) => s === "mario-kart-world" || s === "mario-kart-8-deluxe") ?? "mario-kart-8-deluxe";
  return "trivia";
}

/** "Ana, Sam and Mika". */
const names = (list: { name: string }[]) => list.length < 2 ? list[0]?.name ?? "" : `${list.slice(0, -1).map((f) => f.name).join(", ")} and ${list[list.length - 1].name}`;

const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return `${n.toLocaleString("en-US")}${s[(v - 20) % 10] || s[v] || s[0]}`; };

/**
 * `ctx` (context picks 1A): what's yours (a card you own, your best track, your saved build, your friends' faces).
 * Pictures come from the closest thing to you: yours, your people's, the game's, ours, then stock.
 */
export async function nextPicks(opts: { interests: Interest[]; favorites: string[]; signedIn: boolean; day?: string; ctx?: PickContext }): Promise<Pick[]> {
  const day = opts.day ?? gsDay();
  const ctx = opts.ctx ?? NO_CONTEXT;
  const has = (i: Interest) => opts.interests.includes(i);
  const fav = favoriteRandomizer(opts.favorites);
  const [nameArt, genArt] = has("pokemon") || !opts.interests.length ? await Promise.all([ctx.card ? null : pokemonArt(day, 0), pokemonArt(day, 5)]) : [null, null];

  const pick = (slot: Slot, id: string, title: string, line: string, href: string, art: HappeningArt, start?: QuickGame): Pick =>
    ({ id: `next:${id}`, world: "play", kicker: KICKER[slot], title, line, href, art, weight: 0, ...(start ? { start } : {}) });
  // A night with friends wears their faces and names the seats to save.
  const night = (id: string, title: string, line: string, art: HappeningArt, start: QuickGame): Pick => {
    const p = pick("friends", id, title, ctx.friends.length ? `Save seats for ${names(ctx.friends)}` : line, "/game-nights/tools/night-planner", art, start);
    return ctx.friends.length ? { ...p, faces: ctx.friends } : p;
  };

  const own: Pick[] = [];
  const friends: Pick[] = [];
  const fresh: Pick[] = [];
  // Yours first: a Pokémon card from your collection, else a showcase card.
  const named: HappeningArt = ctx.card ? { kind: "card", src: ctx.card.src, fullArt: ctx.card.fullArt, credit: ctx.card.credit } : nameArt ?? { kind: "tone", tone: "dex", icon: "pokeball" };
  const namedLine = ctx.card ? (ctx.card.count > 1 ? `${ctx.card.name}, one of your ${ctx.card.count.toLocaleString("en-US")} cards` : `${ctx.card.name}, from your collection`) : "All 1,025 against the clock";

  if (has("pokemon") || !opts.interests.length) {
    own.push(pick("own", "name-quiz", "Name every Pokémon", namedLine, "/name-every-pokemon", named));
    fresh.push(pick("new", "pokemon-generator", "Random Pokémon generator", "Six for a team, by generation and type", "/randomizers/pokemon", genArt ?? { kind: "tone", tone: "dex", icon: "pokeball" }));
    if (ROAD_PUBLIC) fresh.push(pick("new", "trainer-road", "Trainer Road", "Duel every Gym Leader with their own team", "/pokemon-trainers", { kind: "tone", tone: "duel", icon: "route" }));
  }
  if (has("competitive")) {
    // Your best track (its course art as an inset), else the boards on a photo.
    own.push(ctx.best
      ? pick("own", "time-trials", `Beat your ${ctx.best.time} on ${ctx.best.track}`, `${ordinal(ctx.best.place)} of ${ctx.best.total.toLocaleString("en-US")} on the ${ctx.best.game} board`, ctx.best.href, { kind: "inset", tone: "teal", images: [ctx.best.image], fit: "cover" })
      : pick("own", "time-trials", "Set a time trial", "The open boards: MK8 Deluxe and World", "/time-trials", photo("pick-time-trial", { kind: "tone", tone: "teal", icon: "clock" })));
    friends.push(night("mk-night", "Start a Mario Kart night", "Rolls and a scoreboard for everyone; send the code", gameArtFor("mario-kart-world"), "mario-kart"));
    fresh.push(pick("new", "bracket", "Make a bracket", "Single, double, round robin or Swiss, free", "/bracket-generator", photo("pick-bracket", { kind: "tone", tone: "magenta", icon: "bracket" })));
  }
  if (has("home") || has("daily") || !opts.interests.length) {
    friends.push(night("mp-night", "Start a Mario Party night", "Boards, characters and minigames rolled; send the code", gameArtFor(quickGameSlug("mario-party", opts.favorites)), "mario-party"));
    // Your saved build (racer and kart as an inset), else your game's key art.
    own.push(ctx.build
      ? pick("own", "randomizer", `${ctx.build.character.name} and the ${ctx.build.vehicle.name}`, "Your saved build: race it, or roll a new one", ctx.build.href, { kind: "inset", tone: "shuffle", images: [ctx.build.character.img, ctx.build.vehicle.img], fit: "contain" })
      : pick("own", "randomizer", `${fav.name} randomizer`, "Roll for tonight's group", fav.href, gameArtFor(fav.slug)));
    fresh.push(pick("new", "most-likely", "Most Likely To", "Everyone votes on their phone", "/game-nights/tools/most-likely-to", photo("pick-most-likely", { kind: "tone", tone: "teal", icon: "users" })));
    fresh.push(pick("new", "tier-list", "Tier list maker", "Rank karts, fighters, boards and more", "/tier-list-maker", { kind: "tone", tone: "shuffle", icon: "chart" }));
  }
  if (has("stream") || has("events")) {
    friends.push(night("trivia-night", "Start a trivia night", "Ready-made rounds, teams play on their phones", photo("pick-trivia", { kind: "tone", tone: "teal", icon: "question" }), "trivia"));
    fresh.push(pick("new", "chat-games", "Games your chat can play", "Twelve, with the commands", "/twitch-chat-games", photo("pick-stream", { kind: "tone", tone: "magenta", icon: "broadcast" })));
  }
  // Every account gets a pick in each slot.
  if (!own.length) own.push(pick("own", "name-quiz", "Name every Pokémon", "All 1,025 against the clock", "/name-every-pokemon", named));
  if (!friends.length) friends.push(night("mp-night", "Start a Mario Party night", "Boards, characters and minigames rolled; send the code", gameArtFor("super-mario-party-jamboree"), "mario-party"));
  if (!fresh.length) fresh.push(pick("new", "tier-list", "Tier list maker", "Rank karts, fighters, boards and more", "/tier-list-maker", { kind: "tone", tone: "shuffle", icon: "chart" }));

  // Signed out: nothing that needs an account (a pass-the-phone round instead of a night).
  if (!opts.signedIn) {
    friends.splice(0, friends.length, pick("friends", "odd-one-out", "Odd One Out", "Pass one phone around: who's the odd one?", "/game-nights/tools/odd-one-out", photo("pick-odd-one-out", { kind: "tone", tone: "magenta", icon: "question" })));
  }

  // The day picks within each slot, so the same pick doesn't sit there day after day; never the same thing twice.
  const n = dayIndex(day);
  const chosen: Pick[] = [];
  for (const list of [own, friends, fresh]) {
    const open = list.filter((p) => !chosen.some((c) => c.href === p.href));
    if (open.length) chosen.push(open[n % open.length]);
  }
  return chosen;
}
