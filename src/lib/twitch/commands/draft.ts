/**
 * `!draft` — chat drafts (GS Pro). Chat fills the streamer's slots one pick at
 * a time; each pick is a poll, so votes are the usual `!vote <number>`.
 *
 *   !draft                    status: the team so far (everyone)
 *   !draft start <what>       start one: pokemon (Scarlet/Violet), champions,
 *                             kart (MK8DX combo), mkw, tracks, mkwtracks,
 *                             stage / stages (Smash, one or a best of 3),
 *                             smash / squad (the streamer's fighter or three) (mods)
 *   !draft next               close the current pick now (mods)
 *   !draft end                cancel it (mods)
 *
 * Captain drafts (picking players into teams):
 *   !draft teams              open sign-ups, seeded with the session lobby (mods)
 *   !draft in / !draft out    sign up or drop out (everyone)
 *   !draft captains @a @b     start picking with those captains (2 to 4; mods)
 *   !pick <name>              the captain on the clock picks (mods can pick for them).
 *                             Only while a captain draft runs; otherwise !pick
 *                             is the picks/bans ballot as before.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { isProUser } from "@/lib/subscription-server";
import { poolFromAlias } from "@/lib/drafts/catalog";
import { isCaptainOnClock, matchEntrant, undrafted, type Entrant } from "@/lib/drafts/captains";
import {
  DraftsNotReady, addEntrants, cancelDraft, getCurrentDraft, openSignups, pickPlayer, removeEntrant, resolvePick, startCaptains,
  startDraft, teamOnClock, tickDraft, type StreamDraft,
} from "@/lib/drafts/store";
import { resolveEconomyContext } from "./economy";
import { registerCommand, type CmdContext } from "./registry";
import type { ShuffleContext } from "./shuffle";

function asShuffleCtx(cmd: CmdContext): ShuffleContext {
  return {
    userId: cmd.userId,
    broadcasterTwitchId: cmd.broadcasterTwitchId,
    senderTwitchId: cmd.senderTwitchId,
    senderLogin: cmd.senderLogin,
    senderDisplayName: cmd.senderDisplayName,
    isBroadcaster: cmd.isBroadcaster,
    botTwitchId: cmd.botTwitchId,
    overlayToken: cmd.overlayToken ?? null,
  };
}

function reply(cmd: CmdContext, message: string): Promise<unknown> {
  return sendChatMessage({ broadcasterId: cmd.broadcasterTwitchId, senderId: cmd.botTwitchId, message });
}

function captainStatus(d: StreamDraft): string {
  if (d.status === "signup") return `📋 Team draft sign-ups: ${d.entrants.length} in (${d.entrants.slice(0, 12).map((e) => e.name).join(", ")}${d.entrants.length > 12 ? "…" : ""}). Type !draft in to join.`;
  const teams = d.teams.map((t) => `${t.name}: ${[t.captain, ...t.players].map((p) => p.name).join(", ")}`).join(" | ");
  const t = teamOnClock(d);
  return `📋 ${teams}${t ? ` · ${t.captain.name} is picking (${undrafted(d.entrants, d.teams).length} left)` : ""}`;
}

/**
 * `!pick <name>` during a captain draft. Returns false when no captain draft is
 * picking, so the caller falls through to the picks/bans ballot.
 */
export async function tryCaptainPick(cmd: CmdContext): Promise<boolean> {
  const econ = await resolveEconomyContext(asShuffleCtx(cmd)).catch(() => null);
  if (!econ) return false;
  let draft: StreamDraft | null;
  try { draft = await getCurrentDraft(econ.community.id); } catch { return false; }
  if (!draft || draft.mode !== "captains" || draft.status !== "open") return false;
  draft = await tickDraft(draft);
  if (draft.status !== "open") return true;
  const team = teamOnClock(draft);
  const captain = isCaptainOnClock(team, { twitchId: cmd.senderTwitchId });
  if (!captain && !cmd.isBroadcaster && !cmd.isModerator) {
    await reply(cmd, `📋 @${cmd.senderDisplayName} it's ${team?.captain.name ?? "a captain"}'s pick.`);
    return true;
  }
  const query = cmd.args.trim();
  const pool = undrafted(draft.entrants, draft.teams);
  const hit = matchEntrant(query, pool);
  if (!hit) { await reply(cmd, `📋 Nobody called "${query.slice(0, 30)}" is left. ${pool.length} to pick from: ${pool.slice(0, 10).map((e) => e.name).join(", ")}${pool.length > 10 ? "…" : ""}`); return true; }
  if (hit === "ambiguous") { await reply(cmd, `📋 More than one player matches "${query.slice(0, 30)}". Type more of the name.`); return true; }
  const r = await pickPlayer(draft, hit.key, captain ? "captain" : "streamer");
  if (!r.ok && r.error === "too_late") await reply(cmd, "📋 That pick just went through another way. Check the board.");
  return true;
}

const WHATS = "pokemon, champions, kart, mkw, tracks, mkwtracks, stage, stages, smash or squad";

registerCommand({
  name: "draft",
  trigger: ["draft"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "viewer",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 3,
  help: {
    summary: "Chat drafts the streamer's team, combo, track list, stage or fighter, one vote at a time.",
    usage: "!draft  ·  !draft start <pokemon|champions|kart|mkw|tracks|mkwtracks|stage|stages|smash|squad>  ·  !draft next  ·  !draft end  ·  !draft teams  ·  !draft in  ·  !draft captains @a @b",
    detail: "Each pick is a poll: vote with !vote <number>. !draft shows the picks so far. Team drafts: !draft teams opens sign-ups, !draft in to join, then captains pick with !pick <name>. Starting, skipping ahead and ending are for the streamer and mods. GS Pro.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    if (!(await isProUser(cmd.userId))) return { ok: false, reason: "not_pro" };
    const words = cmd.args.trim().split(/\s+/);
    const [sub, what] = words.map((w) => w.toLowerCase());
    const canRun = cmd.isBroadcaster || cmd.isModerator;
    const communityId = econ.community.id;
    try {
      if (sub === "start") {
        if (!canRun) return { ok: false, reason: "not_mod" };
        const info = poolFromAlias(what);
        if (!info) { await reply(cmd, `📋 Start a draft with !draft start <${WHATS}>`); return { ok: true }; }
        const r = await startDraft({ communityId, poolId: info.id, rules: info.aliasRules?.[what], createdBy: cmd.userId, sessionId: econ.activeSessionId });
        if (!r.ok) await reply(cmd, r.error === "already_open" ? "📋 A draft is already running. !draft end first." : "📋 Couldn't start the draft. Try again.");
        // The first pick announces itself.
        return { ok: r.ok };
      }
      if (sub === "teams") {
        if (!canRun) return { ok: false, reason: "not_mod" };
        const r = await openSignups({ communityId, createdBy: cmd.userId, sessionId: econ.activeSessionId });
        if (!r.ok) await reply(cmd, r.error === "already_open" ? "📋 A draft is already running. !draft end first." : "📋 Couldn't open sign-ups. Try again.");
        return { ok: r.ok };
      }
      const draft = await getCurrentDraft(communityId);
      if (draft?.mode === "captains" && (sub === "in" || sub === "join" || sub === "out" || sub === "leave")) {
        if (draft.status !== "signup") { await reply(cmd, `📋 @${cmd.senderDisplayName} sign-ups are closed.`); return { ok: true }; }
        const me: Entrant = { key: `tw:${cmd.senderTwitchId}`, name: cmd.senderDisplayName, twitchId: cmd.senderTwitchId, twitchLogin: cmd.senderLogin, source: "signup" };
        const r = sub === "in" || sub === "join" ? await addEntrants(draft.id, [me]) : await removeEntrant(draft.id, me.key);
        if (r.ok && (sub === "out" || sub === "leave")) await reply(cmd, `📋 @${cmd.senderDisplayName} you're out of the team draft.`);
        // Joining stays quiet (the overlay and /live show the list) so a busy chat isn't flooded.
        return { ok: r.ok };
      }
      if (sub === "captains") {
        if (!canRun) return { ok: false, reason: "not_mod" };
        if (!draft || draft.mode !== "captains" || draft.status !== "signup") { await reply(cmd, "📋 Open sign-ups first with !draft teams."); return { ok: true }; }
        const keys: string[] = [];
        for (const w of words.slice(1, 5)) {
          const hit = matchEntrant(w, draft.entrants.filter((e) => !keys.includes(e.key)));
          if (!hit || hit === "ambiguous") { await reply(cmd, `📋 Couldn't find ${w} in the sign-ups${hit === "ambiguous" ? " (more than one match)" : ""}.`); return { ok: true }; }
          keys.push(hit.key);
        }
        if (keys.length < 2) { await reply(cmd, "📋 Name 2 to 4 captains: !draft captains @name @name"); return { ok: true }; }
        const r = await startCaptains(draft, { teams: keys.map((captainKey) => ({ captainKey })), order: "snake", pickSeconds: 30 });
        if (!r.ok) await reply(cmd, r.error === "no_players" ? "📋 Nobody's left to pick. Get more sign-ups first." : "📋 Couldn't start the team draft.");
        return { ok: r.ok };
      }
      if (draft?.mode === "captains" && sub === "next") { await reply(cmd, "📋 Pick with !pick <name>, or wait for the timer."); return { ok: true }; }
      if (sub === "next" || sub === "end" || sub === "stop") {
        if (!canRun) return { ok: false, reason: "not_mod" };
        if (!draft || draft.status !== "open") { await reply(cmd, "📋 No draft is running."); return { ok: true }; }
        if (sub === "next") await resolvePick(draft, { force: true });
        else { await cancelDraft(draft); await reply(cmd, "📋 Draft ended."); }
        return { ok: true };
      }
      if (!draft) { await reply(cmd, canRun ? `📋 No draft running. Start one with !draft start <${WHATS}>` : "📋 No draft running right now."); return { ok: true }; }
      if (draft.mode === "captains") { await reply(cmd, captainStatus(draft)); return { ok: true }; }
      const picks = draft.picks.length ? draft.picks.map((p) => p.label).join(", ") : "nothing yet";
      await reply(cmd, `📋 ${draft.title}: ${picks} (${draft.picks.length} of ${draft.slots.length})${draft.status === "open" ? " · vote with !vote <number>" : ""}`);
      return { ok: true };
    } catch (err) {
      if (err instanceof DraftsNotReady) { await reply(cmd, "📋 Chat drafts need a quick update on GameShuffle before they can run."); return { ok: false, reason: "not_ready" }; }
      throw err;
    }
  },
});

