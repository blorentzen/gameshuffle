/**
 * Oracle tools (Streamer Tools Integration) — Magic 8-Ball, Yes/No, and Truth
 * or Dare share ONE overlay event type ("oracle", an answer card) and one
 * module. Each trigger picks server-side, records the event, returns the
 * answer for the caller to announce. Mirrors the dice/coin triggers.
 */

import "server-only";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { getTruthOrDareSet } from "@/data/truth-or-dare";
import { EIGHT_BALL_ANSWERS, type EightBallTone } from "@/data/eight-ball";
import { getStreamerModuleDefault } from "@/lib/modules/streamerDefaults";
import type { OracleConfig } from "@/lib/modules/types";
import { trackServerEvent } from "@/lib/analytics/server";
import type { ToolSource } from "./dice";

const DEFAULT_ORACLE: OracleConfig = {
  truthDareSet: "party",
  allowMaybe: true,
  eightBallMode: "standard",
  customEightBall: [],
  truthDareMode: "standard",
  customTruths: [],
  customDares: [],
};

async function getOracleConfig(ownerUserId: string): Promise<OracleConfig> {
  const cfg = await getStreamerModuleDefault({ ownerUserId, moduleId: "oracle", gameSlug: "*" });
  return { ...DEFAULT_ORACLE, ...(cfg ?? {}) };
}

/** Effective text pool: the standard entries the streamer left ON (defaults
 *  minus their disabled list, matched by exact text) plus their custom entries.
 *  Falls back to the full standard set so the overlay never shows nothing. */
function mergePool(standard: string[], disabled: string[] | undefined, custom: string[]): string[] {
  const off = new Set(disabled ?? []);
  const enabled = standard.filter((s) => !off.has(s));
  const pool = [...enabled, ...custom];
  return pool.length ? pool : standard;
}

const ORACLE_TTL_MS = 5500;

type Tone = EightBallTone;
export type OracleKind = "eightball" | "yesno" | "truth" | "dare";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function recordOracle(args: {
  ownerUserId: string;
  sessionId?: string | null;
  kind: OracleKind;
  title: string;
  prompt?: string | null;
  answer: string;
  tone: Tone;
  accentColor?: string;
  triggeredBy?: string | null;
}) {
  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId ?? null,
    type: "oracle",
    payload: {
      kind: args.kind,
      title: args.title,
      prompt: args.prompt ?? null,
      answer: args.answer,
      tone: args.tone,
      accentColor: args.accentColor ?? null,
      triggeredBy: args.triggeredBy ?? null,
    },
    ttlMs: ORACLE_TTL_MS,
  });
}

export async function triggerEightBall(args: {
  ownerUserId: string;
  sessionId?: string | null;
  question?: string | null;
  triggeredBy?: string | null;
  source?: ToolSource;
}): Promise<{ answer: string }> {
  void trackServerEvent("Streamer Tool", {
    props: { tool: "oracle", kind: "eightball", surface: args.source ?? "unknown" },
  });
  const cfg = await getOracleConfig(args.ownerUserId);
  // Enabled defaults keep their tone; streamer-authored answers read as neutral.
  const off = new Set(cfg.disabledEightBall ?? []);
  const enabled = EIGHT_BALL_ANSWERS.filter((a) => !off.has(a.text));
  const custom = cfg.customEightBall.map((text) => ({ text, tone: "neutral" as Tone }));
  const pool = enabled.length || custom.length ? [...enabled, ...custom] : EIGHT_BALL_ANSWERS;
  const a = pick(pool);
  await recordOracle({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId,
    kind: "eightball",
    title: "Magic 8-Ball",
    prompt: args.question?.trim() || null,
    answer: a.text,
    tone: a.tone,
    accentColor: cfg.accentColor,
    triggeredBy: args.triggeredBy,
  });
  return { answer: a.text };
}

export async function triggerYesNo(args: {
  ownerUserId: string;
  sessionId?: string | null;
  question?: string | null;
  triggeredBy?: string | null;
  source?: ToolSource;
}): Promise<{ answer: string }> {
  void trackServerEvent("Streamer Tool", {
    props: { tool: "oracle", kind: "yesno", surface: args.source ?? "unknown" },
  });
  const cfg = await getOracleConfig(args.ownerUserId);
  const pool: { text: string; tone: Tone }[] = [
    { text: "Yes", tone: "yes" },
    { text: "No", tone: "no" },
    ...(cfg.allowMaybe ? [{ text: "Maybe", tone: "maybe" as Tone }] : []),
  ];
  const a = pick(pool);
  await recordOracle({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId,
    kind: "yesno",
    title: "Yes or No?",
    prompt: args.question?.trim() || null,
    answer: a.text,
    tone: a.tone,
    triggeredBy: args.triggeredBy,
  });
  return { answer: a.text };
}

export async function triggerTruthOrDare(args: {
  ownerUserId: string;
  sessionId?: string | null;
  which: "truth" | "dare";
  triggeredBy?: string | null;
  source?: ToolSource;
}): Promise<{ answer: string }> {
  void trackServerEvent("Streamer Tool", {
    props: { tool: "oracle", kind: args.which, surface: args.source ?? "unknown" },
  });
  const cfg = await getOracleConfig(args.ownerUserId);
  const set = getTruthOrDareSet(cfg.truthDareSet) ?? getTruthOrDareSet("clean");
  const standard = args.which === "dare" ? set?.dares ?? [] : set?.truths ?? [];
  const custom = args.which === "dare" ? cfg.customDares : cfg.customTruths;
  const disabled = args.which === "dare" ? cfg.disabledDares : cfg.disabledTruths;
  const prompts = mergePool(standard, disabled, custom);
  const answer = prompts.length ? pick(prompts) : "…";
  await recordOracle({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId,
    kind: args.which,
    title: args.which === "dare" ? "Dare" : "Truth",
    answer,
    tone: "neutral",
    accentColor: cfg.accentColor,
    triggeredBy: args.triggeredBy,
  });
  return { answer };
}
