/**
 * GameShuffle's 3D game characters: the shared names and sizes (no three.js
 * here, so pages and server code can read them without pulling in the
 * renderer). The character itself lives in character.ts.
 *
 * One character style across GameShuffle's games (Shuffle Kart, the side
 * scroller): a low-poly body in a jersey in the player's two colors, arms,
 * hands and legs, wearing one of four heads made from the player's avatar.
 */

import type { AvatarOptions } from "@/lib/avatar/dicebear";

/**
 * The four heads:
 * - helmet: a racing helmet in the player's colors; the avatar's face (no hair) shows through the visor opening.
 * - token: the avatar printed on a thick round puck on a springy neck; the back is the player's number.
 * - built: a low-poly head built from the avatar's look (skin, hair color and style, face as a decal).
 * - cutout: the avatar as a thick die-cut sticker that turns toward the camera.
 */
export const CHARACTER_LOOKS = ["helmet", "token", "built", "cutout"] as const;
export type CharacterLook = (typeof CHARACTER_LOOKS)[number];

export function isCharacterLook(v: string | null | undefined): v is CharacterLook {
  return !!v && (CHARACTER_LOOKS as readonly string[]).includes(v);
}

/** seated: in a kart (hands on the wheel or handle). stand: on foot (runs with speed). fly: a jetpack on the back. */
export const CHARACTER_POSES = ["seated", "stand", "fly"] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

export function isCharacterPose(v: string | null | undefined): v is CharacterPose {
  return !!v && (CHARACTER_POSES as readonly string[]).includes(v);
}

/**
 * Whose face: a DiceBear Adventurer avatar (seed and look, as the site draws it),
 * or a photo served from our own origin (so the canvas it's drawn on stays readable).
 */
export type CharacterAvatar =
  | { kind: "dicebear"; seed: string; look: AvatarOptions | null }
  | { kind: "photo"; url: string };

export interface CharacterSpec {
  avatar: CharacterAvatar;
  /** The player's two colors: deep and bright (the jersey, helmet, puck rim). */
  tone: [string, string];
  look: CharacterLook;
  /** One or two characters for the helmet's back and the puck's back (a racer number). Null draws a star. */
  badge?: string | null;
}

/**
 * Sizes in world units (Shuffle Kart's units: a kart is about 30 long). The
 * character's origin is the middle of the hips; it faces +x with y up and +z
 * to its right. Scale `root` for another game.
 */
export const CHARACTER_SIZE = {
  /** Hip height above the feet when standing (put the origin this far above the ground). */
  standHip: 6.3,
  /** Top of the head above the hips (the helmet; the other heads are within half a unit). */
  headTop: 13.9,
  /** Shoulder width, outside to outside. */
  shoulders: 8.6,
} as const;

/** Where the hands go, in the character's own space (origin at the hips). */
export type CharacterGrip =
  /** A steering wheel: its center, radius and how far its top leans back toward the driver (radians). */
  | { kind: "wheel"; center: [number, number, number]; radius: number; tilt: number }
  /** Handlebars: their middle and half their width; they turn about the vertical with steering. */
  | { kind: "bar"; center: [number, number, number]; half: number }
  /** Something to hold that doesn't turn (a cart's sides, a roof edge): hands at center ± half across. */
  | { kind: "rail"; center: [number, number, number]; half: number };

export interface CharacterInput {
  /** -1 (left) to 1 (right): turns the wheel or bars, leans the body into the turn, turns the head. */
  steer?: number;
  /** -1 to 1: leans the body back (-) or forward (+), e.g. running or flying harder. */
  lean?: number;
  /** 0 to 1: jetpack flames (fly) and a forward tilt. */
  thrust?: number;
  /** World units a second: a running stride when standing, a little bounce when riding. */
  speed?: number;
  /** False under reduced motion: no wobble, sway or bounce. */
  motion?: boolean;
}
