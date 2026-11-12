import "server-only";

/**
 * One typed line on a live war (overrides picks 2026-11-09, picks 5 to 7): what /race takes now, and what plain
 * messages in a war's channel will take once Competitive reads chat. The line is read the way this server reads
 * (legacy.ts), then done to the war with the same calls the card's buttons use. The answer says what happened and
 * whether the card moves to the bottom (a new race) or changes in place.
 */

import { readTyped, type Typed } from "./legacy";
import { readsLikeFor, teamFor, trackNames } from "./cardStore";
import { addPenalty, addRace, pendingTrack, removePenalty, replaceRace, setPendingTrack, setSide, setTrack, undoRace, warTeams, type War, type WarTeamRef } from "./store";
import { placesText, readTrack, type ReadSpots, type WarGame, type WarSide } from "./rules";
import { warTrackTitle as trackTitle } from "./tracks";
import { serverLogo } from "./logos";
import { registryTeam } from "./teams";
import { cardLogo } from "./tables";

export interface TypedAnswer {
  /** What it read the line as ("none": chat, leave it alone). */
  kind: Typed["kind"];
  ok: boolean;
  /** Said back to whoever typed it (null: a check mark is enough). */
  text: string | null;
  /** What happens to the war's card: "post" moves it to the bottom (a new race), "edit" changes it in place. */
  card: "post" | "edit" | null;
}

const NOT_WAR: TypedAnswer = { kind: "none", ok: false, text: null, card: null };
const said = (kind: Typed["kind"], text: string): TypedAnswer => ({ kind, ok: false, text, card: null });

/** A team for a war from its tag: this server's team card (and its logo setting), else MKCentral; this server's logo wins either way. */
export async function teamFromTag(guildId: string, tag: string, game: WarGame): Promise<WarTeamRef> {
  const card = await teamFor(guildId, tag).catch(() => null);
  const tags = card ? card.tags : [tag];
  const upload = (await Promise.all(tags.map((t) => serverLogo(guildId, t)))).find(Boolean) ?? null;
  if (card) return { tag: (card.tags[0] ?? tag).slice(0, 12), name: card.name, logo: await cardLogo(card, { upload, tags, game }) };
  const reg = await registryTeam(tag, game).catch(() => null);
  return { tag: (reg?.tag ?? tag).slice(0, 12), name: reg?.name ?? null, logo: upload ?? reg?.logo ?? null };
}

/** A team's name for a reply: by its number (several teams), else its side. */
const teamCalled = (war: War, side: WarSide, team?: number) => {
  const t = warTeams(war)[team ?? (side === "us" ? 0 : 1)] ?? war.them;
  return t.name || t.tag;
};

/** Every team's places as one line, for comparing two reads of the same race. */
const placesKey = (spots: number[], others?: number[][]) => [spots, ...(others ?? [])].map((l) => l.join(",")).join("|");
/** The other teams' places from a read, for several teams. */
const othersOf = (read: Extract<ReadSpots, { ok: true }>) => (read.others ? { places: read.others } : {});

/** Reads `line` and does it to `war`. */
export async function runTyped(war: War, line: string, by: { id: string; name: string }): Promise<TypedAnswer> {
  const [readsLike, nicks] = await Promise.all([readsLikeFor(war.guildId).catch(() => "sokuji" as const), trackNames(war.guildId).catch(() => ({}))]);
  const typed = readTyped(line, { game: war.game, readsLike, us: war.us, them: war.them, trackNames: nicks, format: war.format, others: war.others }, war.races.length);
  if (typed.kind === "none") return NOT_WAR;
  const live = war.status === "live";
  const next = war.races.length + 1;

  switch (typed.kind) {
    case "race": {
      if (!live) return said("race", "This war is over. Start another with /war.");
      if (!typed.spots.ok) return said("race", typed.spots.error);
      const track = typed.track ?? pendingTrack(war, next);
      const res = await addRace(war.id, { n: next, spots: typed.spots.spots, track, by, note: typed.spots.note, ...othersOf(typed.spots) });
      if (!res.ok) {
        if (res.error === "taken") {
          const theirs = res.war?.races.find((r) => r.n === next);
          return said("race", theirs && placesKey(theirs.spots, theirs.places) === placesKey(typed.spots.spots, typed.spots.others)
            ? `Race ${next} is already in with the same places.`
            : `Race ${next} is already in from ${theirs?.by.name ?? "someone"}: ${theirs ? placesText(theirs.spots) : ""}. To change it: race ${next} ${placesText(typed.spots.spots).replace(/, /g, " ")}`);
        }
        return said("race", res.error === "out_of_order" ? `The war has moved on: race ${(res.war?.races.length ?? 0) + 1} is next.` : "This war is over. Start another with /war.");
      }
      return { kind: "race", ok: true, text: typed.spots.note, card: "post" };
    }
    case "track": {
      if (!live || next > war.racesTotal) return said("track", "There's no race left for a track.");
      const res = await setPendingTrack(war.id, next, typed.track);
      if (!res.ok) return said("track", "That race has moved on. Try again.");
      return { kind: "track", ok: true, text: null, card: war.cardMessageId ? "edit" : null };
    }
    case "back": {
      const last = war.races[war.races.length - 1];
      if (!last) return said("back", "There's no race to take back.");
      const res = await undoRace(war.id, last.n, by.name);
      if (!res.ok) return said("back", res.error === "live_elsewhere" ? "Another war is on in this channel now, so this one can't reopen." : "There's no race to take back.");
      return { kind: "back", ok: true, text: `Race ${last.n} taken back.`, card: "post" };
    }
    case "fix": {
      if (!war.races.some((r) => r.n === typed.n)) return said("fix", `There's no race ${typed.n} yet.`);
      if (typed.spots && !typed.spots.ok) return said("fix", typed.spots.error);
      const res = typed.spots?.ok
        ? await replaceRace(war.id, { n: typed.n, spots: typed.spots.spots, ...othersOf(typed.spots), ...(typed.track ? { track: typed.track } : {}), by })
        : typed.track ? await setTrack(war.id, typed.n, typed.track) : null;
      if (!res?.ok) return said("fix", "That race isn't there any more.");
      const t = typed.track ? readTrack(war.game, typed.track) : null;
      return { kind: "fix", ok: true, text: typed.spots?.ok ? `Race ${typed.n} fixed: ${placesText(typed.spots.spots)}.` : `Race ${typed.n}'s track is ${t ? trackTitle(t) : "set"}.`, card: "edit" };
    }
    case "pen": {
      const res = await addPenalty(war.id, { side: typed.side, points: typed.points, reason: typed.reason, by: by.name, ...(typed.team != null ? { team: typed.team } : {}) });
      if (!res.ok) return said("pen", "This war is over.");
      return { kind: "pen", ok: true, text: `${typed.points} off ${teamCalled(war, typed.side, typed.team)}${typed.reason ? ` (${typed.reason.toLowerCase()})` : ""}.`, card: "edit" };
    }
    case "unpen": {
      const res = await removePenalty(war.id, { side: typed.side, points: typed.points, by: by.name, ...(typed.team != null ? { team: typed.team } : {}) });
      if (!res.ok) return said("unpen", res.error === "no_penalty" ? `${teamCalled(war, typed.side, typed.team)} has no penalty${typed.points ? ` of ${typed.points}` : ""} to take back.` : "This war is over.");
      return { kind: "unpen", ok: true, text: `${res.result.points} back to ${teamCalled(war, typed.side, typed.team)}.`, card: "edit" };
    }
    case "tag": {
      const team = await teamFromTag(war.guildId, typed.tag, war.game);
      const res = await setSide(war.id, typed.side, team);
      if (!res.ok) return said("tag", res.error === "same_tag" ? "Both teams can't have the same tag." : "This war is over.");
      return { kind: "tag", ok: true, text: `${typed.side === "us" ? "Your" : "Their"} tag is ${team.tag}${team.name ? ` (${team.name})` : ""}.`, card: "edit" };
    }
  }
}
