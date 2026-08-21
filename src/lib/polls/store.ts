/**
 * GS Pro Polling — engine (Phase 1).
 *
 * Pure-ish store over `gs_polls` / `gs_poll_votes` via the service-role client.
 * Every surface (Hub UI, Twitch `!poll`, Discord `/gs-poll`, `/live`) is a thin
 * adapter over these functions. The tally is always derived; a community runs at
 * most one OPEN poll at a time (opening a new one closes the previous).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  type Poll,
  type PollOption,
  type PollStatus,
  type PollTally,
} from "./types";

interface PollRow {
  id: string;
  community_id: string;
  session_id: string | null;
  question: string;
  options: PollOption[] | null;
  status: string;
  allow_change: boolean;
  anon_allowed: boolean;
  created_by: string | null;
  opened_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  created_at: string;
}

function mapPoll(r: PollRow): Poll {
  return {
    id: r.id,
    communityId: r.community_id,
    sessionId: r.session_id,
    question: r.question,
    options: Array.isArray(r.options) ? r.options : [],
    status: r.status as PollStatus,
    allowChange: r.allow_change,
    anonAllowed: r.anon_allowed,
    createdBy: r.created_by,
    openedAt: r.opened_at,
    closesAt: r.closes_at,
    closedAt: r.closed_at,
    createdAt: r.created_at,
  };
}

/** Trim + de-blank labels, cap at MAX, and assign 1-based string ids. */
export function normalizeOptions(labels: string[]): PollOption[] {
  return labels
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_POLL_OPTIONS)
    .map((label, i) => ({ id: String(i + 1), label }));
}

export interface CreatePollInput {
  communityId: string;
  question: string;
  options: string[]; // labels
  sessionId?: string | null;
  allowChange?: boolean;
  anonAllowed?: boolean;
  createdBy?: string | null;
  closesAt?: string | null;
  /** Create + open in one step (the chat `!poll` path). */
  open?: boolean;
}

export type PollResult = Poll | { error: string };

export function isPollError(r: PollResult): r is { error: string } {
  return (r as { error?: string }).error !== undefined;
}

/** Close every other OPEN poll in a community (one-open-at-a-time rule). */
async function closeOtherOpenPolls(communityId: string, exceptId: string): Promise<void> {
  await createServiceClient()
    .from("gs_polls")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("community_id", communityId)
    .eq("status", "open")
    .neq("id", exceptId);
}

export async function createPoll(input: CreatePollInput): Promise<PollResult> {
  const question = input.question.trim();
  if (!question) return { error: "question_required" };
  const options = normalizeOptions(input.options);
  if (options.length < MIN_POLL_OPTIONS) return { error: "need_options" };

  const nowOpen = !!input.open;
  const { data, error } = await createServiceClient()
    .from("gs_polls")
    .insert({
      community_id: input.communityId,
      session_id: input.sessionId ?? null,
      question,
      options,
      status: nowOpen ? "open" : "draft",
      allow_change: input.allowChange ?? true,
      anon_allowed: input.anonAllowed ?? true,
      created_by: input.createdBy ?? null,
      opened_at: nowOpen ? new Date().toISOString() : null,
      closes_at: input.closesAt ?? null,
    })
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "insert_failed" };

  const poll = mapPoll(data as PollRow);
  if (nowOpen) await closeOtherOpenPolls(poll.communityId, poll.id);
  return poll;
}

export async function openPoll(pollId: string): Promise<PollResult> {
  const admin = createServiceClient();
  const { data: existing } = await admin.from("gs_polls").select("*").eq("id", pollId).maybeSingle();
  if (!existing) return { error: "not_found" };
  const current = mapPoll(existing as PollRow);
  if (current.status === "closed") return { error: "already_closed" };

  await closeOtherOpenPolls(current.communityId, current.id);
  const { data, error } = await admin
    .from("gs_polls")
    .update({ status: "open", opened_at: current.openedAt ?? new Date().toISOString() })
    .eq("id", pollId)
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "open_failed" };
  return mapPoll(data as PollRow);
}

export async function closePoll(pollId: string): Promise<PollResult> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_polls")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", pollId)
    .neq("status", "closed")
    .select("*")
    .maybeSingle();
  if (error) return { error: error.message };
  if (data) return mapPoll(data as PollRow);

  // Already closed (or missing) — return the current row if it exists.
  const { data: cur } = await admin.from("gs_polls").select("*").eq("id", pollId).maybeSingle();
  if (!cur) return { error: "not_found" };
  return mapPoll(cur as PollRow);
}

export async function getPoll(pollId: string): Promise<Poll | null> {
  const { data } = await createServiceClient()
    .from("gs_polls")
    .select("*")
    .eq("id", pollId)
    .maybeSingle();
  return data ? mapPoll(data as PollRow) : null;
}

export async function listPollsForCommunity(communityId: string, limit = 20): Promise<Poll[]> {
  const { data } = await createServiceClient()
    .from("gs_polls")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as PollRow[] | null) ?? []).map(mapPoll);
}

/** The community's currently-open poll (the one chat/overlay act on), if any. */
export async function getOpenPollForCommunity(communityId: string): Promise<Poll | null> {
  const { data } = await createServiceClient()
    .from("gs_polls")
    .select("*")
    .eq("community_id", communityId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapPoll(data as PollRow) : null;
}

export interface CastVoteInput {
  pollId: string;
  optionId: string;
  /** Exactly one voter key: an authed/chat/Discord identity, or an anon /live id. */
  gsIdentityId?: string | null;
  anonSessionId?: string | null;
}

export type CastVoteResult = { ok: true } | { ok: false; reason: string };

export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  const admin = createServiceClient();
  const poll = await getPoll(input.pollId);
  if (!poll) return { ok: false, reason: "not_found" };
  if (poll.status !== "open") return { ok: false, reason: "not_open" };
  if (!poll.options.some((o) => o.id === input.optionId)) return { ok: false, reason: "bad_option" };

  const byIdentity = !!input.gsIdentityId;
  const byAnon = !byIdentity && !!input.anonSessionId;
  if (!byIdentity && !byAnon) return { ok: false, reason: "no_voter" };
  if (byAnon && !poll.anonAllowed) return { ok: false, reason: "anon_not_allowed" };

  const voterCol = byIdentity ? "gs_identity_id" : "anon_session_id";
  const voterVal = (byIdentity ? input.gsIdentityId : input.anonSessionId) as string;

  // Existing vote for this voter key?
  const { data: existing } = await admin
    .from("gs_poll_votes")
    .select("id")
    .eq("poll_id", input.pollId)
    .eq(voterCol, voterVal)
    .maybeSingle();

  if (existing) {
    if (!poll.allowChange) return { ok: false, reason: "already_voted" };
    await admin
      .from("gs_poll_votes")
      .update({ option_id: input.optionId, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
    return { ok: true };
  }

  const { error } = await admin.from("gs_poll_votes").insert({
    poll_id: input.pollId,
    option_id: input.optionId,
    gs_identity_id: byIdentity ? input.gsIdentityId : null,
    anon_session_id: byAnon ? input.anonSessionId : null,
  });
  if (error) {
    // Raced with a concurrent vote from the same key → switch to an update.
    if ((error as { code?: string }).code === "23505") {
      await admin
        .from("gs_poll_votes")
        .update({ option_id: input.optionId, updated_at: new Date().toISOString() })
        .eq("poll_id", input.pollId)
        .eq(voterCol, voterVal);
      return { ok: true };
    }
    return { ok: false, reason: "insert_failed" };
  }
  return { ok: true };
}

/** Close every open poll whose `closes_at` has passed. Returns how many. */
export async function sweepDuePolls(now: number = Date.now()): Promise<number> {
  const iso = new Date(now).toISOString();
  const { data } = await createServiceClient()
    .from("gs_polls")
    .update({ status: "closed", closed_at: iso })
    .eq("status", "open")
    .not("closes_at", "is", null)
    .lte("closes_at", iso)
    .select("id");
  return ((data as { id: string }[] | null) ?? []).length;
}

export async function tally(pollId: string): Promise<PollTally> {
  const { data } = await createServiceClient()
    .from("gs_poll_votes")
    .select("option_id")
    .eq("poll_id", pollId);
  const rows = (data as { option_id: string }[] | null) ?? [];
  const byOption: Record<string, number> = {};
  for (const r of rows) byOption[r.option_id] = (byOption[r.option_id] ?? 0) + 1;
  return { total: rows.length, byOption };
}
