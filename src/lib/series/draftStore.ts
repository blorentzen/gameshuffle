import "server-only";

/**
 * Track draft actions on a series night (src/lib/series/draft.ts has the rules). Every change reads the
 * night, works out the new draft and writes it only if nobody wrote in between (draft_version), trying
 * again a few times. Organizers set the bank and order, roll it on stream, start, pause, undo and pick for
 * a team; a team's players pick on their own turn.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  applyPick, checkPick, emptyDraft, onClock, orderFromStandings, orderValid, pauseDraft, readDraft, resumeDraft, shuffled,
  startDraft, undoTurn, type DraftError, type DraftState,
} from "./draft";
import { loadNights, NIGHT_COLS, writeDraft, type Loaded, type NightDb } from "./store";
import { readSettings } from "./view";

export type DraftActionError = DraftError | "no_night" | "no_draft" | "bad_order" | "busy" | "running" | "no_results";

export const DRAFT_ACTION_ERRORS: Record<Exclude<DraftActionError, DraftError>, string> = {
  no_night: "That night isn't part of this series.",
  no_draft: "Set the draft up first.",
  bad_order: "The order needs every team once.",
  busy: "Someone else changed the draft at the same moment. Try again.",
  running: "Pause or reset the draft first.",
  no_results: "That night has no results yet.",
};

type Step = (d: DraftState | null, night: NightDb) => DraftState | DraftActionError;

async function change(nightId: string, step: Step): Promise<{ ok: true; draft: DraftState } | { ok: false; error: DraftActionError }> {
  const admin = createServiceClient();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await admin.from("gs_series_nights").select(NIGHT_COLS).eq("id", nightId).maybeSingle();
    const night = data as NightDb | null;
    if (!night) return { ok: false, error: "no_night" };
    const next = step(readDraft(night.draft), night);
    if (typeof next === "string") return { ok: false, error: next };
    if (await writeDraft(night.id, night.draft_version, next)) return { ok: true, draft: next };
  }
  return { ok: false, error: "busy" };
}

/** Sets the draft up from the series' bank and settings (keeps the order if one is set). Not while running. */
export function setupDraft(l: Loaded, nightId: string) {
  const s = readSettings(l.series.settings);
  return change(nightId, (d) => {
    if (d && (d.status === "running" || d.status === "paused")) return "running";
    const fresh = emptyDraft(s.bank, s.target, s.turnSeconds);
    const teamIds = l.teams.map((t) => t.id);
    return { ...fresh, order: d && orderValid(d.order, teamIds) ? d.order : [] };
  });
}

export function setOrder(l: Loaded, nightId: string, order: string[]) {
  const teamIds = l.teams.map((t) => t.id);
  return change(nightId, (d) => {
    if (!d) return "no_draft";
    if (d.status !== "setup") return "running";
    if (!orderValid(order, teamIds)) return "bad_order";
    return { ...d, order };
  });
}

/** Rolls round 1's order at random (pick 5A: rolled on stream; the board and overlays play the roll). */
export function rollOrder(l: Loaded, nightId: string) {
  const teamIds = l.teams.map((t) => t.id);
  return change(nightId, (d) => {
    if (!d) return "no_draft";
    if (d.status !== "setup") return "running";
    if (teamIds.length < 2) return "bad_order";
    return { ...d, order: shuffled(teamIds), rolledAt: new Date().toISOString() };
  });
}

/** Round 1's order from another night's results: last place first (pick 6A). */
export async function orderFromNight(l: Loaded, nightId: string, fromNightId: string) {
  const data = await loadNights(l);
  const result = data.get(fromNightId)?.result;
  if (!result || !result.racesDone) return { ok: false as const, error: "no_results" as DraftActionError };
  const bestFirst = result.teams.map((r) => r.teamId);
  return setOrder(l, nightId, orderFromStandings(bestFirst));
}

export function startNightDraft(l: Loaded, nightId: string) {
  const teamIds = l.teams.map((t) => t.id);
  return change(nightId, (d) => {
    if (!d) return "no_draft";
    if (d.status !== "setup") return "running";
    if (!orderValid(d.order, teamIds)) return "bad_order";
    return startDraft(d);
  });
}

export function pauseNightDraft(nightId: string) {
  return change(nightId, (d) => (d ? pauseDraft(d) : "no_draft"));
}
export function resumeNightDraft(nightId: string) {
  return change(nightId, (d) => (d ? resumeDraft(d) : "no_draft"));
}
export function undoNightDraft(nightId: string) {
  return change(nightId, (d) => (d && d.turns.length ? undoTurn(d) : "no_draft"));
}

/** Back to the start: same bank and order, no turns. */
export function resetNightDraft(nightId: string) {
  return change(nightId, (d) => (d ? { ...emptyDraft(d.bank, d.target, d.turnSeconds), order: d.order } : "no_draft"));
}

/** A team's ban and protect. `team` is checked against the clock; organizers may pick for whoever is on it. */
export function pickTracks(nightId: string, team: string, ban: string, protect: string | null, by: string) {
  return change(nightId, (d) => {
    if (!d) return "no_draft";
    const err = checkPick(d, team, ban, protect);
    if (err) return err;
    return applyPick(d, team, ban, protect, by, false);
  });
}

/** The team on the clock in a night's draft (for the organizer's "pick for them"). */
export async function teamOnClock(nightId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("gs_series_nights").select("draft").eq("id", nightId).maybeSingle();
  const d = readDraft((data as { draft: unknown } | null)?.draft);
  return d ? onClock(d) : null;
}
