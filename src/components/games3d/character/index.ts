/**
 * GameShuffle's 3D game characters (client, three.js). One character style
 * shared across our games: Shuffle Kart seats it in a kart, the side scroller
 * runs and flies it. Load it with a dynamic import, like the rest of three.js.
 *
 *   const art = await characterArt({ avatar, tone: [deep, bright], look: "helmet", badge: "7" });
 *   const c = new Character(art);
 *   scene.add(c.root);
 *   c.setPose("fly");
 *   c.update(dt, { thrust: 1 });
 */

export { characterArt, type CharacterArt, type CharacterTraits } from "./art";
export { Character, type CharacterOptions } from "./character";
export * from "./types";
