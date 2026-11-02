/** The War room's one Discord SDK (Discord allows a single handshake per frame), shared by its screens. */

import type { DiscordSDK } from "@discord/embedded-app-sdk";

export const warSdk: { current: DiscordSDK | null } = { current: null };

/** Opens a link outside the Activity (Discord asks first for other sites; a discord.com link goes to that message). */
export function openLink(url: string) {
  if (warSdk.current) void warSdk.current.commands.openExternalLink({ url }).catch(() => {});
  else window.open(url, "_blank", "noopener");
}
