/**
 * Shared authority model for chat-fire surfaces — the 4-tier ladder
 * the product surfaces as Viewer / VIP+ / Mod+ / Streamer/Host.
 *
 * Owned by:
 *   - Default commands (`gs_default_commands.min_authority`)
 *   - Events (`gs_events.min_authority` — used when fired directly)
 *
 * Distinct from the registry's `Authority` type in `registry.ts`,
 * which is a 3-rung ladder (viewer / mod / host) with VIP as a
 * parallel boolean (`vipOnly`). That two-axis shape matches the
 * legacy registry handlers (e.g. !chaos, !shuffle) and is the
 * source of truth there; the 4-tier shape here is the source of
 * truth for the platform-curated catalog surfaces. Both surfaces
 * agree on the semantic meaning of "VIP+" — the caller has VIP
 * status OR is a mod OR is the broadcaster — but they encode it
 * differently in storage.
 *
 * Anywhere in the runtime that gates a chat fire against a catalog
 * row's stored authority, use `checkChatAuthority`. Anywhere in the
 * UI that labels the ladder, use `AUTHORITY_LABEL`.
 */

export type ChatAuthority = "viewer" | "vip" | "mod" | "host";

export const CHAT_AUTHORITIES: ChatAuthority[] = [
  "viewer",
  "vip",
  "mod",
  "host",
];

/** Product-surface labels. Single source of truth for the
 *  4-tier ladder across Platform Admin + Streamer surfaces. */
export const AUTHORITY_LABEL: Record<ChatAuthority, string> = {
  viewer: "Everyone",
  vip: "VIP+",
  mod: "Mod+",
  host: "Streamer/Host",
};

export interface AuthorityCaller {
  isBroadcaster: boolean;
  isModerator: boolean;
  isVIP?: boolean;
}

/**
 * Returns true when the caller meets the minimum authority. VIP+
 * specifically means "has a VIP badge OR mod OR host" — VIP is a
 * cross-cut, not a strict ladder position.
 */
export function checkChatAuthority(
  min: ChatAuthority,
  caller: AuthorityCaller,
): boolean {
  switch (min) {
    case "viewer":
      return true;
    case "vip":
      return (
        caller.isBroadcaster || caller.isModerator || !!caller.isVIP
      );
    case "mod":
      return caller.isBroadcaster || caller.isModerator;
    case "host":
      return caller.isBroadcaster;
  }
}
