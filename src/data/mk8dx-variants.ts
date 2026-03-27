export interface CharacterVariant {
  character: string;
  variant: string;
  color: string; // hex for display
  img: string;
}

export interface TeamColor {
  name: string;
  hex: string;
}

// Available team colors (shared across all variant characters)
export const TEAM_COLORS: TeamColor[] = [
  { name: "Red", hex: "#F44336" },
  { name: "Blue", hex: "#2196F3" },
  { name: "Green", hex: "#4CAF50" },
  { name: "Yellow", hex: "#FFEB3B" },
  { name: "Pink", hex: "#E91E63" },
  { name: "Orange", hex: "#FF9800" },
  { name: "Light Blue", hex: "#03A9F4" },
  { name: "Black", hex: "#424242" },
  { name: "White", hex: "#E0E0E0" },
  { name: "Purple", hex: "#9C27B0" },
];

// Characters with multiple color/variant options
export const MK8DX_VARIANT_CHARACTERS: Record<string, CharacterVariant[]> = {
  Yoshi: [
    { character: "Yoshi", variant: "Green", color: "#4CAF50", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/yoshi.png" },
    { character: "Yoshi", variant: "Red", color: "#F44336", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/yoshi.png" },
    { character: "Yoshi", variant: "Light Blue", color: "#03A9F4", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/yoshi.png" },
    { character: "Yoshi", variant: "Yellow", color: "#FFEB3B", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/yoshi.png" },
    { character: "Yoshi", variant: "Pink", color: "#E91E63", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/yoshi.png" },
    { character: "Yoshi", variant: "Black", color: "#424242", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/yoshi.png" },
    { character: "Yoshi", variant: "White", color: "#E0E0E0", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/yoshi.png" },
    { character: "Yoshi", variant: "Orange", color: "#FF9800", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/yoshi.png" },
  ],
  "Shy Guy": [
    { character: "Shy Guy", variant: "Red", color: "#F44336", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
    { character: "Shy Guy", variant: "Blue", color: "#2196F3", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
    { character: "Shy Guy", variant: "Green", color: "#4CAF50", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
    { character: "Shy Guy", variant: "Yellow", color: "#FFEB3B", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
    { character: "Shy Guy", variant: "Light Blue", color: "#03A9F4", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
    { character: "Shy Guy", variant: "Pink", color: "#E91E63", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
    { character: "Shy Guy", variant: "Black", color: "#424242", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
    { character: "Shy Guy", variant: "White", color: "#E0E0E0", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
    { character: "Shy Guy", variant: "Orange", color: "#FF9800", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/shy-guy.png" },
  ],
  Birdo: [
    { character: "Birdo", variant: "Pink", color: "#E91E63", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
    { character: "Birdo", variant: "Red", color: "#F44336", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
    { character: "Birdo", variant: "Blue", color: "#2196F3", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
    { character: "Birdo", variant: "Yellow", color: "#FFEB3B", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
    { character: "Birdo", variant: "Green", color: "#4CAF50", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
    { character: "Birdo", variant: "Light Blue", color: "#03A9F4", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
    { character: "Birdo", variant: "Black", color: "#424242", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
    { character: "Birdo", variant: "White", color: "#E0E0E0", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
    { character: "Birdo", variant: "Orange", color: "#FF9800", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/birdo.png" },
  ],
  Inkling: [
    { character: "Inkling", variant: "Orange", color: "#FF9800", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/inkling.png" },
    { character: "Inkling", variant: "Blue", color: "#2196F3", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/inkling.png" },
    { character: "Inkling", variant: "Green", color: "#4CAF50", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/inkling.png" },
    { character: "Inkling", variant: "Pink", color: "#E91E63", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/inkling.png" },
    { character: "Inkling", variant: "Purple", color: "#9C27B0", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/inkling.png" },
    { character: "Inkling", variant: "Light Blue", color: "#03A9F4", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/inkling.png" },
  ],
};

export const VARIANT_CHARACTER_NAMES = Object.keys(MK8DX_VARIANT_CHARACTERS);

export function hasVariants(characterName: string): boolean {
  return characterName in MK8DX_VARIANT_CHARACTERS;
}

export function getVariants(characterName: string): CharacterVariant[] {
  return MK8DX_VARIANT_CHARACTERS[characterName] || [];
}

/**
 * Check if a variant character has a specific color available.
 */
export function hasColorVariant(characterName: string, colorName: string): boolean {
  const variants = getVariants(characterName);
  return variants.some((v) => v.variant === colorName);
}
