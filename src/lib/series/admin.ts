import "server-only";

/**
 * What organizers (staff and admins) do to a team series: set it up, its teams and players, its nights and
 * their tournaments, the champions, the best play clips, the POV checklist and GS Pro for the players.
 * Errors are plain sentences for a toast.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { generateShareToken } from "@/lib/tournaments";
import { giveProUntil, endGifts, liveGiftsFor } from "@/lib/billing/proGifts";
import { forgetCards } from "./cards";
import { forgetView, loadSeries, SERIES_COLS, type Loaded, type PlayerDb, type SeriesDb } from "./store";
import { slugOk, TEAM_COLORS, type PlayerRole, type SeriesStatus } from "./rules";
import { readSettings, type SeriesSettings } from "./view";
import { baseBank } from "./tracks";

export type Done = { ok: true } | { ok: false; error: string };
const fail = (error: string): Done => ({ ok: false, error });
const OK: Done = { ok: true };

function touched(l: Loaded) { forgetView(l.series.slug); forgetCards(l.series.id); }

/** The default FAQ for a new series; organizers edit it. */
export const DEFAULT_FAQ: { q: string; a: string }[] = [
  { q: "How do I watch?", a: "Every player streams both nights. Pick any of them from the Teams tab; each stream shows the standings, with that streamer's team lit up." },
  { q: "How do predictions work?", a: "On a player's live page, put GameShuffle tokens on how a team or player does. Predictions close when the first race starts and pay out on their own after the last. Tokens can't be bought or cashed out." },
  { q: "How are races scored?", a: "Teams of two, six teams in one room. Both players' points add up for the team, race by race." },
  { q: "Where do I ask a question?", a: "In the GameShuffle Discord, or through the contact form (pick Summer Series)." },
];

export async function createSeries(by: string, input: { slug: string; title: string }): Promise<{ ok: true; series: SeriesDb } | { ok: false; error: string }> {
  const slug = input.slug.trim().toLowerCase();
  const title = input.title.trim().slice(0, 80);
  if (!slugOk(slug)) return { ok: false, error: "The address can use lowercase letters, numbers and dashes (3 to 60)." };
  if (!title) return { ok: false, error: "Give the series a name." };
  const settings: Partial<SeriesSettings> = { bank: baseBank(), target: 24, turnSeconds: 60, faq: DEFAULT_FAQ, rules: "" };
  const admin = createServiceClient();
  const { data, error } = await admin.from("gs_series").insert({ slug, title, settings, created_by: by }).select(SERIES_COLS).single();
  if (error) return { ok: false, error: error.code === "23505" ? "Another series has that address." : "Couldn't make the series. Try again." };
  const series = data as SeriesDb;
  await admin.from("gs_series_nights").insert([
    { series_id: series.id, n: 1, label: "Kickoff", counts: false },
    { series_id: series.id, n: 2, label: "Final", counts: true },
  ]);
  return { ok: true, series };
}

export async function updateSeries(l: Loaded, patch: { title?: string; tagline?: string | null; status?: SeriesStatus; slug?: string; settings?: Partial<SeriesSettings> }): Promise<Done> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) { const t = patch.title.trim().slice(0, 80); if (!t) return fail("Give the series a name."); row.title = t; }
  if (patch.tagline !== undefined) row.tagline = patch.tagline?.trim().slice(0, 200) || null;
  if (patch.status !== undefined) {
    if (!["draft", "announced", "live", "finished"].includes(patch.status)) return fail("Pick a stage.");
    row.status = patch.status;
  }
  if (patch.slug !== undefined) { const s = patch.slug.trim().toLowerCase(); if (!slugOk(s)) return fail("The address can use lowercase letters, numbers and dashes (3 to 60)."); row.slug = s; }
  if (patch.settings) row.settings = readSettings({ ...l.series.settings, ...patch.settings });
  const { error } = await createServiceClient().from("gs_series").update(row).eq("id", l.series.id);
  if (error) return fail(error.code === "23505" ? "Another series has that address." : "Couldn't save that. Try again.");
  touched(l);
  if (row.slug) forgetView(String(row.slug));
  return OK;
}

// ── Teams ─────────────────────────────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function saveTeam(l: Loaded, input: { id?: string; name: string; tag: string; color?: string; look?: string | null }): Promise<Done> {
  const name = input.name.trim().slice(0, 40);
  const tag = input.tag.trim().toUpperCase().slice(0, 4);
  if (!name) return fail("Give the team a name.");
  if (!/^[A-Z0-9]{1,4}$/.test(tag)) return fail("A tag is one to four letters or numbers.");
  const admin = createServiceClient();
  const color = input.color && HEX.test(input.color) ? input.color : TEAM_COLORS[l.teams.length % TEAM_COLORS.length];
  const look = input.look?.trim().slice(0, 60) || null;
  if (input.id) {
    if (!l.teams.some((t) => t.id === input.id)) return fail("That team isn't in this series.");
    const { error } = await admin.from("gs_series_teams").update({ name, tag, color, look }).eq("id", input.id);
    if (error) return fail(error.code === "23505" ? "Another team has that tag." : "Couldn't save the team.");
  } else {
    if (l.teams.length >= 12) return fail("A series has 12 teams at most.");
    const n = Math.max(0, ...l.teams.map((t) => t.n)) + 1;
    const { error } = await admin.from("gs_series_teams").insert({ series_id: l.series.id, n, name, tag, color, look });
    if (error) return fail(error.code === "23505" ? "Another team has that tag." : "Couldn't add the team.");
  }
  touched(l);
  return OK;
}

export async function removeTeam(l: Loaded, teamId: string): Promise<Done> {
  if (!l.teams.some((t) => t.id === teamId)) return fail("That team isn't in this series.");
  const started = l.nights.some((n) => ((n.draft as { turns?: unknown[] })?.turns ?? []).length > 0);
  if (started) return fail("A draft has started with this team. Reset it first.");
  await createServiceClient().from("gs_series_teams").delete().eq("id", teamId);
  touched(l);
  return OK;
}

// ── Players ───────────────────────────────────────────────────────────────────────────────────────

/** Finds an account by GameShuffle username (with or without @), or by Twitch login. */
export async function findAccount(handle: string): Promise<{ id: string; name: string } | null> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_.-]{2,40}$/.test(h)) return null;
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("id, display_name, username").eq("username", h).maybeSingle();
  if (data) { const u = data as { id: string; display_name: string | null; username: string }; return { id: u.id, name: u.display_name || u.username }; }
  const { data: tw } = await admin.from("twitch_connections").select("user_id, twitch_display_name").eq("twitch_login", h).maybeSingle();
  if (tw) { const t = tw as { user_id: string; twitch_display_name: string | null }; return { id: t.user_id, name: t.twitch_display_name || h }; }
  return null;
}

export async function savePlayer(l: Loaded, input: { id?: string; teamId: string; role: PlayerRole; handle?: string; name?: string; hours?: number | null }): Promise<Done> {
  if (!l.teams.some((t) => t.id === input.teamId)) return fail("Pick a team.");
  if (input.role !== "competitive" && input.role !== "creator") return fail("Pick a role.");
  const admin = createServiceClient();
  let userId: string | null | undefined;
  let name = input.name?.trim().slice(0, 40) ?? "";
  if (input.handle?.trim()) {
    const acct = await findAccount(input.handle);
    if (!acct) return fail("No GameShuffle account with that username or Twitch name.");
    if (l.players.some((p) => p.user_id === acct.id && p.id !== input.id)) return fail("That account is already in this series.");
    userId = acct.id;
    if (!name) name = acct.name.slice(0, 40);
  }
  if (!name && !input.id) return fail("Add their username, or a name for someone without an account.");
  const hours = input.hours == null ? null : Math.max(0, Math.min(100000, Math.round(Number(input.hours) || 0)));
  if (input.id) {
    const cur = l.players.find((p) => p.id === input.id);
    if (!cur) return fail("That player isn't in this series.");
    const row: Record<string, unknown> = { team_id: input.teamId, role: input.role, hours };
    if (name) row.name = name;
    if (userId !== undefined) row.user_id = userId;
    const { error } = await admin.from("gs_series_players").update(row).eq("id", cur.id);
    if (error) return fail("Couldn't save the player.");
  } else {
    const { error } = await admin.from("gs_series_players").insert({ series_id: l.series.id, team_id: input.teamId, role: input.role, user_id: userId ?? null, name, hours });
    if (error) return fail(error.code === "23505" ? "That account is already in this series." : "Couldn't add the player.");
  }
  touched(l);
  return OK;
}

export async function removePlayer(l: Loaded, playerId: string): Promise<Done> {
  if (!l.players.some((p) => p.id === playerId)) return fail("That player isn't in this series.");
  await createServiceClient().from("gs_series_players").delete().eq("id", playerId);
  touched(l);
  return OK;
}

/** A player's own edits to their card: hours played and which saved kart build it shows. */
export async function editOwnCard(l: Loaded, player: PlayerDb, patch: { hours?: number | null; kartConfigId?: string | null }): Promise<Done> {
  const row: Record<string, unknown> = {};
  if (patch.hours !== undefined) row.hours = patch.hours == null ? null : Math.max(0, Math.min(100000, Math.round(Number(patch.hours) || 0)));
  if (patch.kartConfigId !== undefined) {
    if (patch.kartConfigId) {
      const { data } = await createServiceClient().from("saved_configs").select("id").eq("id", patch.kartConfigId).eq("user_id", player.user_id ?? "").maybeSingle();
      if (!data) return fail("That kart build isn't one of yours.");
    }
    row.kart_config_id = patch.kartConfigId || null;
  }
  if (!Object.keys(row).length) return OK;
  const { error } = await createServiceClient().from("gs_series_players").update(row).eq("id", player.id);
  if (error) return fail("Couldn't save that.");
  touched(l);
  return OK;
}

// ── Nights ────────────────────────────────────────────────────────────────────────────────────────

export async function saveNight(l: Loaded, input: { id?: string; label?: string; startsAt?: string | null; counts?: boolean; hostTeamId?: string | null; tournamentId?: string | null }): Promise<Done> {
  const admin = createServiceClient();
  const row: Record<string, unknown> = {};
  if (input.label !== undefined) { const t = input.label.trim().slice(0, 40); if (!t) return fail("Give the night a name."); row.label = t; }
  if (input.startsAt !== undefined) {
    if (input.startsAt && Number.isNaN(Date.parse(input.startsAt))) return fail("That date doesn't look right.");
    row.starts_at = input.startsAt || null;
  }
  if (input.counts !== undefined) row.counts = !!input.counts;
  if (input.hostTeamId !== undefined) {
    if (input.hostTeamId && !l.teams.some((t) => t.id === input.hostTeamId)) return fail("Pick a team.");
    row.host_team_id = input.hostTeamId || null;
  }
  if (input.tournamentId !== undefined) {
    if (input.tournamentId) {
      const { data } = await admin.from("tournaments").select("id").eq("id", input.tournamentId).maybeSingle();
      if (!data) return fail("No tournament with that id.");
    }
    row.tournament_id = input.tournamentId || null;
  }
  if (input.id) {
    if (!l.nights.some((n) => n.id === input.id)) return fail("That night isn't in this series.");
    const { error } = await admin.from("gs_series_nights").update(row).eq("id", input.id);
    if (error) return fail(error.code === "23505" ? "That tournament is already another night's." : "Couldn't save the night.");
  } else {
    if (l.nights.length >= 20) return fail("A series has 20 nights at most.");
    const n = Math.max(0, ...l.nights.map((x) => x.n)) + 1;
    const { error } = await admin.from("gs_series_nights").insert({ series_id: l.series.id, n, label: (row.label as string) || `Night ${n}`, ...row });
    if (error) return fail("Couldn't add the night.");
  }
  touched(l);
  return OK;
}

export async function removeNight(l: Loaded, nightId: string): Promise<Done> {
  const night = l.nights.find((n) => n.id === nightId);
  if (!night) return fail("That night isn't in this series.");
  if (night.tournament_id) return fail("This night has a tournament. Unlink it first.");
  await createServiceClient().from("gs_series_nights").delete().eq("id", nightId);
  touched(l);
  return OK;
}

/**
 * Makes a night's tournament: an official GameShuffle event (hosted as GameShuffle), points race of 12 in
 * teams of two, with every player already in on their team. The organizer is the staff member who made it.
 */
export async function createNightTournament(l: Loaded, nightId: string, organizerId: string): Promise<{ ok: true; tournamentId: string } | { ok: false; error: string }> {
  const night = l.nights.find((n) => n.id === nightId);
  if (!night) return { ok: false, error: "That night isn't in this series." };
  if (night.tournament_id) return { ok: false, error: "This night already has a tournament." };
  if (l.teams.length < 2) return { ok: false, error: "Add the teams first." };
  const admin = createServiceClient();
  const { data, error } = await admin.from("tournaments").insert({
    organizer_id: organizerId,
    title: `${l.series.title}: ${night.label}`.slice(0, 120),
    description: l.series.tagline,
    game_slug: l.series.game_slug,
    format: "ffa_points",
    mode: "2",
    acceptance_mode: "manual",
    date_time: night.starts_at,
    max_participants: Math.max(2, l.players.length),
    share_token: generateShareToken(),
    status: "open",
    hosted_by_gs: true,
    settings: { raceCount: 12, cc: "150cc", items: "normal", cpu: "none", game_label: "Mario Kart 8 Deluxe", locationType: "online", location: null, series: { id: l.series.id, slug: l.series.slug, title: l.series.title, nightId: night.id } },
  }).select("id").single();
  if (error || !data) return { ok: false, error: "Couldn't make the tournament. Try again." };
  const tid = (data as { id: string }).id;
  const teamN = new Map(l.teams.map((t) => [t.id, t.n]));
  if (l.players.length) {
    await admin.from("tournament_participants").insert(l.players.map((p) => ({ tournament_id: tid, user_id: p.user_id, display_name: p.name, team: teamN.get(p.team_id) ?? null, status: "confirmed" })));
  }
  await admin.from("gs_series_nights").update({ tournament_id: tid }).eq("id", night.id);
  touched(l);
  return { ok: true, tournamentId: tid };
}

/** Puts players added after a night's tournament was made into it (and moves anyone whose team changed). */
export async function syncNightPlayers(l: Loaded, nightId: string): Promise<{ ok: true; added: number; moved: number } | { ok: false; error: string }> {
  const night = l.nights.find((n) => n.id === nightId);
  if (!night?.tournament_id) return { ok: false, error: "Make the night's tournament first." };
  const admin = createServiceClient();
  const { data } = await admin.from("tournament_participants").select("id, user_id, display_name, team").eq("tournament_id", night.tournament_id);
  const rows = (data ?? []) as { id: string; user_id: string | null; display_name: string; team: number | null }[];
  const teamN = new Map(l.teams.map((t) => [t.id, t.n]));
  let added = 0, moved = 0;
  for (const p of l.players) {
    const want = teamN.get(p.team_id) ?? null;
    const row = rows.find((r) => (p.user_id && r.user_id === p.user_id) || (!p.user_id && r.display_name.toLowerCase() === p.name.toLowerCase()));
    if (!row) {
      const { error } = await admin.from("tournament_participants").insert({ tournament_id: night.tournament_id, user_id: p.user_id, display_name: p.name, team: want, status: "confirmed" });
      if (!error) added += 1;
    } else if (row.team !== want) {
      await admin.from("tournament_participants").update({ team: want }).eq("id", row.id);
      moved += 1;
    }
  }
  touched(l);
  return { ok: true, added, moved };
}

// ── Champions, best play, POV, GS Pro ─────────────────────────────────────────────────────────────

export async function crown(l: Loaded, teamId: string | null): Promise<Done> {
  if (teamId && !l.teams.some((t) => t.id === teamId)) return fail("Pick a team.");
  const { error } = await createServiceClient().from("gs_series").update({ champion_team_id: teamId, crowned_at: teamId ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", l.series.id);
  if (error) return fail("Couldn't save the champions.");
  touched(l);
  return OK;
}

export async function addPlay(l: Loaded, input: { title: string; url: string; playerId?: string | null; nightId?: string | null }): Promise<Done> {
  const title = input.title.trim().slice(0, 80);
  const url = input.url.trim();
  if (!title) return fail("Give the clip a short title.");
  if (!/^https:\/\/\S{3,300}$/.test(url)) return fail("The clip needs a full https link.");
  const { count } = await createServiceClient().from("gs_series_plays").select("id", { count: "exact", head: true }).eq("series_id", l.series.id);
  if ((count ?? 0) >= 12) return fail("Twelve clips at most.");
  const { error } = await createServiceClient().from("gs_series_plays").insert({
    series_id: l.series.id, title, url, sort: count ?? 0,
    player_id: input.playerId && l.players.some((p) => p.id === input.playerId) ? input.playerId : null,
    night_id: input.nightId && l.nights.some((n) => n.id === input.nightId) ? input.nightId : null,
  });
  if (error) return fail("Couldn't add the clip.");
  touched(l);
  return OK;
}

export async function removePlay(l: Loaded, playId: string): Promise<Done> {
  await createServiceClient().from("gs_series_plays").delete().eq("id", playId).eq("series_id", l.series.id);
  touched(l);
  return OK;
}

/** A viewer's best play vote (one per account per series; voting again moves it). */
export async function votePlay(l: Loaded, userId: string, playId: string): Promise<Done> {
  const { data } = await createServiceClient().from("gs_series_plays").select("id").eq("id", playId).eq("series_id", l.series.id).maybeSingle();
  if (!data) return fail("That clip isn't here any more.");
  const { error } = await createServiceClient().from("gs_series_play_votes").upsert({ series_id: l.series.id, user_id: userId, play_id: playId, created_at: new Date().toISOString() }, { onConflict: "series_id,user_id" });
  if (error) return fail("Couldn't save your vote.");
  touched(l);
  return OK;
}

export async function setPov(l: Loaded, playerId: string, pov: "none" | "sent" | "checked", note?: string | null): Promise<Done> {
  if (!l.players.some((p) => p.id === playerId)) return fail("That player isn't in this series.");
  const row: Record<string, unknown> = { pov };
  if (note !== undefined) row.pov_note = note?.trim().slice(0, 300) || null;
  await createServiceClient().from("gs_series_players").update(row).eq("id", playerId);
  touched(l);
  return OK;
}

/**
 * Reminds players who haven't sent their POV: a GameShuffle notification with the guide's link. Players
 * reminded in the last 12 hours are skipped.
 */
export async function remindPov(l: Loaded): Promise<{ ok: true; sent: number }> {
  const s = readSettings(l.series.settings);
  const cutoff = Date.now() - 12 * 3600_000;
  const due = l.players.filter((p) => p.pov === "none" && p.user_id && (!p.reminded_at || Date.parse(p.reminded_at) < cutoff));
  const { createNotification } = await import("@/lib/social/notifications");
  let sent = 0;
  for (const p of due) {
    const ok = await createNotification({
      userId: p.user_id!, type: "system",
      title: `${l.series.title}: your POV recording`,
      message: s.povDueAt ? `Please upload your POV by ${new Date(s.povDueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}.` : "Please upload your POV recording for the series video.",
      link: s.povGuideUrl ?? null,
    }).then(() => true).catch(() => false);
    if (ok) { sent += 1; await createServiceClient().from("gs_series_players").update({ reminded_at: new Date().toISOString() }).eq("id", p.id); }
  }
  return { ok: true, sent };
}

/** Gives the series' players (or just the champions) GS Pro until a date. */
export async function giftPro(l: Loaded, by: string, until: Date, who: "players" | "champions"): Promise<{ ok: true; given: number; skipped: number } | { ok: false; error: string }> {
  const list = who === "champions"
    ? l.players.filter((p) => p.team_id === l.series.champion_team_id)
    : l.players;
  if (who === "champions" && !l.series.champion_team_id) return { ok: false, error: "Crown the champions first." };
  let given = 0, skipped = 0;
  for (const p of list) {
    if (!p.user_id) { skipped += 1; continue; }
    const r = await giveProUntil({ userId: p.user_id, until, reason: who === "champions" ? `${l.series.title} champion` : l.series.title, ref: `series:${l.series.id}:${who}`, grantedBy: by });
    if (r.ok) given += 1;
    else if (r.error === "not_ready") return { ok: false, error: "GS Pro gifts need the latest database update (series-m1)." };
    else skipped += 1;
  }
  return { ok: true, given, skipped };
}

export async function endGiftedPro(l: Loaded, who: "players" | "champions"): Promise<number> {
  return endGifts({ ref: `series:${l.series.id}:${who}` });
}

/** Players' POV and GS Pro state, for the organizer screen. */
export async function playerAdmin(l: Loaded): Promise<{ id: string; giftUntil: string | null }[]> {
  const gifts = await liveGiftsFor(l.players.flatMap((p) => (p.user_id ? [p.user_id] : [])));
  return l.players.map((p) => ({ id: p.id, giftUntil: p.user_id ? gifts.get(p.user_id)?.until ?? null : null }));
}

export async function listSeries(): Promise<(SeriesDb & { teams: number; players: number })[]> {
  const admin = createServiceClient();
  const { data, error } = await admin.from("gs_series").select(SERIES_COLS).order("created_at", { ascending: false });
  if (error) return [];
  const rows = data as SeriesDb[];
  if (!rows.length) return [];
  const [t, p] = await Promise.all([
    admin.from("gs_series_teams").select("series_id").in("series_id", rows.map((r) => r.id)),
    admin.from("gs_series_players").select("series_id").in("series_id", rows.map((r) => r.id)),
  ]);
  const count = (list: { series_id: string }[] | null, id: string) => (list ?? []).filter((x) => x.series_id === id).length;
  return rows.map((r) => ({ ...r, teams: count(t.data as { series_id: string }[] | null, r.id), players: count(p.data as { series_id: string }[] | null, r.id) }));
}

export { loadSeries };
