import type { HeroGame } from "@/lib/heroes/types";

/**
 * Overwatch hero roulette data. Generated from
 * specs/research/2026-10-05-randomizers/overwatch.json (weirdgloop wiki,
 * cross-checked with Blizzard's hero page). Heroes with a future `released`
 * date (Doctrine, 2026-10-06) appear automatically from that day. Sombra
 * moved from Damage (Recon) to Support (Tactician) in the 2026-10-06 patch. Maps are the
 * Standard pool (Arcade-only maps left out). Official hero portraits in public/images (scripts/pull-hero-art.ts).
 */
export const OVERWATCH: HeroGame = {
  slug: "overwatch",
  label: "Overwatch",
  short: "Overwatch",
  checkedOn: "2026-10-07",
  artReady: true,
  teamSize: 5,
  roleQueue: { tank: 1, damage: 2, support: 2 },
  roleQueueLabel: "Role queue (1 Tank, 2 Damage, 2 Support)",
  roles: [
    { id: "tank", label: "Tank", color: "#2f6fd6", icon: "shield" },
    { id: "damage", label: "Damage", color: "#c8413b", icon: "sword" },
    { id: "support", label: "Support", color: "#22936a", icon: "heart" },
  ],
  heroes: [
  {
    "name": "Tracer",
    "role": "damage",
    "subRole": "Flanker",
    "released": "2016-05-24"
  },
  {
    "name": "Reaper",
    "role": "damage",
    "subRole": "Flanker",
    "released": "2016-05-24"
  },
  {
    "name": "Widowmaker",
    "role": "damage",
    "subRole": "Sharpshooter",
    "released": "2016-05-24"
  },
  {
    "name": "Pharah",
    "role": "damage",
    "subRole": "Recon",
    "released": "2016-05-24"
  },
  {
    "name": "Reinhardt",
    "role": "tank",
    "subRole": "Stalwart",
    "released": "2016-05-24"
  },
  {
    "name": "Mercy",
    "role": "support",
    "subRole": "Medic",
    "released": "2016-05-24"
  },
  {
    "name": "Torbjörn",
    "role": "damage",
    "subRole": "Specialist",
    "released": "2016-05-24"
  },
  {
    "name": "Hanzo",
    "role": "damage",
    "subRole": "Sharpshooter",
    "released": "2016-05-24"
  },
  {
    "name": "Winston",
    "role": "tank",
    "subRole": "Initiator",
    "released": "2016-05-24"
  },
  {
    "name": "Zenyatta",
    "role": "support",
    "subRole": "Tactician",
    "released": "2016-05-24"
  },
  {
    "name": "Bastion",
    "role": "damage",
    "subRole": "Specialist",
    "released": "2016-05-24"
  },
  {
    "name": "Symmetra",
    "role": "damage",
    "subRole": "Specialist",
    "released": "2016-05-24"
  },
  {
    "name": "Zarya",
    "role": "tank",
    "subRole": "Bruiser",
    "released": "2016-05-24"
  },
  {
    "name": "Cassidy",
    "role": "damage",
    "subRole": "Sharpshooter",
    "released": "2016-05-24"
  },
  {
    "name": "Soldier: 76",
    "role": "damage",
    "subRole": "Specialist",
    "released": "2016-05-24"
  },
  {
    "name": "Lúcio",
    "role": "support",
    "subRole": "Tactician",
    "released": "2016-05-24"
  },
  {
    "name": "Roadhog",
    "role": "tank",
    "subRole": "Bruiser",
    "released": "2016-05-24"
  },
  {
    "name": "Junkrat",
    "role": "damage",
    "subRole": "Specialist",
    "released": "2016-05-24"
  },
  {
    "name": "D.Va",
    "role": "tank",
    "subRole": "Initiator",
    "released": "2016-05-24"
  },
  {
    "name": "Mei",
    "role": "damage",
    "subRole": "Specialist",
    "released": "2016-05-24"
  },
  {
    "name": "Genji",
    "role": "damage",
    "subRole": "Flanker",
    "released": "2016-05-24"
  },
  {
    "name": "Ana",
    "role": "support",
    "subRole": "Tactician",
    "released": "2016-07-19"
  },
  {
    "name": "Sombra",
    "role": "support",
    "subRole": "Tactician",
    "released": "2016-11-15"
  },
  {
    "name": "Orisa",
    "role": "tank",
    "subRole": "Bruiser",
    "released": "2017-03-21"
  },
  {
    "name": "Doomfist",
    "role": "tank",
    "subRole": "Initiator",
    "released": "2017-07-27"
  },
  {
    "name": "Moira",
    "role": "support",
    "subRole": "Medic",
    "released": "2017-11-16"
  },
  {
    "name": "Brigitte",
    "role": "support",
    "subRole": "Survivor",
    "released": "2018-03-20"
  },
  {
    "name": "Wrecking Ball",
    "role": "tank",
    "subRole": "Initiator",
    "released": "2018-07-24"
  },
  {
    "name": "Ashe",
    "role": "damage",
    "subRole": "Sharpshooter",
    "released": "2018-11-13"
  },
  {
    "name": "Baptiste",
    "role": "support",
    "subRole": "Tactician",
    "released": "2019-03-19"
  },
  {
    "name": "Sigma",
    "role": "tank",
    "subRole": "Stalwart",
    "released": "2019-08-13"
  },
  {
    "name": "Echo",
    "role": "damage",
    "subRole": "Recon",
    "released": "2020-04-14"
  },
  {
    "name": "Sojourn",
    "role": "damage",
    "subRole": "Sharpshooter",
    "released": "2022-10-04"
  },
  {
    "name": "Junker Queen",
    "role": "tank",
    "subRole": "Stalwart",
    "released": "2022-10-04"
  },
  {
    "name": "Kiriko",
    "role": "support",
    "subRole": "Medic",
    "released": "2022-10-04"
  },
  {
    "name": "Ramattra",
    "role": "tank",
    "subRole": "Stalwart",
    "released": "2022-12-06"
  },
  {
    "name": "Lifeweaver",
    "role": "support",
    "subRole": "Medic",
    "released": "2023-04-11"
  },
  {
    "name": "Illari",
    "role": "support",
    "subRole": "Survivor",
    "released": "2023-08-10"
  },
  {
    "name": "Mauga",
    "role": "tank",
    "subRole": "Bruiser",
    "released": "2023-12-05"
  },
  {
    "name": "Venture",
    "role": "damage",
    "subRole": "Flanker",
    "released": "2024-04-16"
  },
  {
    "name": "Juno",
    "role": "support",
    "subRole": "Survivor",
    "released": "2024-08-20"
  },
  {
    "name": "Hazard",
    "role": "tank",
    "subRole": "Initiator",
    "released": "2024-12-10"
  },
  {
    "name": "Freja",
    "role": "damage",
    "subRole": "Recon",
    "released": "2025-04-22"
  },
  {
    "name": "Wuyang",
    "role": "support",
    "subRole": "Survivor",
    "released": "2025-08-26"
  },
  {
    "name": "Vendetta",
    "role": "damage",
    "subRole": "Flanker",
    "released": "2025-12-09"
  },
  {
    "name": "Anran",
    "role": "damage",
    "subRole": "Flanker",
    "released": "2026-02-10"
  },
  {
    "name": "Domina",
    "role": "tank",
    "subRole": "Stalwart",
    "released": "2026-02-10"
  },
  {
    "name": "Emre",
    "role": "damage",
    "subRole": "Specialist",
    "released": "2026-02-10"
  },
  {
    "name": "Mizuki",
    "role": "support",
    "subRole": "Survivor",
    "released": "2026-02-10"
  },
  {
    "name": "Jetpack Cat",
    "role": "support",
    "subRole": "Tactician",
    "released": "2026-02-10"
  },
  {
    "name": "Sierra",
    "role": "damage",
    "subRole": "Recon",
    "released": "2026-04-14"
  },
  {
    "name": "Shion",
    "role": "damage",
    "subRole": "Flanker",
    "released": "2026-06-16"
  },
  {
    "name": "D.Mon",
    "role": "tank",
    "subRole": "Stalwart",
    "released": "2026-08-11"
  },
  {
    "name": "Doctrine",
    "role": "support",
    "subRole": "Survivor",
    "released": "2026-10-06"
  }
],
  maps: [
  {
    "name": "Antarctic Peninsula",
    "mode": "Control"
  },
  {
    "name": "Busan",
    "mode": "Control"
  },
  {
    "name": "Ilios",
    "mode": "Control"
  },
  {
    "name": "Lijiang Tower",
    "mode": "Control"
  },
  {
    "name": "Nepal",
    "mode": "Control"
  },
  {
    "name": "Oasis",
    "mode": "Control"
  },
  {
    "name": "Samoa",
    "mode": "Control"
  },
  {
    "name": "Circuit Royal",
    "mode": "Escort"
  },
  {
    "name": "Dorado",
    "mode": "Escort"
  },
  {
    "name": "Havana",
    "mode": "Escort"
  },
  {
    "name": "Junkertown",
    "mode": "Escort"
  },
  {
    "name": "Rialto",
    "mode": "Escort"
  },
  {
    "name": "Route 66",
    "mode": "Escort"
  },
  {
    "name": "Shambali Monastery",
    "mode": "Escort"
  },
  {
    "name": "Watchpoint: Gibraltar",
    "mode": "Escort"
  },
  {
    "name": "Aatlis",
    "mode": "Flashpoint"
  },
  {
    "name": "New Junk City",
    "mode": "Flashpoint"
  },
  {
    "name": "Suravasa",
    "mode": "Flashpoint"
  },
  {
    "name": "Blizzard World",
    "mode": "Hybrid"
  },
  {
    "name": "Eichenwalde",
    "mode": "Hybrid"
  },
  {
    "name": "Hollywood",
    "mode": "Hybrid"
  },
  {
    "name": "King's Row",
    "mode": "Hybrid"
  },
  {
    "name": "Midtown",
    "mode": "Hybrid"
  },
  {
    "name": "Neon Junction",
    "mode": "Hybrid"
  },
  {
    "name": "Numbani",
    "mode": "Hybrid"
  },
  {
    "name": "Paraíso",
    "mode": "Hybrid"
  },
  {
    "name": "Colosseo",
    "mode": "Push"
  },
  {
    "name": "Esperança",
    "mode": "Push"
  },
  {
    "name": "New Queen Street",
    "mode": "Push"
  },
  {
    "name": "Runasapi",
    "mode": "Push"
  }
],
};
