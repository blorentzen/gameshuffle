/**
 * /twitch/commands: retired 2026-10-10 (a second copy of the commands editor
 * that nothing linked to). Forwards to Streaming ▸ Chat ▸ Commands.
 */

import { redirect } from "next/navigation";

export default function TwitchCommandsRedirect() {
  redirect("/account/streaming?tab=chat-commands");
}
