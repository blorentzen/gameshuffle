/**
 * MKWorld track registry — all 32 tracks across 8 cups, derived from
 * `src/data/mkworld-data.json`. IDs are cup-prefixed slugs for parity
 * with the MK8DX registry (Mario Circuit / Rainbow Road also recur in
 * MKWorld). Knockout rallies are intentionally out of scope here —
 * they're a separate game mode in MKWorld and not part of race-level
 * track randomization.
 */

import type { Track } from "../types";

export const MKWORLD_TRACKS: Track[] = [
  { id: "mushroom-peach-stadium", name: "Peach Stadium", cup: "Mushroom", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Peach_Stadium.png", game: "mkworld" },
  { id: "mushroom-moo-moo-meadows", name: "Moo Moo Meadows", cup: "Mushroom", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Moo_Moo_Meadows.png", game: "mkworld" },
  { id: "mushroom-cheep-cheep-falls", name: "Cheep Cheep Falls", cup: "Mushroom", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Cheep_Cheep_Falls.png", game: "mkworld" },
  { id: "mushroom-shy-guy-bazaar", name: "Shy Guy Bazaar", cup: "Mushroom", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Shy_Guy_Bazaar.png", game: "mkworld" },
  { id: "shell-mario-bros-circuit", name: "Mario Bros. Circuit", cup: "Shell", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Mario_Bros_Circuit.png", game: "mkworld" },
  { id: "shell-salty-salty-speedway", name: "Salty Salty Speedway", cup: "Shell", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Salty_Salty_Speedway.jpg", game: "mkworld" },
  { id: "shell-koopa-troopa-beach", name: "Koopa Troopa Beach", cup: "Shell", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Koopa_Troopa_Beach.png", game: "mkworld" },
  { id: "shell-dandelion-depths", name: "Dandelion Depths", cup: "Shell", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Dandelion_Depths.png", game: "mkworld" },
  { id: "flower-mario-circuit", name: "Mario Circuit", cup: "Flower", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Mario_Circuit.png", game: "mkworld" },
  { id: "flower-crown-city", name: "Crown City", cup: "Flower", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Crown_City.png", game: "mkworld" },
  { id: "flower-dk-spaceport", name: "DK Spaceport", cup: "Flower", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/DK_Spaceport.png", game: "mkworld" },
  { id: "flower-toads-factory", name: "Toad's Factory", cup: "Flower", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Toads_Factory.png", game: "mkworld" },
  { id: "banana-desert-hills", name: "Desert Hills", cup: "Banana", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Desert_Hills.png", game: "mkworld" },
  { id: "banana-peach-beach", name: "Peach Beach", cup: "Banana", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Peach-Beach.jpg", game: "mkworld" },
  { id: "banana-acorn-heights", name: "Acorn Heights", cup: "Banana", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Acorn_Heights.png", game: "mkworld" },
  { id: "banana-dino-dino-jungle", name: "Dino Dino Jungle", cup: "Banana", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Dino_Dino_Jungle.png", game: "mkworld" },
  { id: "star-faraway-oasis", name: "Faraway Oasis", cup: "Star", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Faraway_Oasis.png", game: "mkworld" },
  { id: "star-choco-mountain", name: "Choco Mountain", cup: "Star", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Choco_Mountain.png", game: "mkworld" },
  { id: "star-sky-high-sundae", name: "Sky-High Sundae", cup: "Star", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Sky-High_Sundae.png", game: "mkworld" },
  { id: "star-airship-fortress", name: "Airship Fortress", cup: "Star", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Airship_Fortress.png", game: "mkworld" },
  { id: "leaf-boo-cinema", name: "Boo Cinema", cup: "Leaf", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Boo_Cinema.png", game: "mkworld" },
  { id: "leaf-dk-pass", name: "DK Pass", cup: "Leaf", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/DK_Pass.png", game: "mkworld" },
  { id: "leaf-dry-bones-burnout", name: "Dry Bones Burnout", cup: "Leaf", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Dry_Bones_Burnout.png", game: "mkworld" },
  { id: "leaf-wario-shipyard", name: "Wario Shipyard", cup: "Leaf", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Wario_Shipyard.png", game: "mkworld" },
  { id: "lightning-whistlestop-summit", name: "Whistlestop Summit", cup: "Lightning", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Whistlestop_Summit.png", game: "mkworld" },
  { id: "lightning-starview-peak", name: "Starview Peak", cup: "Lightning", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Starview_Peak.png", game: "mkworld" },
  { id: "lightning-wario-stadium", name: "Wario Stadium", cup: "Lightning", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Wario_Stadium.png", game: "mkworld" },
  { id: "lightning-bowsers-castle", name: "Bowser's Castle", cup: "Lightning", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Bowsers_Castle.png", game: "mkworld" },
  { id: "special-great-block-ruins", name: "Great ? Block Ruins", cup: "Special", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Great_%3F_Block_Ruins.png", game: "mkworld" },
  { id: "special-crown-city-night", name: "Crown City (Night)", cup: "Special", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Crown_City_Alt.png", game: "mkworld" },
  { id: "special-peach-stadium-night", name: "Peach Stadium (Night)", cup: "Special", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Peach_Stadium_Alt.png", game: "mkworld" },
  { id: "special-rainbow-road", name: "Rainbow Road", cup: "Special", image: "https://cdn.empac.co/gameshuffle/images/mkworld/courses/Rainbow_Road.png", game: "mkworld" },
];
