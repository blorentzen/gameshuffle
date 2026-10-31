/**
 * /twitch/modules: retired 2026-10-10. Its ModulesManager now lives on
 * Streaming ▸ Chat ▸ Modules (CommunityTab embeds it); this forwards there.
 */

import { redirect } from "next/navigation";

export default function TwitchModulesRedirect() {
  redirect("/account/streaming?tab=community");
}
