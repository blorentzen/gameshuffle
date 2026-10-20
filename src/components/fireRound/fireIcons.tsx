/**
 * Fire Round's category glyphs: Tabler icons only (never emoji), keyed by the
 * `icon` names in src/lib/originals/fireRound.ts.
 */

import { createElement } from "react";
import {
  IconAbc, IconArrowsShuffle, IconBallFootball, IconBuildingBank, IconBulb, IconDeviceGamepad2, IconDice5, IconFlask, IconGhost2, IconMovie, IconMusic,
  IconPhoto, IconPokeball, IconShieldHalf, IconSteeringWheel, IconSword, IconToolsKitchen2, IconWorld, type Icon,
} from "@tabler/icons-react";

export const FIRE_ICONS: Record<string, Icon> = {
  shuffle: IconArrowsShuffle,
  bulb: IconBulb,
  world: IconWorld,
  flask: IconFlask,
  history: IconBuildingBank,
  gamepad: IconDeviceGamepad2,
  movie: IconMovie,
  music: IconMusic,
  sports: IconBallFootball,
  food: IconToolsKitchen2,
  abc: IconAbc,
  photo: IconPhoto,
  shield: IconShieldHalf,
  kart: IconSteeringWheel,
  dice: IconDice5,
  sword: IconSword,
  pokeball: IconPokeball,
  ghost: IconGhost2,
};

export const fireIcon = (name: string | undefined): Icon => (name && FIRE_ICONS[name]) || IconArrowsShuffle;

/** A category's glyph, decorative. */
export function FireGlyph({ name, size = 16 }: { name: string | undefined; size?: number }) {
  return createElement(fireIcon(name), { size, "aria-hidden": true });
}
