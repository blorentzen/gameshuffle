/**
 * `/gs-mmr [name] [versus] [game]` — a Mario Kart lounge player's MMR in the channel (free).
 * No name: the invoker's own MMR card (their GameShuffle account, linked through Discord).
 * `versus` adds a head-to-head (every event the two shared this season).
 * `/gs-room names [me] [format] [game]` — the match read for a pasted room (free).
 * Lounge lookups can outrun Discord's 3 seconds, so it defers and edits the reply.
 */

import { after } from "next/server";
import { getDiscordUser, resolveDiscordUser } from "../user";
import { actionRow, deferredResponse, ephemeralMessage, followUp, linkButton } from "../respond";
import { SITE_URL } from "@/lib/seo";
import { cardFor, liveFor } from "@/lib/mmr/store";
import { LoungeUnavailable, divisionSteps, loungePlayer } from "@/lib/mmr/mkcentral";
import { divisionLook } from "@/lib/mmr/look";
import { MMR_GAMES, fmtMmr, isMmrGame, placeWord, signed, viewOf, type MmrGame, type MmrSource } from "@/lib/mmr/rules";
import { headToHead } from "@/lib/lounge/h2h";
import { parseRoom } from "@/lib/lounge/room";
import { lookUpRoom } from "@/lib/lounge/roomServer";
import { loungePagePath } from "@/lib/lounge/lines";

type Opt = { name: string; value?: string };

function embedFor(src: MmrSource, tonight: boolean) {
  const v = viewOf(src);
  const color = parseInt(divisionLook(v.division).c2.slice(1), 16);
  const squares = v.squares.map((s) => (s === "p" ? "🟨" : s === "w" ? "🟩" : "🟥")).join("");
  const fields = [
    { name: "MMR", value: v.mmr == null ? "None yet" : fmtMmr(v.mmr), inline: true },
    { name: "Division", value: v.division, inline: true },
    { name: v.next ? `To ${v.next.name}` : "Next division", value: v.next && v.toNext != null ? fmtMmr(v.toNext) : "Top division", inline: true },
    ...(v.worldRank ? [{ name: "World rank", value: `#${v.worldRank.toLocaleString("en-US")}`, inline: true }] : []),
    ...(v.peak != null ? [{ name: "Season peak", value: fmtMmr(v.peak), inline: true }] : []),
    ...(tonight && v.tonight.events ? [{ name: "Tonight", value: `${signed(v.tonight.delta)} (${v.tonight.w}-${v.tonight.l})`, inline: true }] : []),
    ...(squares ? [{ name: "Last 10", value: squares, inline: false }] : []),
  ];
  return { title: `${v.name} · ${MMR_GAMES[v.game].short}`, color, fields, footer: { text: "MMR card · gameshuffle.co/mmr-card" } };
}

export async function handleGsMmr(interaction: Record<string, unknown>): Promise<Response> {
  const opts = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? []) as Opt[];
  let name = (opts.find((o) => o.name === "name")?.value ?? "").trim().replace(/^@/, "").slice(0, 40);
  const versus = (opts.find((o) => o.name === "versus")?.value ?? "").trim().replace(/^@/, "").slice(0, 40);
  const gameOpt = opts.find((o) => o.name === "game")?.value;
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  const make = actionRow(linkButton("Make your MMR card", `${SITE_URL}/mmr-card`));

  if (versus) {
    // Head-to-head: the named player, else the invoker's own card's lounge name.
    if (!name) {
      const user = getDiscordUser(interaction);
      const resolved = user?.id ? await resolveDiscordUser(user.id, user.username) : null;
      const card = resolved?.linked && resolved.gsUserId ? await cardFor(resolved.gsUserId) : null;
      if (!card?.loungeName) return ephemeralMessage("Add both names (name and versus), or set up your MMR card first so yours is filled in.", [make]);
      name = card.loungeName;
    }
    const game: MmrGame = isMmrGame(gameOpt) ? gameOpt : "mkworld12p";
    const who = name;
    after(async () => {
      try {
        const [a, b] = await Promise.all([loungePlayer({ name: who }, game), loungePlayer({ name: versus }, game)]);
        if (!a || !b) { await followUp(appId, token, { content: `No lounge player called ${!a ? who : versus} in ${MMR_GAMES[game].short}.` }); return; }
        await followUp(appId, token, { embeds: [h2hEmbed(a.name, b.name, headToHead({ id: a.playerId, changes: a.changes }, { id: b.playerId, changes: b.changes }), game)], components: [make] });
      } catch (err) {
        if (!(err instanceof LoungeUnavailable)) console.error("[gs-mmr versus]", err);
        await followUp(appId, token, { content: "The lounge isn't answering right now. Try again in a minute." });
      }
    });
    return deferredResponse();
  }

  if (!name) {
    const user = getDiscordUser(interaction);
    if (!user?.id) return ephemeralMessage("Couldn't read your user info. Try again?");
    const resolved = await resolveDiscordUser(user.id, user.username);
    if (!resolved.linked || !resolved.gsUserId) {
      return ephemeralMessage(`Add a lounge name to look someone up, or set up your own MMR card at ${SITE_URL}/mmr-card (sign in with Discord).`, [make]);
    }
    const card = await cardFor(resolved.gsUserId);
    if (!card || (!card.loungeName && !card.loungePlayerId)) {
      return ephemeralMessage(`You haven't set up an MMR card yet. It takes a minute at ${SITE_URL}/mmr-card.`, [make]);
    }
    after(async () => {
      const live = await liveFor(card);
      if (live.ok) await followUp(appId, token, { embeds: [embedFor(live.source, true)], components: [make] });
      else await followUp(appId, token, { content: live.reason === "unavailable" ? "The lounge isn't answering right now. Try again in a minute." : "Your card's lounge name wasn't found. Fix it at gameshuffle.co/mmr-card." });
    });
    return deferredResponse();
  }

  const game: MmrGame = isMmrGame(gameOpt) ? gameOpt : "mkworld12p";
  after(async () => {
    try {
      const [player, steps] = await Promise.all([loungePlayer({ name }, game), divisionSteps(game)]);
      if (!player) { await followUp(appId, token, { content: `No lounge player called ${name} in ${MMR_GAMES[game].short}.` }); return; }
      await followUp(appId, token, {
        embeds: [embedFor({ name: player.name, country: player.country, game, mmr: player.mmr, maxMmr: player.maxMmr, division: player.division, worldRank: player.worldRank, steps, changes: player.changes, since: null, avatar: null }, false)],
        components: [make],
      });
    } catch (err) {
      if (!(err instanceof LoungeUnavailable)) console.error("[gs-mmr]", err);
      await followUp(appId, token, { content: "The lounge isn't answering right now. Try again in a minute." });
    }
  });
  return deferredResponse();
}

function h2hEmbed(aName: string, bName: string, h: ReturnType<typeof headToHead>, game: MmrGame) {
  const o = h.opponents;
  const fields = [
    { name: "Events together", value: String(h.events), inline: true },
    ...(o.events ? [{ name: "As opponents", value: `${aName} ${o.aAhead} · ${bName} ${o.bAhead}${o.level ? ` · level ${o.level}` : ""}`, inline: true }] : []),
    ...(h.teammates.events ? [{ name: "As teammates", value: `${h.teammates.wins}-${h.teammates.losses}, ${signed(h.teammates.net)}`, inline: true }] : []),
    ...(h.aFfaPlace != null && h.bFfaPlace != null ? [{ name: "Average place, free-for-all", value: `${aName} ${h.aFfaPlace.toFixed(1)} · ${bName} ${h.bFfaPlace.toFixed(1)}`, inline: false }] : []),
    ...(h.meetings.length ? [{
      name: "Last meetings",
      value: h.meetings.slice(0, 5).map((m) => {
        const day = new Date(m.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
        return m.together ? `${day} · together · ${m.aDelta > 0 ? "won" : "lost"} (${signed(m.aDelta)})` : `${day} · ${aName} ${m.aPlace ? placeWord(m.aPlace) : "?"}, ${bName} ${m.bPlace ? placeWord(m.bPlace) : "?"}`;
      }).join("\n"),
      inline: false,
    }] : []),
  ];
  return {
    title: `${aName} vs ${bName} · ${MMR_GAMES[game].short}`,
    url: `${SITE_URL}/lounge/compare/${encodeURIComponent(aName)}/${encodeURIComponent(bName)}${game === "mkworld12p" ? "" : `?game=${game}`}`,
    description: h.events ? undefined : "They haven't played an event together this season.",
    color: 0x2b52d6,
    fields,
    footer: { text: "Head-to-head · gameshuffle.co/lounge" },
  };
}

/** `/gs-room names [me] [format] [game]`: what each place pays in a room, and who's favored (free). */
export async function handleGsRoom(interaction: Record<string, unknown>): Promise<Response> {
  const opts = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? []) as Opt[];
  const text = String(opts.find((o) => o.name === "names")?.value ?? "").slice(0, 2000);
  const me = (opts.find((o) => o.name === "me")?.value ?? "").trim().slice(0, 40) || null;
  const gameOpt = opts.find((o) => o.name === "game")?.value;
  const game: MmrGame = isMmrGame(gameOpt) ? gameOpt : "mkworld12p";
  const teamSize = [1, 2, 3, 4, 6].includes(Number(opts.find((o) => o.name === "format")?.value)) ? Number(opts.find((o) => o.name === "format")?.value) : 1;
  // Discord takes one line: teams are separated by slashes (Riley, Sam / Jo, Ana).
  const teams = parseRoom(teamSize > 1 ? text.split("/").join("\n") : text, teamSize);
  if (teams.length < 2) return ephemeralMessage(teamSize > 1 ? "Add at least two teams: names separated by commas, teams by slashes (Riley, Sam / Jo, Ana)." : "Add at least two names, separated by commas.");
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  after(async () => {
    try {
      const { read, players } = await lookUpRoom(teams, game, me, teamSize);
      const lineup = read.teams.map((t, i) => ({ t, i })).sort((a, b) => (b.t.rating ?? -1) - (a.t.rating ?? -1))
        .map(({ t, i }) => `${read.favorite === i ? "⭐ " : ""}${t.players.map((p) => p.name).join(" & ")} · ${t.rating != null ? fmtMmr(Math.round(t.rating)) : "not found"}${t.likely != null ? ` · likely ${t.likely.toFixed(1)}` : ""}`);
      const m = read.me;
      const fields = [
        { name: "Room average", value: read.average != null ? fmtMmr(read.average) : "?", inline: true },
        ...(m ? [
          { name: "Seed by MMR", value: `${placeWord(m.seed)} of ${m.pay.length}`, inline: true },
          { name: "Breaks even", value: m.breakEven ? placeWord(m.breakEven) : "Even 1st loses", inline: true },
          { name: "What each place pays", value: m.pay.map((v, i) => `${placeWord(i + 1)} ${signed(v)}`).join(" · "), inline: false },
        ] : []),
        { name: "The room", value: lineup.join("\n").slice(0, 1024), inline: false },
      ];
      const meName = m ? players[m.team].map((p) => p.name).join(" & ") : null;
      await followUp(appId, token, {
        embeds: [{
          title: `${meName ? `${meName}'s room` : "The room"} · ${MMR_GAMES[game].short}`,
          color: 0x2b52d6,
          description: read.missing.length ? `Not on the lounge: ${read.missing.join(", ")}.` : undefined,
          fields,
          footer: { text: "Payouts follow the lounge's formula as measured on real tables · gameshuffle.co/lounge" },
        }],
        components: [actionRow(linkButton(meName ? "Lounge page" : "Lounge stats", meName && players[m!.team].length === 1 ? `${SITE_URL}${loungePagePath(players[m!.team][0].name, game)}` : `${SITE_URL}/lounge`))],
      });
    } catch (err) {
      if (!(err instanceof LoungeUnavailable)) console.error("[gs-room]", err);
      await followUp(appId, token, { content: "The lounge isn't answering right now. Try again in a minute." });
    }
  });
  return deferredResponse();
}
