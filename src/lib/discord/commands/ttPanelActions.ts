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
 *   ttpc:<mode>:<ref> the cup menu, ttpt:<mode>:<ref> the track menu (mode top: ref = game; fix: ref = draft id)
 *   ttpb:<state>      the board's switches (this server / everyone, mushrooms, speed); ttpp:<state> posts it
 *   ttp:me:<game>     My times; ttpme:<game> posts it
 *
 * Discord menus hold 25 choices, so a track is two: its cup (24 in Mario Kart 8 Deluxe), then the cup's tracks.
 * A form can't open from a form, so the check message carries the buttons that open the next one.
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { canManageGuild } from "../guildOwner";
import { appOfApplicationId } from "../appIds";
import { addAppGuild, getAppGuild } from "../appGuilds";
import { isPanelGame, panelGameLabel, postPanel, TT_PANEL_PREFIX, type PanelGame } from "../ttPanel";
import { SITE_URL } from "@/lib/seo";
import { createServiceClient } from "@/lib/supabase/admin";
import { accountForDiscord } from "@/lib/daily/results";
import { discordActor } from "@/lib/timeTrials/players";
import { boardFor, noteGuildPlayer, playerBests, ttReady } from "@/lib/timeTrials/store";
import { readScreenshot, storeScreenshot } from "@/lib/timeTrials/read";
import { categoryText, isItems, isVehicle, VEHICLES, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import { formatTime, parseTime } from "@/lib/timeTrials/rules";
import { isClassFor, ttCups, ttTrack, TT_GAMES, TT_GAME_ORDER, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import { trackCode, trackTitle } from "@/lib/timeTrials/codes";
import { boardUrl, editOriginal, fetchAttachment, guildName, playerReply, LINK_URL, TT_NO_PREFIX, TT_OK_PREFIX, type Attachment } from "./timeTrials";

export const TT_PANEL_MODAL = "ttpm:";
export const TT_CUP_PREFIX = "ttpc:";
export const TT_TRACK_PREFIX = "ttpt:";
export const TT_BOARD_PREFIX = "ttpb:";
export const TT_POST_PREFIX = "ttpp:";
export const TT_MINE_POST = "ttpme:";
export const TT_FIXTRACK_PREFIX = "ttpk:";
export const TT_FIXTIME_PREFIX = "ttpx:";
export const TT_FIXTIME_MODAL = "ttpxm:";

/** Every button and menu prefix this file answers (the handler routes them here). */
export const TT_PANEL_COMPONENTS = [TT_PANEL_PREFIX, TT_CUP_PREFIX, TT_TRACK_PREFIX, TT_BOARD_PREFIX, TT_POST_PREFIX, TT_MINE_POST, TT_FIXTRACK_PREFIX, TT_FIXTIME_PREFIX];
export const TT_PANEL_MODALS = [TT_PANEL_MODAL, TT_FIXTIME_MODAL];

const EPHEMERAL = 64;
const COLOR = 0xf0b232;

const btn = (label: string, customId: string, style: 1 | 2 | 3 | 4 = 2, disabled = false) => ({ type: 2, style, label, custom_id: customId, ...(disabled ? { disabled: true } : {}) });
const link = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const row = (...components: unknown[]) => ({ type: 1, components });
const say = (data: Record<string, unknown>, ephemeral = true) =>
  Response.json({ type: 4, data: { allowed_mentions: { parse: [] }, ...data, ...(ephemeral ? { flags: EPHEMERAL } : {}) } });
const update = (data: Record<string, unknown>) => Response.json({ type: 7, data: { allowed_mentions: { parse: [] }, ...data } });
/** On a private message, change it in place; on the panel itself, answer with a new private one. */
const answer = (interaction: Record<string, unknown>, data: Record<string, unknown>) =>
  ((((interaction.message as { flags?: number } | undefined)?.flags ?? 0) & EPHEMERAL) !== 0 ? update(data) : say(data));

/** `read`: the time came from the screenshot (not typed), so it saves as read by AI. */
type DraftPayload = { game: TtGame; track: string | null; cc: TtClass; timeMs: number | null; read?: boolean; proofUrl: string | null; name: string; items: TtItems; vehicle: TtVehicle; via: "panel" };
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
const GONE = { content: "That's gone stale. Press Add a time on the panel again.", components: [] };

// ── Track menus ─────────────────────────────────────────────────────────────────────────────────

function cupLabel(cup: string): string {
  return /Mario Kart$/.test(cup) ? `${cup} courses` : `${cup} Cup`;
}

/** The cup menu, and once a cup is picked the menu of its tracks. */
function trackMenus(mode: "top" | "fix", ref: string, game: TtGame, cupIndex: number | null): unknown[] {
  const cups = ttCups(game);
  const menus: unknown[] = [row({
    type: 3, custom_id: `${TT_CUP_PREFIX}${mode}:${ref}`, placeholder: "Pick a cup",
    options: cups.map((c, i) => ({ label: cupLabel(c.cup), value: String(i), ...(i === cupIndex ? { default: true } : {}) })),
  })];
  if (cupIndex != null && cups[cupIndex]) {
    menus.push(row({
      type: 3, custom_id: `${TT_TRACK_PREFIX}${mode}:${ref}`, placeholder: "Pick a track",
      options: cups[cupIndex].tracks.map((t) => ({ label: t.name.slice(0, 100), value: t.id, ...(trackCode(t) ? { description: trackCode(t)! } : {}) })),
    }));
  }
  return menus;
}

function gameButtons(kind: "add" | "top"): Record<string, unknown> {
  return {
    content: "Which game?",
    components: [row(...TT_GAME_ORDER.map((g) => btn(TT_GAMES[g].label, `${TT_PANEL_PREFIX}${kind}:${g}`)))],
  };
}

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
  if (game === "mk8dx") {
    components.push({ type: 18, label: "Vehicle", description: "For the vehicle boards", component: {
      type: 21, custom_id: "veh", required: false,
      options: VEHICLES.map((v) => ({ value: v.id, label: v.id === "any" ? "Something else" : v.long, ...(v.id === "any" ? { default: true } : {}) })),
    } });
  }
  components.push({ type: 18, label: "Time", description: "Leave it empty and it's read from the screenshot", component: { type: 4, custom_id: "time", style: 1, required: false, max_length: 12, placeholder: "1:24.903" } });
  return { custom_id: `${TT_PANEL_MODAL}${game}`, title: "Add a time", components };
}

/** The private check before a panel time saves. */
function checkMessage(draftId: string, p: DraftPayload, note: string | null = null): Record<string, unknown> {
  const track = p.track ? ttTrack(p.game, p.track) : null;
  const lead = note ? [note] : [];
  if (!track) {
    return {
      content: [...lead, "Which track was it?"].join("\n"),
      components: [...trackMenus("fix", draftId, p.game, null), row(btn("Cancel", `${TT_NO_PREFIX}${draftId}`))],
    };
  }
  const cat = categoryText(p.game, p.cc, p.items, p.vehicle, TT_GAMES[p.game].classes.length > 1);
  const lines = [...lead, p.read ? "From your screenshot:" : "Check it before it saves:", `**${trackTitle(track)} · ${p.timeMs ? formatTime(p.timeMs) : "time not read"}**`, cat.replace(/^./, (c) => c.toUpperCase())];
  if (!p.timeMs) lines.push("I couldn't read every digit of the time. Press Type the time.");
  return {
    content: lines.join("\n"),
    components: [row(
      btn("Add it", `${TT_OK_PREFIX}${draftId}`, 3, !p.timeMs),
      btn("Change track", `${TT_FIXTRACK_PREFIX}${draftId}`),
      btn(p.timeMs ? "Change time" : "Type the time", `${TT_FIXTIME_PREFIX}${draftId}`, p.timeMs ? 2 : 1),
      btn("Cancel", `${TT_NO_PREFIX}${draftId}`),
    )],
  };
}

type ModalPart = { custom_id?: string; value?: string | null; values?: string[] };
function modalParts(interaction: Record<string, unknown>): Map<string, ModalPart> {
  const out = new Map<string, ModalPart>();
  const walk = (list: unknown[]) => {
    for (const c of list as { component?: ModalPart; components?: unknown[]; custom_id?: string }[]) {
      if (c.component?.custom_id) out.set(c.component.custom_id, c.component);
      else if (c.custom_id) out.set(c.custom_id, c as ModalPart);
      if (c.components) walk(c.components);
    }
  };
  walk(((interaction.data as { components?: unknown[] } | undefined)?.components) ?? []);
  return out;
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
  const vehicle: TtVehicle = game === "mk8dx" && isVehicle(vehRaw) ? vehRaw : "any";
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
      if (read.ok) {
        if (read.read.notResult) { await editOriginal(appId, token, { content: "That doesn't look like a time trial result screen. Press Add a time again with the screen that shows your time." }); return; }
        if (read.read.game && read.read.game !== game) note = `That looks like ${TT_GAMES[read.read.game].label}. This panel is for ${TT_GAMES[game].label}.`;
        else {
          trackId = read.read.trackId && ttTrack(game, read.read.trackId) ? read.read.trackId : null;
          readMs = read.read.timeMs;
        }
      } else if (read.error === "cap") note = typedMs ? "That's all the screenshots I can read for you today, so pick the track." : "That's all the screenshots I can read for you today, so pick the track and type the time.";
      // A typed time wins (as with /tt add), but a screenshot that reads differently is said out loud.
      if (!note && typedMs && readMs && typedMs !== readMs) note = `You typed ${formatTime(typedMs)}. The screenshot reads ${formatTime(readMs)}.`;
      const payload: DraftPayload = { game, track: trackId, cc: cc as TtClass, items: itemsRaw, vehicle, timeMs: typedMs ?? readMs, read: !typedMs && !!readMs, proofUrl: shot.url, name: actor.name, via: "panel" };
      const { data } = await createServiceClient().from("tt_drafts").insert({ player: actor.player, discord_id: user.id, guild_id: guildId, payload }).select("id").single();
      const draftId = (data as { id: string } | null)?.id;
      if (!draftId) { await editOriginal(appId, token, { content: "Something went wrong saving that. Try again." }); return; }
      await editOriginal(appId, token, checkMessage(draftId, payload, note));
    } catch (err) {
      console.error("[tt panel] add failed:", err);
      await editOriginal(appId, token, { content: "Something went wrong saving that. Try again." });
    }
  });
  return Response.json({ type: 5, data: { flags: EPHEMERAL } });
}

// ── Top ten ─────────────────────────────────────────────────────────────────────────────────────

/** A board view, kept in the buttons: game, track, speed, mushrooms, whose times. */
type BoardState = { game: TtGame; track: string; cc: TtClass; items: TtItems; scope: "server" | "everyone" };
const encodeState = (s: BoardState) => [s.game === "mk8dx" ? "d" : "w", s.track, s.cc, s.items === "none" ? "n" : "s", s.scope === "server" ? "s" : "e"].join(".");
function decodeState(raw: string): BoardState | null {
  const [g, track, cc, i, sc] = raw.split(".");
  const game: TtGame = g === "d" ? "mk8dx" : "mkworld";
  const n = Number(cc);
  if (!ttTrack(game, track) || !isClassFor(game, n)) return null;
  return { game, track, cc: n as TtClass, items: i === "n" ? "none" : "shrooms", scope: sc === "s" ? "server" : "everyone" };
}

async function boardMessage(s: BoardState, viewer: string, guildId: string | null, shared: boolean): Promise<Record<string, unknown>> {
  const track = ttTrack(s.game, s.track)!;
  const scope = guildId ? s.scope : "everyone";
  const board = await boardFor({ game: s.game, track: s.track, cc: s.cc, items: s.items, vehicle: "any", scope, viewer: viewer as never, guildId, limit: 10 });
  const lines = board.rows.map((r) => `${r.rank}. ${r.name} · **${formatTime(r.timeMs)}**${r.top ? (r.video === "checked" ? " · Verified" : " · Unverified") : ""}`);
  if (board.mine && !shared) lines.push(`…\n${board.mine.rank}. You · **${formatTime(board.mine.timeMs)}**`);
  const embed = {
    title: `${trackTitle(track)} · ${categoryText(s.game, s.cc, s.items, "any", TT_GAMES[s.game].classes.length > 1)}`,
    description: lines.length ? lines.join("\n") : scope === "server" ? "No times from this server yet. Press Everyone for every player on GameShuffle." : "No times yet. Be the first: press Add a time.",
    color: COLOR,
    ...(track.image ? { thumbnail: { url: track.image } } : {}),
    footer: { text: `${scope === "server" ? "This server" : "Everyone on GameShuffle"} · ${board.total} ${board.total === 1 ? "player" : "players"}` },
  };
  const full = link("Full board", boardUrl(track, s.cc, s.items, "any"));
  if (shared) return { embeds: [embed], components: [row(full)] };
  const to = (patch: Partial<BoardState>) => `${TT_BOARD_PREFIX}${encodeState({ ...s, ...patch })}`;
  const switches: unknown[] = [];
  if (guildId) {
    switches.push(btn("This server", to({ scope: "server" }), scope === "server" ? 1 : 2));
    switches.push(btn("Everyone", to({ scope: "everyone" }), scope === "everyone" ? 1 : 2));
  }
  switches.push(btn(s.items === "shrooms" ? "No mushrooms" : "Mushrooms", to({ items: s.items === "shrooms" ? "none" : "shrooms" })));
  const classes = TT_GAMES[s.game].classes;
  if (classes.length > 1) {
    const other = classes.find((c) => c !== s.cc)!;
    switches.push(btn(`${other}cc`, to({ cc: other })));
  }
  return {
    content: "",
    embeds: [embed],
    components: [row(...switches), row(btn("Another track", `${TT_PANEL_PREFIX}top:${s.game}`), btn("Post here", `${TT_POST_PREFIX}${encodeState({ ...s, scope })}`, 1), full)],
  };
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
      if (gameRaw === "both") return answer(interaction, gameButtons("add"));
      return Response.json({ type: 9, data: addForm(gameRaw) });
    }
    if (kind === "top") {
      if (gameRaw === "both") return answer(interaction, gameButtons("top"));
      return answer(interaction, { content: "Which track?", embeds: [], components: trackMenus("top", gameRaw, gameRaw, null) });
    }
    if (kind === "me") {
      const game = gameRaw === "both" ? null : gameRaw;
      after(async () => {
        try {
          const actor = await discordActor(user);
          const all = (await playerBests(actor.player)).filter((b) => b.items === "shrooms" && b.vehicle === "any");
          const msg = playerReply(actor.name, all, game, actor.player, null);
          if (!msg) { await editOriginal(appId, token, { content: `You have no ${game ? `${TT_GAMES[game].label} ` : ""}times yet. Press Add a time on the panel.` }); return; }
          const rows = (msg.components as { type: number; components: unknown[] }[]) ?? [];
          const first = rows[0] ?? row();
          first.components.push(btn("Post here", `${TT_MINE_POST}${gameRaw}`, 1));
          if (!actor.userId) first.components.push(link("Link to GameShuffle", LINK_URL));
          await editOriginal(appId, token, { ...msg, components: [first, ...rows.slice(1)] });
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

  if (customId.startsWith(TT_CUP_PREFIX) || customId.startsWith(TT_TRACK_PREFIX)) {
    const isCup = customId.startsWith(TT_CUP_PREFIX);
    const [mode, ref] = customId.slice(isCup ? TT_CUP_PREFIX.length : TT_TRACK_PREFIX.length).split(":");
    let game: TtGame | null = null;
    let draft: Draft | null = null;
    if (mode === "fix") {
      draft = await loadDraft(ref, user.id);
      if (!draft) return update(GONE);
      game = draft.payload.game;
    } else if (ref === "mk8dx" || ref === "mkworld") game = ref;
    if (!game || (mode !== "top" && mode !== "fix")) return say({ content: "That menu is out of date." });
    if (isCup) {
      const idx = Number(values[0]);
      return update({ content: "Which track?", embeds: [], components: [...trackMenus(mode, ref, game, Number.isInteger(idx) ? idx : null), ...(mode === "fix" ? [row(btn("Cancel", `${TT_NO_PREFIX}${ref}`))] : [])] });
    }
    const track = ttTrack(game, values[0] ?? "");
    if (!track) return say({ content: "Pick a track from the list." });
    if (mode === "fix" && draft) {
      const payload = { ...draft.payload, track: track.id };
      await saveDraft(ref, payload);
      return update(checkMessage(ref, payload));
    }
    const state: BoardState = { game, track: track.id, cc: TT_GAMES[game].classes[0], items: "shrooms", scope: guildId ? "server" : "everyone" };
    after(async () => {
      try {
        const actor = await discordActor(user);
        await editOriginal(appId, token, await boardMessage(state, actor.player, guildId, false));
      } catch (err) {
        console.error("[tt panel] board failed:", err);
        await editOriginal(appId, token, { content: "That board couldn't load. Try again in a moment.", embeds: [], components: [] });
      }
    });
    return Response.json({ type: 6 });
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
        await editOriginal(appId, token, { content: "That board couldn't load. Try again in a moment." });
      }
    });
    // Post here makes a new message for everyone; a switch changes the private one.
    return Response.json(shared ? { type: 5 } : { type: 6 });
  }

  if (customId.startsWith(TT_FIXTRACK_PREFIX)) {
    const id = customId.slice(TT_FIXTRACK_PREFIX.length);
    const draft = await loadDraft(id, user.id);
    if (!draft) return update(GONE);
    return update({ content: "Which track was it?", components: [...trackMenus("fix", id, draft.payload.game, null), row(btn("Cancel", `${TT_NO_PREFIX}${id}`))] });
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
    if (!draft) return update(GONE);
    const raw = String(modalParts(interaction).get("time")?.value ?? "").trim();
    const ms = parseTime(raw);
    if (!ms) return update(checkMessage(id, draft.payload, `Couldn't read "${raw.slice(0, 20)}" as a time. Type it like 1:24.903.`));
    const payload = { ...draft.payload, timeMs: ms, read: false };
    await saveDraft(id, payload);
    return update(checkMessage(id, payload));
  }
  return say({ content: "Unknown form." });
}
