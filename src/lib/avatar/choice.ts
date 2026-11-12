/**
 * Which picture the site shows for an account (client-safe): their Twitch or
 * Discord picture when that's their chosen source and it's still there, else
 * their DiceBear Adventurer avatar from their seed (or account id) and look.
 * UserAvatar draws it; Shuffle Kart seats it in a kart.
 */

import type { AvatarOptions } from "./dicebear";

export type AvatarChoice =
  | { kind: "photo"; source: "twitch" | "discord"; url: string }
  | { kind: "dicebear"; seed: string; options: AvatarOptions | null };

export interface AvatarFields {
  id: string;
  avatar_source?: string | null;
  avatar_seed?: string | null;
  avatar_options?: AvatarOptions | null;
  twitch_avatar?: string | null;
  discord_avatar?: string | null;
}

export function avatarChoice(user: AvatarFields): AvatarChoice {
  const source = user.avatar_source ?? "dicebear";
  if (source === "twitch" && user.twitch_avatar) return { kind: "photo", source: "twitch", url: user.twitch_avatar };
  if (source === "discord" && user.discord_avatar) return { kind: "photo", source: "discord", url: user.discord_avatar };
  return { kind: "dicebear", seed: user.avatar_seed?.trim() || user.id, options: user.avatar_options ?? null };
}
