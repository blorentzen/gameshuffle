/**
 * Brand themes, profile skins and custom CSS are GS Pro (decided 2026-10-07).
 * Saving a non-default one needs Pro; pages render them only while the owner
 * has Pro. Saved choices are kept either way, so they come back the moment
 * someone starts (or restarts) GS Pro. Server only.
 */

import "server-only";
import { cache } from "react";
import { isProUser } from "@/lib/subscription-server";
import { resolveProfileSkin, type ProfileSkin } from "@/lib/profile/skin";

/** Is this page owner on GS Pro? Cached per request: one page can ask several times. */
export const ownerHasPro = cache((userId: string): Promise<boolean> => isProUser(userId));

const DEFAULT_SKIN = JSON.stringify(resolveProfileSkin(null));

/** True for the plain skin everyone gets (saving that never needs Pro). */
export function isDefaultSkin(skin: ProfileSkin): boolean {
  return JSON.stringify(skin) === DEFAULT_SKIN;
}
