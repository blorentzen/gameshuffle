import type { KirbyGame, MachineType, StadiumKind } from "@/lib/kirby/types";

/**
 * Kirby Air Riders (Nintendo Switch 2, 2025). Researched 2026-09-29 from WiKirby
 * (game, Air Ride Machine, City Trial and update-history pages), Wikipedia and
 * Nintendo Life; current version 1.3.3, and no update has added riders,
 * machines, courses or Stadiums. 21 riders (4 at the start), 27 machines (Flight
 * Warp Star left out: Free Run only), 18 Air Ride courses (8 at the start), 9
 * Top Ride courses (WiKirby's short names), 16 City Trial Stadiums. Client-safe.
 */

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[.']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const RIDERS: [string, boolean][] = [
  ["Kirby", true], ["King Dedede", true], ["Meta Knight", true], ["Waddle Dee", true],
  ["Bandana Waddle Dee", false], ["Waddle Doo", false], ["Chef Kawasaki", false], ["Knuckle Joe", false],
  ["Rick", false], ["Gooey", false], ["Cappy", false], ["Rocky", false], ["Scarfy", false], ["Starman", false],
  ["Lololo & Lalala", false], ["Marx", false], ["Daroach", false], ["Magolor", false], ["Taranza", false],
  ["Susie", false], ["Noir Dedede", false],
];

const MACHINES: [string, MachineType, boolean][] = [
  ["Warp Star", "Star", true], ["Compact Star", "Star", true], ["Winged Star", "Star", false], ["Shadow Star", "Star", false],
  ["Wagon Star", "Star", false], ["Slick Star", "Star", false], ["Formula Star", "Star", false], ["Bulk Star", "Star", false],
  ["Rocket Star", "Star", false], ["Swerve Star", "Star", false], ["Turbo Star", "Star", false], ["Jet Star", "Star", false],
  ["Hop Star", "Star", false], ["Vampire Star", "Star", false], ["Paper Star", "Star", false], ["Transform Star", "Star", false],
  ["Wheelie Bike", "Bike", false], ["Rex Wheelie", "Bike", false], ["Wheelie Scooter", "Bike", false],
  ["Chariot", "Chariot", false], ["Battle Chariot", "Chariot", false],
  ["Tank Star", "Tank", false], ["Bull Tank", "Tank", false],
  ["Dragoon", "Legendary", false], ["Hydra", "Legendary", false], ["Leo", "Legendary", false], ["Gigantes", "Legendary", false],
];

const AIR_RIDE: [string, boolean][] = [
  ["Floria Fields", true], ["Waveflow Waters", true], ["Airtopia Ruins", true], ["Crystalline Fissure", true],
  ["Steamgust Forge", true], ["Cavernous Corners", true], ["Cyberion Highway", true], ["Mount Amberfalls", true],
  ["Galactic Nova", false], ["Fantasy Meadows", false], ["Celestial Valley", false], ["Sky Sands", false],
  ["Frozen Hillside", false], ["Magma Flows", false], ["Beanstalk Park", false], ["Machine Passage", false],
  ["Checker Knights", false], ["Nebula Belt", false],
];

const TOP_RIDE = ["Flower", "Flow", "Air", "Crystal", "Steam", "Cave", "Cyber", "Mountain", "Nova"];

const STADIUMS: [string, StadiumKind][] = [
  ["Kirby Melee", "battle"], ["Dustup Derby", "battle"], ["Big Battle", "battle"],
  ["Single Race", "race"], ["Drag Race", "race"], ["Oval Circuit", "race"], ["Rail Panic", "race"], ["Beam Gauntlet", "race"],
  ["Air Glider", "glide"], ["High Jump", "glide"], ["Target Flight", "glide"],
  ["Gourmet Race", "collect"], ["Skydive", "collect"], ["Button Rush", "collect"],
  ["VS. Boss", "boss"], ["VS. Gigantes", "boss"],
];

export const AIR_RIDERS: KirbyGame = {
  slug: "kirby-air-riders",
  label: "Kirby Air Riders",
  assetBase: "/images/kirby-air-riders/",
  artReady: true,
  riders: RIDERS.map(([name, starter]) => ({ name, starter, img: `riders/${slug(name)}.webp` })),
  machines: MACHINES.map(([name, type, starter]) => ({ name, type, starter, img: `machines/${slug(name)}.webp` })),
  machineTypes: [
    { id: "Star", label: "Stars", color: "#e8a317" },
    { id: "Bike", label: "Bikes", color: "#d6456f" },
    { id: "Chariot", label: "Chariots", color: "#7a52c7" },
    { id: "Tank", label: "Tanks", color: "#4f7d3a" },
    { id: "Legendary", label: "Legendary", color: "#2d5fb8" },
  ],
  // Checker Knights has no course card on WiKirby, so it shows the plain card.
  airRideCourses: AIR_RIDE.map(([name, starter]) => ({ name, starter, img: name === "Checker Knights" ? null : `courses/${slug(name)}.webp` })),
  topRideCourses: TOP_RIDE.map((name) => ({ name, starter: true, img: `top-ride/${slug(name)}.webp` })),
  stadiums: STADIUMS.map(([name, kind]) => ({ name, kind })),
  stadiumKinds: [
    { id: "battle", label: "Battle" },
    { id: "race", label: "Race" },
    { id: "glide", label: "Gliding" },
    { id: "collect", label: "Collecting" },
    { id: "boss", label: "Boss" },
  ],
};
