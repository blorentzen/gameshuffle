/**
 * What the time trial panel's buttons do (GameShuffle Competitive; picks 2026-10-30, Nn8Qv4EVRDL6zojwHVCcdN).
 * Everything answers only the person who pressed, except Post here.
 *
 *   ttp:add:<game>    Add a time: the form (screenshot, category, vehicle, optional time); "both" asks the game first
 *   ttpm:<game>       the form sent: the track and time are read from the screenshot, then a check (Add it /
 *                     Change track / Change time / Cancel; Add it is ttok: in timeTrials.ts)
 *   ttpk:<draft>      Change track → the cup and track menus
 *   ttpx:<draft>      Change time → a one-line form, ttpxm:<draft>
 *   ttp:top:<game>    Top ten → the cup and track menus, then the board
 *   ttpc:<mode>:<ref> the cup menu, ttpt:<mode>:<ref>[:<n>] a track menu (mode top: ref = game; fix: ref = draft id)
 *   ttpv:<by>:<mode>:<ref> switches the picker between By track (every track A to Z) and By cup
 *   ttpb:<state>      the board's switches (this server / everyone, mushrooms, speed); ttpp:<state> posts it
 *   ttp:me:<game>     My times; ttpme:<game> posts it
 *
 * Discord menus hold 25 choices. By track (the default) spreads a game's tracks A to Z over as many menus as it
 * takes (four for Mario Kart 8 Deluxe's 96, two for World's 40); By cup is a cup menu, then that cup's tracks.
 * A form can't open from a form, so the check message carries the buttons that open the next one.
 *
 * Every message here is a card (src/lib/discord/ttCards.ts; picks 2026-11-12): the check is the same one /tt add shows,
 * and a card changed in place stays a card. A private message from before the cards gets a new private card instead.
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { canManageGuild } from "../guildOwner";
import { appOfApplicationId, commandName } from "../appIds";
import { addAppGuild, getAppGuild } from "../appGuilds";
import { isPanelGame, panelGameLabel, postPanel, type PanelGame } from "../ttPanel";
import { SITE_URL } from "@/lib/seo";
import { createServiceClient } from "@/lib/supabase/admin";
import { accountForDiscord } from "@/lib/daily/results";
import { discordActor } from "@/lib/timeTrials/players";
import { boardFor, noteGuildPlayer, playerBests, ttReady } from "@/lib/timeTrials/store";
import { recordLaps } from "@/lib/timeTrials/detail";
import { readScreenshot, storeScreenshot } from "@/lib/timeTrials/read";
import { isItems, vehicleFor, vehicleOptions, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import { parseTime } from "@/lib/timeTrials/rules";
import { isClassFor, ttTrack, TT_GAMES, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import { editOriginal, fetchAttachment, guildName, playerReply, type Attachment } from "./timeTrials";
import {
  boardCard, boardUrl, checkCard, decodeState, fixPickerCard, gameChoiceCard, lineMessage, modalParts, onCard, onPrivate, pickerCard, privately, statusWord,
  EPHEMERAL, type BoardLine, type BoardState, type CheckDraft, type Message, type PickBy,
  TT_BOARD_PREFIX, TT_CUP_PREFIX, TT_FIXTIME_MODAL, TT_FIXTIME_PREFIX, TT_FIXTRACK_PREFIX, TT_MINE_POST, TT_PANEL_MODAL, TT_PANEL_PREFIX, TT_POST_PREFIX, TT_TRACK_PREFIX, TT_VIEW_PREFIX,
} from "../ttCards";

export { TT_BOARD_PREFIX, TT_CUP_PREFIX, TT_FIXTIME_MODAL, TT_FIXTIME_PREFIX, TT_FIXTRACK_PREFIX, TT_MINE_POST, TT_PANEL_MODAL, TT_POST_PREFIX, TT_TRACK_PREFIX, TT_VIEW_PREFIX };

/** Every button and menu prefix this file answers (the handler routes them here). */
export const TT_PANEL_COMPONENTS = [TT_PANEL_PREFIX, TT_CUP_PREFIX, TT_TRACK_PREFIX, TT_VIEW_PREFIX, TT_BOARD_PREFIX, TT_POST_PREFIX, TT_MINE_POST, TT_FIXTRACK_PREFIX, TT_FIXTIME_PREFIX];
export const TT_PANEL_MODALS = [TT_PANEL_MODAL, TT_FIXTIME_MODAL];

const link = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const row = (...components: unknown[]) => ({ type: 1, components });
/** A new private reply: a card stays a card. */
const say = (data: Record<string, unknown>) => Response.json({ type: 4, data: privately({ allowed_mentions: { parse: [] }, ...data }) });
/**
 * On a private card (the picker, the check, a board), change it in place; on the panel itself, or on a private message
 * from before the cards (a message can't switch formats in place), answer with a new private card.
 */
const answer = (interaction: Record<string, unknown>, data: Message) =>
  (onPrivate(interaction) && onCard(interaction) ? Response.json({ type: 7, data: { allowed_mentions: { parse: [] }, ...data } }) : say(data));
/** A press whose answer comes later: in place on a private card, else in a new private message. */
const later = (interaction: Record<string, unknown>) =>
  Response.json(onPrivate(interaction) && onCard(interaction) ? { type: 6 } : { type: 5, data: { flags: EPHEMERAL } });

/** A draft from the panel (via "panel") or from /tt add, whose check has Change track and Change time too (pick 13).
 *  `read`: the time came from the screenshot (not typed), so it saves as read by AI. */
type DraftPayload = CheckDraft & { name: string; items: TtItems; vehicle: TtVehicle; via?: "panel" };
type Draft = { player: string; discord_id: string; guild_id: string | null; payload: DraftPayload; expires_at: string };

async function loadDraft(id: string, discordId: string): Promise<Draft | null> {
  const { data } = await createServiceClient().from("tt_drafts").select("player, discord_id, guild_id, payload, expires_at").eq("id", id).maybeSingle();
  const d = data as Draft | null;
  if (!d || d.discord_id !== discordId || new Date(d.expires_at).getTime() < Date.now()) return null;
  return d;
}
async function saveDraft(id: string, payload: DraftPayload): Promise<void> {
  await createServiceClient().from("tt_drafts").update({ payload }).eq("id", id);
}
/** A check or picker whose draft is gone (saved, cancelled or too old). */
const gone = (appId: string) => lineMessage(`That's gone stale. Start over with Add a time on the panel or ${`/${commandName(appOfApplicationId(appId), "tt")}`} add.`);

// ── The Add a time form and the check ───────────────────────────────────────────────────────────

function addForm(game: TtGame): Record<string, unknown> {
  const twoSpeeds = TT_GAMES[game].classes.length > 1;
  const cats = TT_GAMES[game].classes.flatMap((cc) => (["shrooms", "none"] as TtItems[]).map((items) => ({
    value: `${cc}:${items}`,
    label: `${twoSpeeds ? `${cc}cc ` : ""}${items === "none" ? "no mushrooms" : "mushrooms"}`.replace(/^./, (c) => c.toUpperCase()),
  })));
  cats[0] = { ...cats[0], default: true } as (typeof cats)[number];
  const components: unknown[] = [
    { type: 10, content: "The track and time are read from your screenshot. You'll see them before anything saves." },
    { type: 18, label: "Result screenshot", description: "The screen with your time; it's your proof", component: { type: 19, custom_id: "shot", min_values: 1, max_values: 1, required: true, file_types: ["image"] } },
    { type: 18, label: "Category", component: { type: 21, custom_id: "cat", required: true, options: cats } },
  ];
  const vehicles = vehicleOptions(game);
  if (vehicles.length > 1) {
    components.push({ type: 18, label: "Vehicle", description: "For the vehicle boards", component: {
      type: 21, custom_id: "veh", required: false,
      options: vehicles.map((v) => ({ value: v.id, label: v.id === "any" ? "Something else" : v.long, ...(v.id === "any" ? { default: true } : {}) })),
    } });
  }
  components.push({ type: 18, label: "Time", description: "Leave it empty and it's read from the screenshot", component: { type: 4, custom_id: "time", style: 1, required: false, max_length: 12, placeholder: "1:24.903" } });
  return { custom_id: `${TT_PANEL_MODAL}${game}`, title: "Add a time", components };
}

async function submitAddForm(interaction: Record<string, unknown>, game: TtGame): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return say({ content: "Couldn't tell who you are." });
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  if (!guildId) return say({ content: "Add times from the panel in a server." });
  const parts = modalParts(interaction);
  const shotId = parts.get("shot")?.values?.[0];
  const attachment = shotId ? ((interaction.data as { resolved?: { attachments?: Record<string, Attachment> } }).resolved?.attachments?.[shotId] ?? null) : null;
  if (!attachment) return say({ content: "Add the screenshot of your result: it's the proof for every time." });
  const [ccRaw, itemsRaw] = String(parts.get("cat")?.value ?? "").split(":");
  const cc = Number(ccRaw);
  if (!isClassFor(game, cc) || !isItems(itemsRaw)) return say({ content: "Pick a category." });
  const vehRaw = String(parts.get("veh")?.value ?? "any");
  const vehicle: TtVehicle = vehicleFor(game, vehRaw);
  const timeText = String(parts.get("time")?.value ?? "").trim();
  const typedMs = timeText ? parseTime(timeText) : null;
  if (timeText && !typedMs) return say({ content: `Couldn't read "${timeText.slice(0, 20)}" as a time. Type it like 1:24.903.` });

  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  after(async () => {
    try {
      if (!(await ttReady())) { await editOriginal(appId, token, { content: "Time trials aren't open yet. Try again soon." }); return; }
      const actor = await discordActor(user);
      await noteGuildPlayer(guildId, actor.player, await guildName(guildId));
      const bytes = await fetchAttachment(attachment);
      if (!bytes) { await editOriginal(appId, token, { content: "That screenshot couldn't be opened. Use a PNG or JPEG under 8 MB." }); return; }
      const shot = await storeScreenshot(bytes, actor.player.slice(2));
      if (!shot) { await editOriginal(appId, token, { content: "That screenshot couldn't be saved. Try again in a moment." }); return; }
      const read = await readScreenshot({ jpeg: shot.jpeg, game, userId: actor.userId, capKey: `d:${user.id}` });
      let note: string | null = null;
      let trackId: string | null = null;
      let readMs: number | null = null;
      let laps: number[] | null = null;
      if (read.ok) {
        if (read.read.notResult) { await editOriginal(appId, token, { content: "That doesn't look like a time trial result screen. Press Add a time again with the screen that shows your time." }); return; }
        if (read.read.game && read.read.game !== game) note = `That looks like ${TT_GAMES[read.read.game].label}. This panel is for ${TT_GAMES[game].label}.`;
        else {
          trackId = read.read.trackId && ttTrack(game, read.read.trackId) ? read.read.trackId : null;
          readMs = read.read.timeMs;
          laps = read.read.laps;
        }
      } else if (read.error === "cap") note = typedMs ? "That's all the screenshots I can read for you today, so pick the track." : "That's all the screenshots I can read for you today, so pick the track and type the time.";
      // A typed time wins (as with /tt add); a screenshot that reads differently is a warning on the check (checkWarnings).
      const payload: DraftPayload = { game, track: trackId, cc: cc as TtClass, items: itemsRaw, vehicle, timeMs: typedMs ?? readMs, read: !typedMs && !!readMs, proofUrl: shot.url, name: actor.name, via: "panel", readMs, laps };
      const { data } = await createServiceClient().from("tt_drafts").insert({ player: actor.player, discord_id: user.id, guild_id: guildId, payload }).select("id").single();
      const draftId = (data as { id: string } | null)?.id;
      if (!draftId) { await editOriginal(appId, token, { content: "Something went wrong saving that. Try again." }); return; }
      await editOriginal(appId, token, checkCard(draftId, payload, note));
    } catch (err) {
      console.error("[tt panel] add failed:", err);
      await editOriginal(appId, token, { content: "Something went wrong saving that. Try again." });
    }
  });
  return Response.json({ type: 5, data: { flags: EPHEMERAL } });
}

// ── Top ten ─────────────────────────────────────────────────────────────────────────────────────

/** Top ten on the panel (private, with the switches) or posted for everyone (Post here): the same card as /tt track. */
async function boardMessage(s: BoardState, viewer: string, guildId: string | null, shared: boolean): Promise<Message> {
  const track = ttTrack(s.game, s.track)!;
  const scope = guildId ? s.scope : "everyone";
  const shown: BoardState = { ...s, scope };
  const [board, rec] = await Promise.all([
    boardFor({ game: s.game, track: s.track, cc: s.cc, items: s.items, vehicle: "any", scope, viewer: viewer as never, guildId, limit: 10 }),
    recordLaps({ game: s.game, track: s.track, cc: s.cc, items: s.items, board: "any" }).catch(() => null),
  ]);
  const line = (r: typeof board.rows[number]): BoardLine => ({ rank: r.rank, name: r.name, country: r.country, timeMs: r.timeMs, status: statusWord(r) });
  return boardCard({
    track, cc: s.cc, items: s.items, total: board.total,
    scopeLabel: scope === "server" ? "This server" : "Everyone on GameShuffle",
    rows: board.rows.map(line),
    // Post here leaves out your place: the post is for everyone.
    mine: board.mine && !shared ? line(board.mine) : null,
    recordLaps: board.rows.length && rec ? { name: rec.name, laps: rec.laps } : null,
    empty: scope === "server" ? "No times from this server yet. Press Everyone for every player on GameShuffle." : shared ? "No times yet." : "No times yet. Be the first: press Add a time.",
    fullUrl: boardUrl(track, s.cc, s.items, "any"),
    live: shared ? null : { state: shown, guild: !!guildId },
  });
}

// ── The /tt panel command ───────────────────────────────────────────────────────────────────────

const POST_ERRORS: Record<string, string> = {
  no_access: "I can't post in this channel. Give GameShuffle Competitive Send Messages here, or post the panel from the site.",
  no_channel: "I can't find this channel.",
  not_connected: "This server isn't connected to GameShuffle yet.",
  failed: "The panel couldn't be posted. Try again in a moment.",
};

/** /tt panel [game]: posts this server's panel here (people who can manage the server). */
export function handleTtPanelCommand(interaction: Record<string, unknown>, gameRaw: string): Response {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say({ content: "The time trial panel comes with GameShuffle Competitive." });
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const channelId = (interaction.channel_id as string | undefined) ?? ((interaction.channel as { id?: string } | undefined)?.id ?? null);
  if (!guildId || !channelId) return say({ content: "Post the panel in a server's channel." });
  if (!canManageGuild(interaction)) return say({ content: "Only people who can manage this server can post the panel." });
  const game: PanelGame = isPanelGame(gameRaw) ? gameRaw : "mk8dx";
  const user = getDiscordUser(interaction);
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  after(async () => {
    try {
      if (!(await getAppGuild("comp", guildId))) {
        const account = user?.id ? await accountForDiscord(user.id) : null;
        const added = account ? await addAppGuild(account, "comp", guildId, await guildName(guildId)) : null;
        if (!added?.ok) {
          const why = added && !added.ok && added.error === "server_limit" ? "Your GameShuffle account is at its server limit for GameShuffle Competitive." : added && !added.ok && added.error === "server_taken" ? "Another GameShuffle account manages this server." : "Connect this server to GameShuffle first.";
          await editOriginal(appId, token, { content: `${why} Add it from GameShuffle, then post the panel again.`, components: [row(link("Connect on GameShuffle", `${SITE_URL}/discord/add?app=comp`))] });
          return;
        }
      }
      const res = await postPanel(guildId, channelId, game);
      if (!res.ok) { await editOriginal(appId, token, { content: POST_ERRORS[res.error] ?? POST_ERRORS.failed }); return; }
      await editOriginal(appId, token, { content: `The ${panelGameLabel(game) === "Both games" ? "time trial" : panelGameLabel(game)} panel is up. It updates itself as times come in.${res.pinned ? "" : " Pin it so it stays at the top (I can't pin messages in this channel)."}` });
    } catch (err) {
      console.error("[tt panel] command failed:", err);
      await editOriginal(appId, token, { content: POST_ERRORS.failed });
    }
  });
  return Response.json({ type: 5, data: { flags: EPHEMERAL } });
}

// ── Buttons and menus ───────────────────────────────────────────────────────────────────────────

export async function handleTtPanelComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return say({ content: "Couldn't tell who you are." });
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  const values = ((interaction.data as { values?: string[] } | undefined)?.values) ?? [];

  if (customId.startsWith(TT_PANEL_PREFIX)) {
    const [kind, gameRaw] = customId.slice(TT_PANEL_PREFIX.length).split(":");
    if (!isPanelGame(gameRaw)) return say({ content: "That panel is out of date. Ask a server manager to post it again." });
    if (kind === "add") {
      if (gameRaw === "both") return answer(interaction, gameChoiceCard("add"));
      return Response.json({ type: 9, data: addForm(gameRaw) });
    }
    if (kind === "top") {
      if (gameRaw === "both") return answer(interaction, gameChoiceCard("top"));
      return answer(interaction, pickerCard("top", gameRaw, gameRaw, "track"));
    }
    if (kind === "me") {
      const game = gameRaw === "both" ? null : gameRaw;
      after(async () => {
        try {
          const actor = await discordActor(user);
          const all = (await playerBests(actor.player)).filter((b) => b.items === "shrooms" && b.vehicle === "any");
          // The same card as /tt player, private, with Post here first in the bottom row.
          const msg = playerReply(actor.name, all, game, actor.player, null, { post: `${TT_MINE_POST}${gameRaw}`, unlinked: !actor.userId });
          if (!msg) { await editOriginal(appId, token, { content: `You have no ${game ? `${TT_GAMES[game].label} ` : ""}times yet. Press Add a time on the panel.` }); return; }
          await editOriginal(appId, token, msg);
        } catch (err) {
          console.error("[tt panel] my times failed:", err);
          await editOriginal(appId, token, { content: "Your times couldn't load. Try again in a moment." });
        }
      });
      return Response.json({ type: 5, data: { flags: EPHEMERAL } });
    }
    return say({ content: "Unknown button." });
  }

  if (customId.startsWith(TT_MINE_POST)) {
    const gameRaw = customId.slice(TT_MINE_POST.length);
    const game = isPanelGame(gameRaw) && gameRaw !== "both" ? gameRaw : null;
    after(async () => {
      const actor = await discordActor(user);
      const all = (await playerBests(actor.player)).filter((b) => b.items === "shrooms" && b.vehicle === "any");
      const msg = playerReply(actor.name, all, game, actor.player, null);
      await editOriginal(appId, token, msg ?? { content: `${actor.name} has no times yet.` });
    });
    return Response.json({ type: 5 });
  }

  if (customId.startsWith(TT_VIEW_PREFIX)) {
    const [by, mode, ref] = customId.slice(TT_VIEW_PREFIX.length).split(":");
    if ((by !== "track" && by !== "cup") || (mode !== "top" && mode !== "fix")) return say({ content: "That menu is out of date." });
    if (mode === "fix") {
      const draft = await loadDraft(ref, user.id);
      if (!draft) return answer(interaction, gone(appId));
      return answer(interaction, fixPickerCard(ref, draft.payload, by as PickBy));
    }
    if (ref !== "mk8dx" && ref !== "mkworld") return say({ content: "That menu is out of date." });
    return answer(interaction, pickerCard("top", ref, ref, by as PickBy));
  }

  if (customId.startsWith(TT_CUP_PREFIX) || customId.startsWith(TT_TRACK_PREFIX)) {
    const isCup = customId.startsWith(TT_CUP_PREFIX);
    const [mode, ref] = customId.slice(isCup ? TT_CUP_PREFIX.length : TT_TRACK_PREFIX.length).split(":");
    let game: TtGame | null = null;
    let draft: Draft | null = null;
    if (mode === "fix") {
      draft = await loadDraft(ref, user.id);
      if (!draft) return answer(interaction, gone(appId));
      game = draft.payload.game;
    } else if (ref === "mk8dx" || ref === "mkworld") game = ref;
    if (!game || (mode !== "top" && mode !== "fix")) return say({ content: "That menu is out of date." });
    if (isCup) {
      const idx = Number(values[0]);
      const cup = Number.isInteger(idx) ? idx : null;
      return answer(interaction, mode === "fix" && draft ? fixPickerCard(ref, draft.payload, "cup", cup) : pickerCard("top", ref, game, "cup", cup));
    }
    const track = ttTrack(game, values[0] ?? "");
    if (!track) return say({ content: "Pick a track from the list." });
    if (mode === "fix" && draft) {
      const payload = { ...draft.payload, track: track.id };
      await saveDraft(ref, payload);
      return answer(interaction, checkCard(ref, payload));
    }
    const state: BoardState = { game, track: track.id, cc: TT_GAMES[game].classes[0], items: "shrooms", scope: guildId ? "server" : "everyone" };
    after(async () => {
      try {
        const actor = await discordActor(user);
        await editOriginal(appId, token, await boardMessage(state, actor.player, guildId, false));
      } catch (err) {
        console.error("[tt panel] board failed:", err);
        await editOriginal(appId, token, lineMessage("That board couldn't load. Try again in a moment."));
      }
    });
    return later(interaction);
  }

  if (customId.startsWith(TT_BOARD_PREFIX) || customId.startsWith(TT_POST_PREFIX)) {
    const shared = customId.startsWith(TT_POST_PREFIX);
    const state = decodeState(customId.slice(shared ? TT_POST_PREFIX.length : TT_BOARD_PREFIX.length));
    if (!state) return say({ content: "That board is out of date. Press Top ten again." });
    after(async () => {
      try {
        const actor = await discordActor(user);
        await editOriginal(appId, token, await boardMessage(state, actor.player, guildId, shared));
      } catch (err) {
        console.error("[tt panel] board failed:", err);
        await editOriginal(appId, token, lineMessage("That board couldn't load. Try again in a moment."));
      }
    });
    // Post here makes a new message for everyone; a switch changes the private one.
    return shared ? Response.json({ type: 5 }) : later(interaction);
  }

  if (customId.startsWith(TT_FIXTRACK_PREFIX)) {
    const id = customId.slice(TT_FIXTRACK_PREFIX.length);
    const draft = await loadDraft(id, user.id);
    if (!draft) return answer(interaction, gone(appId));
    return answer(interaction, fixPickerCard(id, draft.payload));
  }

  if (customId.startsWith(TT_FIXTIME_PREFIX)) {
    const id = customId.slice(TT_FIXTIME_PREFIX.length);
    return Response.json({ type: 9, data: {
      custom_id: `${TT_FIXTIME_MODAL}${id}`,
      title: "Your time",
      components: [{ type: 18, label: "Time", description: "Like 1:24.903", component: { type: 4, custom_id: "time", style: 1, required: true, max_length: 12, placeholder: "1:24.903" } }],
    } });
  }

  return say({ content: "Unknown button." });
}

// ── Forms ───────────────────────────────────────────────────────────────────────────────────────

export async function handleTtPanelModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  if (customId.startsWith(TT_PANEL_MODAL)) {
    const game = customId.slice(TT_PANEL_MODAL.length);
    if (game !== "mk8dx" && game !== "mkworld") return say({ content: "That form is out of date. Press Add a time again." });
    return submitAddForm(interaction, game);
  }
  if (customId.startsWith(TT_FIXTIME_MODAL)) {
    const user = getDiscordUser(interaction);
    if (!user?.id) return say({ content: "Couldn't tell who you are." });
    const id = customId.slice(TT_FIXTIME_MODAL.length);
    const draft = await loadDraft(id, user.id);
    const appId = String(interaction.application_id ?? "");
    if (!draft) return answer(interaction, gone(appId));
    const raw = String(modalParts(interaction).get("time")?.value ?? "").trim();
    const ms = parseTime(raw);
    if (!ms) return answer(interaction, checkCard(id, draft.payload, `Couldn't read "${raw.slice(0, 20)}" as a time. Type it like 1:24.903.`));
    const payload = { ...draft.payload, timeMs: ms, read: false };
    await saveDraft(id, payload);
    return answer(interaction, checkCard(id, payload));
  }
  return say({ content: "Unknown form." });
}
