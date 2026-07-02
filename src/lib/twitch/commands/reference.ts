/**
 * Command reference — serializes the live command REGISTRY (the Spec 03 single
 * source of truth) into display DTOs for the account "Command Reference" UI.
 *
 * Importing "./registrations" runs every registerCommand side-effect (it pulls
 * in eventCommands too), so this sees the COMPLETE built-in catalog — economy,
 * events, wheel, markets, picks, lobby — without the hand-maintained drift of
 * the old catalog.ts. The handler is dropped (not serializable); everything the
 * UI needs (trigger, family, authority, help) ships.
 *
 * Custom per-streamer commands aren't in the static registry (they're
 * registered per-request from the DB), so this is purely the built-ins —
 * exactly what belongs in a global reference.
 */

import "server-only";
import "./registrations";
import {
  listCommands,
  type ActorTier,
  type Authority,
  type CommandFamily,
  type EconomyClass,
} from "./registry";

export interface CommandReferenceEntry {
  name: string;
  /** Display trigger, e.g. "!chaos" or "!gs market open". */
  trigger: string;
  aliases: string[];
  family: CommandFamily;
  authority: Authority;
  economy: EconomyClass;
  moduleKey: string | null;
  summary: string;
  usage: string;
  detail: string | null;
}

function triggerToDisplay(path: ReadonlyArray<string>): string {
  return "!" + path.join(" ");
}

/** Map the legacy actor tier to the authority axis for display when a command
 *  predates `minAuthority`. */
function actorToAuthority(actor: ActorTier | undefined): Authority {
  if (actor === "host") return "host";
  if (actor === "crew") return "mod";
  return "viewer";
}

export function listCommandReference(): CommandReferenceEntry[] {
  return listCommands()
    .map((c) => ({
      name: c.name,
      trigger: triggerToDisplay(c.trigger),
      aliases: (c.aliases ?? []).map((a) => triggerToDisplay(a)),
      family: (c.family ?? "core") as CommandFamily,
      authority: c.minAuthority ?? actorToAuthority(c.actor),
      economy: c.economy ?? "none",
      moduleKey: c.moduleKey ?? null,
      summary: c.help?.summary ?? "",
      usage: c.help?.usage ?? triggerToDisplay(c.trigger),
      detail: c.help?.detail ?? null,
    }))
    .sort((a, b) => a.trigger.localeCompare(b.trigger));
}
