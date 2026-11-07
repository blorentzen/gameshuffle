/**
 * The randomizers' reel (KartSlot, and a game space's Roll for me): when each frame shows, in ms from the start, and
 * when it lands on the pick. Fast at first, easing to a stop. More steps run a little longer, so parts given more
 * steps land one after another.
 */
export function reelTimes(steps = 16): { frames: number[]; land: number } {
  const frames: number[] = [];
  let t = 0;
  for (let i = 0; i < steps; i++) {
    t += 22 + Math.pow(i / steps, 2.3) * 135; // ease-out spacing
    frames.push(t);
  }
  return { frames, land: t + 70 };
}

/** How long the landing pop runs before the reel is idle again. */
export const REEL_LAND_MS = 420;
