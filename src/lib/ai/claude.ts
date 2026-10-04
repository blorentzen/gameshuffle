import "server-only";

/**
 * GameShuffle's Claude helper (server only). One place for the client, the
 * model, and the rules every AI feature follows:
 *   * AI drafts, a person approves: nothing it writes goes public unreviewed
 *     (Chat Brain groupings and prompt drafts, Daily clues).
 *   * Never in a hot path that players wait on (guess matching is rules-only).
 *   * Structured output only, so callers get typed data, not prose to parse.
 * ANTHROPIC_API_KEY comes from the environment (separate keys for production
 * and dev/preview, each workspace with its own spend limit).
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const CLAUDE_MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
export function claude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: "not_configured" | "refused" | "rate_limited" | "failed" };

/**
 * One structured call: a system prompt, a user message, and a zod schema for
 * the answer. Low effort by default (these are short drafting tasks).
 */
export async function draftStructured<S extends z.ZodType>(args: {
  system: string;
  prompt: string;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<AiResult<z.infer<S>>> {
  if (!aiConfigured()) return { ok: false, error: "not_configured" };
  try {
    const res = await claude().messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: args.maxTokens ?? 8000,
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
      output_config: { effort: args.effort ?? "low", format: zodOutputFormat(args.schema) },
    });
    if (res.stop_reason === "refusal") return { ok: false, error: "refused" };
    if (res.parsed_output == null) return { ok: false, error: "failed" };
    return { ok: true, data: res.parsed_output as z.infer<S> };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "rate_limited" };
    if (err instanceof Anthropic.APIError) console.error(`[ai] API error ${err.status}:`, err.message);
    else console.error("[ai] call failed:", err);
    return { ok: false, error: "failed" };
  }
}
