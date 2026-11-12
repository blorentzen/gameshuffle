/**
 * What a Discord reply says when a server's GameShuffle account needs GS Pro for
 * a command (picks 2026-11-11: every wall offers the trial one tap away). A
 * reply can't hold the site's trial prompt, so it names what's locked and links
 * /gs-pro with the trial wording; the page itself adapts to a used trial or a
 * visitor outside the US.
 */

import { SITE_URL } from "@/lib/seo";

/** "📊 Polls are" → "📊 Polls are part of GS Pro for … Try it free for 14 days: <link>". */
export function proWallReply(subject: string, from: string): string {
  return `${subject} part of GS Pro for the account that added GameShuffle to this server. Try GS Pro free for 14 days: <${SITE_URL}/gs-pro?from=${encodeURIComponent(from)}>`;
}
