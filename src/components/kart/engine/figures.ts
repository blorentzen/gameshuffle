/**
 * Shuffle Kart's 3D drivers (client, development only for now: ?look=): a
 * racer as one of GameShuffle's shared game characters
 * (src/components/games3d/character) instead of the flat picture. Picks the
 * avatar, colors and racer number for a driver. Loaded only from the engine
 * and the turntable, which come in with a dynamic import.
 */

import { characterArt, type CharacterArt, type CharacterLook, type CharacterSpec } from "@/components/games3d/character";
import { CAST } from "@/lib/kart/content";
import { TONE_COLORS, type Driver } from "@/lib/kart/roster";
import type { OwnAvatar } from "./avatars";

/** A driver as a character: a cast member's avatar and number, or yours (a star on the back). */
export function figureSpec(driver: Driver, own: OwnAvatar, look: CharacterLook): CharacterSpec {
  const tone = TONE_COLORS[driver.tone] ?? TONE_COLORS.blue;
  if (driver.cast) {
    const i = CAST.findIndex((c) => c.id === driver.cast!.id);
    return { avatar: { kind: "dicebear", seed: driver.cast.seed, look: driver.cast.look }, tone, look, badge: String(i + 1) };
  }
  if (own.kind === "photo") return { avatar: { kind: "photo", url: own.url }, tone, look, badge: null };
  return { avatar: { kind: "dicebear", seed: own.seed, look: own.options }, tone, look, badge: null };
}

export function figureArt(driver: Driver, own: OwnAvatar, look: CharacterLook): Promise<CharacterArt> {
  return characterArt(figureSpec(driver, own, look));
}
