import "server-only";

/**
 * The war card in a Discord channel (GameShuffle Competitive). One card per war, always at the bottom: after each
 * race a new card goes up and the old one comes down (pick 3A), so the score sits where people look between races
 * without twelve cards piling up. Taps change the card where it is, so it doesn't jump six times a race.
 *
 * Button ids (all start war:, forms warm:): add, undo:<n>, more (menu), fixp (menu), tap:<n>:<place>, fill:<n>,
 * trk:<n>, settrk:<n>:<track>, swap:<n>:<places>[:<track>], keep, endok, card, rematch, link. The final card also links
 * the war's page on the site (/wars/<slug>).
 */

import { SITE_URL } from "@/lib/seo";
import { COMP_COLOR } from "@/lib/discord/ttPanel";
import { compRest, compRestFile } from "@/lib/discord/compRest";
import { renderWarCard } from "./card";
import { placeName, raceLine, TEAM, tapClashes, trackLabel } from "./rules";
import { getWar, pendingTrack, setCard, shownNotes, warChannel, type War } from "./store";
import { warPagePath } from "./page";
import { getPlatformFlag } from "@/lib/platform/flags";

/** The War room button (comp_war_room): on once Activities are switched on for GameShuffle Competitive. */
const roomOn = () => getPlatformFlag("comp_war_room").catch(() => false);

export const WAR_PREFIX = "war:";
export const WAR_MODAL_PREFIX = "warm:";
const V2 = 1 << 15;

const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2, disabled = false) => ({ type: 2, style, label: label.slice(0, 80), custom_id: id, ...(disabled ? { disabled: true } : {}) });
/** A button that opens a page (Discord shows it with an arrow). */
export const linkBtn = (label: string, url: string) => ({ type: 2, style: 5, label: label.slice(0, 80), url });
const row = (...components: unknown[]) => ({ type: 1, components });
const text = (content: string) => ({ type: 10, content });

const teamName = (t: War["us"]) => t.name || t.tag;

/** Teammates from the last tapped race who haven't tapped this one yet. */
function waitingOn(war: War, n: number): string[] {
  const tapped = new Set(war.taps.filter((t) => t.race === n).map((t) => t.id));
  const lastPlayers = [...war.races].reverse().find((r) => r.players?.length)?.players ?? [];
  return lastPlayers.filter((p) => !tapped.has(p.id)).map((p) => p.name);
}

const listNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The card's message parts (Components V2), around the drawn picture. `room` adds the War room button. */
export function cardComponents(war: War, alt: string, opts: { room?: boolean } = {}): unknown[] {
  const id = war.id;
  const roomBtn = opts.room ? [btn("War room", `${WAR_PREFIX}room:${id}`, 1)] : [];
  const next = war.races.length + 1;
  const last = war.races[war.races.length - 1];
  const parts: unknown[] = [{ type: 12, items: [{ media: { url: "attachment://war.png" }, description: alt }] }];
  if (war.races.length) parts.push(text("```\n" + war.races.map((r) => raceLine(r, war.game)).join("\n") + "\n```"));
  const extra: string[] = [];
  if (war.penalties.length) extra.push(`Penalties: ${war.penalties.map((p) => `${p.points} off ${p.side === "us" ? war.us.tag : war.them.tag}${p.reason ? ` (${p.reason})` : ""}`).join(" · ")}`);
  const notes = shownNotes(war).slice(-2);
  if (notes.length) extra.push(...notes);
  if (extra.length) parts.push(text(`-# ${extra.join("\n-# ")}`));

  const more = {
    type: 3, custom_id: `${WAR_PREFIX}more:${id}`, placeholder: "More: fix a race, a penalty, the overlay link…",
    options: [
      ...(war.races.length ? [{ label: "Fix a race", value: "fix", description: "Change a race's places or track" }] : []),
      ...(war.races.length ? [{ label: "Make the table", value: "table", description: "Players, scores, logos and your background" }] : []),
      { label: "Add a penalty", value: "pen", description: "Points off either team" },
      { label: "Overlay link", value: "link", description: "The OBS link for this channel's wars" },
      { label: "Typed races", value: "typed", description: "How /race reads 12378, back or pen 15 here" },
      ...(war.status === "live" ? [war.entry === "taps"
        ? { label: "One person scores", value: "entry", description: "Back to Add race for each race" }
        : { label: "Everyone taps their place", value: "entry", description: "Each player taps where they finished" }] : []),
      ...(war.status === "live" ? [{ label: "End the war", value: "end", description: "Stop before all the races are in" }] : []),
    ],
  };

  if (war.status === "live" && war.entry === "taps") {
    const taps = war.taps.filter((t) => t.race === next);
    const clashes = tapClashes(taps);
    const track = pendingTrack(war, next);
    const waiting = waitingOn(war, next);
    const lines = [`**Race ${next}**${track ? ` · ${trackLabel(war.game, track)}` : ""} · tap where you finished`];
    if (clashes.length) lines.push(`${listNames(clashes.map((p) => `${placeName(p)}`))} tapped twice: tap again to change yours.`);
    else lines.push(`${taps.length} of ${TEAM} in.${waiting.length && taps.length < TEAM ? ` Waiting on ${listNames(waiting.slice(0, TEAM - taps.length))}.` : ""}`);
    parts.push(text(lines.join("\n")));
    const holders = new Map<number, string[]>();
    for (const t of taps) holders.set(t.place, [...(holders.get(t.place) ?? []), t.name]);
    for (let r = 0; r < 3; r++) {
      parts.push(row(...Array.from({ length: 4 }, (_, i) => {
        const p = r * 4 + i + 1;
        const who = holders.get(p);
        return btn(who ? `${placeName(p)} · ${who.join(", ")}` : placeName(p), `${WAR_PREFIX}tap:${id}:${next}:${p}`, who ? (who.length > 1 ? 4 : 3) : 2);
      })));
    }
    parts.push(row(btn("Fill in the rest", `${WAR_PREFIX}fill:${id}:${next}`), btn(track ? "Change the track" : "Track", `${WAR_PREFIX}trk:${id}:${next}`), ...(last ? [btn(`Undo race ${last.n}`, `${WAR_PREFIX}undo:${id}:${last.n}`)] : []), ...roomBtn));
    parts.push(row(more));
  } else if (war.status === "live") {
    parts.push(row(btn(`Add race ${next}`, `${WAR_PREFIX}add:${id}`, 3), ...(last ? [btn(`Undo race ${last.n}`, `${WAR_PREFIX}undo:${id}:${last.n}`)] : []), ...roomBtn));
    parts.push(row(more));
  } else {
    const finished = war.status === "done";
    parts.push(row(...(war.races.length ? [btn("Make the table", `wtab:make:${id}`, 3)] : []), btn("Rematch", `${WAR_PREFIX}rematch:${id}`, war.races.length ? 2 : 3), ...(finished && last ? [btn(`Undo race ${last.n}`, `${WAR_PREFIX}undo:${id}:${last.n}`)] : []), btn("Overlay link", `${WAR_PREFIX}link:${id}`), ...(war.races.length ? [linkBtn("War page", `${SITE_URL}${warPagePath(war)}`)] : [])));
    if (finished) parts.push(row({ ...more, placeholder: "More: fix a race, a penalty…" }));
  }
  return [{ type: 17, accent_color: COMP_COLOR, components: parts }];
}

export type CardPost = "ok" | "no_access" | "no_channel" | "failed";

/** Puts the war's card at the bottom of its channel and takes the previous one down. */
export async function postCard(warId: string): Promise<CardPost> {
  const war = await getWar(warId);
  if (!war) return "failed";
  const pic = await renderWarCard(war);
  const sent = await compRestFile<{ id: string }>("POST", `/channels/${war.channelId}/messages`, { flags: V2, components: cardComponents(war, pic.alt, { room: await roomOn() }), allowed_mentions: { parse: [] } }, { name: "war.png", data: pic.png });
  if (!sent.ok) {
    console.error("[wars] card post failed:", sent.status, sent.error);
    return sent.status === 403 ? "no_access" : sent.status === 404 ? "no_channel" : "failed";
  }
  if (!(await setCard(war.id, sent.data.id, war.version))) {
    // A newer card got there first: this one is out of date.
    await compRest("DELETE", `/channels/${war.channelId}/messages/${sent.data.id}`);
    return "ok";
  }
  if (war.cardMessageId && war.cardMessageId !== sent.data.id) await compRest("DELETE", `/channels/${war.channelId}/messages/${war.cardMessageId}`);
  return "ok";
}

/** Changes the card where it is (taps); posts a new one if it's gone. */
export async function editCard(warId: string): Promise<CardPost> {
  const war = await getWar(warId);
  if (!war) return "failed";
  if (!war.cardMessageId) return postCard(warId);
  const pic = await renderWarCard(war);
  const res = await compRestFile("PATCH", `/channels/${war.channelId}/messages/${war.cardMessageId}`, { components: cardComponents(war, pic.alt, { room: await roomOn() }), allowed_mentions: { parse: [] } }, { name: "war.png", data: pic.png });
  if (res.ok) return "ok";
  if (res.status === 404) return postCard(warId);
  console.error("[wars] card edit failed:", res.status, res.error);
  return res.status === 403 ? "no_access" : "failed";
}

/** The channel's overlay links (its own team on the left, and the other team's view). */
export async function overlayLinks(war: Pick<War, "guildId" | "channelId">): Promise<{ setup: string; ours: string; theirs: string } | null> {
  const ch = await warChannel(war.guildId, war.channelId);
  if (!ch) return null;
  const base = `${SITE_URL}/war/${ch.overlayToken}`;
  return { setup: `${SITE_URL}/war-overlay/${ch.overlayToken}`, ours: base, theirs: `${base}?side=them` };
}

export const warTitle = (war: War) => `${teamName(war.us)} vs ${teamName(war.them)}`;
