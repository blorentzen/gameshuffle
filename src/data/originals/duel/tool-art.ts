// The tools' Item cards (tools picks 2026-10-25; Britton's rule: the name and the action fit the card).
// Each card's name, set, illustrator, large image size and art window [x, y, w, h], measured on its
// images.scrydex.com large image (scripts/data/story-art.json, read with the Pokémon TCG API and off the cards).

export interface ToolArtCard { name: string; set: string; artist: string | null; w: number; h: number; box: readonly [number, number, number, number] }

export const TOOL_ART: Readonly<Record<string, ToolArtCard>> = {
  "sv1-188": { name: "Potion", set: "Scarlet & Violet", artist: "Ayaka Yoshida", w: 734, h: 1024, box: [0.08, 0.141, 0.838, 0.373] },
  "base1-82": { name: "Full Heal", set: "Base Set", artist: "Keiji Kinebuchi", w: 600, h: 825, box: [0.118, 0.218, 0.764, 0.296] },
  "sv1-194": { name: "Switch", set: "Scarlet & Violet", artist: "Studio Bora Inc.", w: 734, h: 1024, box: [0.08, 0.141, 0.838, 0.373] },
  "me1-124": { name: "Premium Power Pro", set: "Mega Evolution", artist: "Toyste Beach", w: 733, h: 1024, box: [0.08, 0.141, 0.838, 0.373] },
  "sv1-171": { name: "Energy Retrieval", set: "Scarlet & Violet", artist: "Studio Bora Inc.", w: 734, h: 1024, box: [0.08, 0.141, 0.838, 0.373] },
  "base1-87": { name: "Pokédex", set: "Base Set", artist: "Keiji Kinebuchi", w: 600, h: 825, box: [0.118, 0.218, 0.764, 0.296] },
  "sv6pt5-61": { name: "Night Stretcher", set: "Shrouded Fable", artist: "Toyste Beach", w: 658, h: 918, box: [0.08, 0.141, 0.838, 0.373] },
};
