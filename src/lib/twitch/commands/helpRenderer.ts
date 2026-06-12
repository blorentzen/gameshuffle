/**
 * Auto-generated `!help` renderer — Spec 03 §3.
 *
 * Help is metadata on every CommandDef, NOT a separately-maintained
 * doc. Adding a registration ships its help line automatically.
 *
 * Two modes:
 *
 *   - `!help`             → category list (one section per category,
 *                            filtered by caller's actor tier).
 *   - `!help <topic>`     → that command's detail (or summary +
 *                            usage when no detail field is set).
 *
 * Topic resolution accepts canonical names (`tokens`, `gs.market.open`),
 * path-as-space (`gs market open`), legacy hyphen aliases
 * (`gs-market-open`), and bare verbs (`bet`). The path resolver from
 * registry.ts handles aliasing already; we just normalize input shape.
 *
 * Output is one chat message capped to Twitch's ~500-char limit per
 * line. Long category lists are truncated with a `…use !help <topic>`
 * tail rather than split across multiple messages — chat blasts of
 * help text feel spammy and the topic lookup is right there.
 */

import "server-only";
import { getCommunityBySlug } from "@/lib/economy/community";
import { isModuleEnabled } from "@/lib/economy/modules/registry";
import {
  listCommands,
  resolveCommand,
  tierMeets,
  type ActorTier,
  type CommandDef,
} from "./registry";

const CHAT_LIMIT = 500;

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core",
  lifecycle: "Lobby",
  race: "Race",
  "picks-bans": "Picks & Bans",
  moderation: "Mods",
  tokens: "Tokens",
  markets: "Markets",
  events: "Events",
  social: "Social",
};
// Note: the `games` category was removed alongside the M3/M4 cuts.
// The Event System (Spec 04) ships under the `events` category for
// !chaos / !random.

interface RenderHelpArgs {
  callerTier: ActorTier;
  /** Topic — null for the category list, non-null for command detail. */
  topic: string | null;
  /** Pass-through for commands that want to render a streamer-specific
   *  detail (e.g. "see today's market on /live/<slug>"). Unused in v1
   *  but kept on the signature so future detail strings can read it. */
  streamerSlug: string | null;
}

/**
 * Render the chat-side help string. Pure — caller posts the result.
 */
export async function renderHelp(args: RenderHelpArgs): Promise<string> {
  if (args.topic) {
    return renderTopicHelp(args.topic, args.callerTier);
  }
  return renderCategoryList(args.callerTier, args.streamerSlug);
}

/**
 * Filter the candidate command list against the streamer's
 * `gs_community_modules` enablement. Commands with no `moduleKey`
 * (core) always pass. Per Spec 06 §4, disabled modules' commands
 * appear absent in help.
 */
async function filterByEnabledModules(
  candidates: CommandDef[],
  streamerSlug: string | null,
): Promise<CommandDef[]> {
  if (!streamerSlug) return candidates;
  const community = await getCommunityBySlug(streamerSlug).catch(() => null);
  if (!community) return candidates;
  const result: CommandDef[] = [];
  for (const def of candidates) {
    if (!def.moduleKey) {
      result.push(def);
      continue;
    }
    if (await isModuleEnabled(community.id, def.moduleKey)) {
      result.push(def);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Category list
// ---------------------------------------------------------------------------

async function renderCategoryList(
  callerTier: ActorTier,
  streamerSlug: string | null,
): Promise<string> {
  // During the Spec 01 backfill window `actor` is optional; default
  // any unmarked command to `everyone` for filtering purposes. Once
  // every registration carries `minAuthority`, this filter switches
  // to the two-axis gate (authorityMeets + vipOnly).
  const byTier = listCommands().filter((c) =>
    tierMeets(callerTier, c.actor ?? "everyone"),
  );
  const visible = await filterByEnabledModules(byTier, streamerSlug);

  // Group by category.
  const byCategory = new Map<string, CommandDef[]>();
  for (const def of visible) {
    const key = def.category ?? "other";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(def);
  }

  const sections: string[] = [];
  for (const [category, defs] of byCategory.entries()) {
    const label = CATEGORY_LABELS[category] ?? capitalize(category);
    const triggers = defs.map((d) => formatTrigger(d.trigger)).join(", ");
    sections.push(`${label}: ${triggers}`);
  }

  const head = `🎲 GS commands → `;
  const tail = " · !help <topic> for details.";
  const budget = CHAT_LIMIT - head.length - tail.length;

  // Pack sections under the budget; tack on "+N more" if we drop any.
  let acc = "";
  let dropped = 0;
  for (const section of sections) {
    const sep = acc ? " · " : "";
    if (acc.length + sep.length + section.length > budget) {
      dropped++;
      continue;
    }
    acc = acc + sep + section;
  }
  if (dropped > 0) {
    const note = ` · +${dropped} more`;
    if (acc.length + note.length <= budget) acc += note;
  }
  return head + acc + tail;
}

// ---------------------------------------------------------------------------
// Topic detail
// ---------------------------------------------------------------------------

function renderTopicHelp(topic: string, callerTier: ActorTier): string {
  // Normalize topic input shapes:
  //   "gs market open"   → ['gs','market','open']
  //   "gs-market-open"   → ['gs','market','open']
  //   "tokens"           → ['tokens']
  //   "!tokens"          → ['tokens']
  //   "gs.market.open"   → ['gs','market','open']
  const cleaned = topic
    .replace(/^!/, "")
    .replace(/\./g, " ")
    .replace(/-/g, " ")
    .trim()
    .toLowerCase();
  const path = cleaned.split(/\s+/).filter(Boolean);

  const def = resolveCommand(path);
  if (!def) {
    return `🎲 Unknown command "${topic}". Type !help for the list.`;
  }
  if (!tierMeets(callerTier, def.actor ?? "everyone")) {
    return `🎲 ${formatTrigger(def.trigger)} isn't available to your role.`;
  }

  const usage = def.help.usage;
  const detail = def.help.detail ?? def.help.summary;
  const tags = formatTags(def);
  return `🎲 ${formatTrigger(def.trigger)} → ${usage} — ${detail}${tags}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTrigger(path: ReadonlyArray<string>): string {
  return `!${path.join(" ")}`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function formatTags(def: CommandDef): string {
  const tags: string[] = [];
  if (def.liveOnly) tags.push("live-only");
  const actor = def.actor ?? "everyone";
  if (actor !== "everyone") tags.push(actor);
  if (def.economy !== "none") tags.push(def.economy);
  return tags.length === 0 ? "" : ` [${tags.join(", ")}]`;
}
