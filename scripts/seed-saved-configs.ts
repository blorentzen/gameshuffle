/**
 * Seed realistic saved configs onto an account.
 *
 * The dev database has accounts with an empty "Setups & Games" tab, which makes
 * the config list, the detail modal and the profile config count impossible to
 * look at while building. This fills one (or several) accounts with the six
 * config types, built from the REAL game data in src/data, so names and images
 * resolve and the detail modal renders what it would for a real save.
 *
 * Idempotent: a config is skipped when that account already has one with the
 * same name, so re-running tops an account up rather than duplicating.
 *
 * Usage:
 *   npx tsx scripts/seed-saved-configs.ts --dry
 *   npx tsx scripts/seed-saved-configs.ts
 *   npx tsx scripts/seed-saved-configs.ts --email someone@example.com
 *   npx tsx scripts/seed-saved-configs.ts --all        (every account, dev only)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import mk8dx from "../src/data/mk8dx-data.json";
import mkworld from "../src/data/mkworld-data.json";
import type { SavedConfigData } from "../src/data/config-types";

const DEFAULT_EMAIL = "brittonlorentzen@gmail.com";
const MK8DX_SLUG = "mario-kart-8-deluxe";
const MKW_SLUG = "mario-kart-world";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const all = args.includes("--all");
const emailArg = args.indexOf("--email");
const email = emailArg >= 0 ? args[emailArg + 1] : DEFAULT_EMAIL;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key);

// --- helpers ---------------------------------------------------------------

type Named = { name: string; img: string };
const pick = <T,>(list: T[], name: string, key: keyof T = "name" as keyof T): T => {
  const hit = list.find((x) => String(x[key]) === name);
  if (!hit) throw new Error(`Not found in game data: ${name}`);
  return hit;
};
const slim = (x: { name: string; img: string }): Named => ({ name: x.name, img: x.img });

const chars = mk8dx.characters as Named[];
const vehicles = mk8dx.vehicles as (Named & { type: string; drift: string })[];
const wheels = mk8dx.wheels as Named[];
const gliders = mk8dx.gliders as Named[];
const items = mk8dx.items as (Named & { category: string })[];
const cups = mk8dx.cups as { name: string; img: string; courses: Named[] }[];

/** Flatten every course once so track lists can be drawn across cups. */
const courses = cups.flatMap((c) => c.courses.map((t) => ({ ...t, cup: c.name, cupImg: c.img })));
/** First match wins for the duplicated names (Rainbow Road x5, Mario Circuit
 *  x3). Saved configs store name + image, not the c{cup}-t{course} id the
 *  tournament code uses, so any of them renders correctly. */
const course = (name: string) => {
  const hit = courses.find((c) => c.name === name);
  if (!hit) throw new Error(`No course named ${name}`);
  return hit;
};

const build = (character: string, vehicle: string, wheel: string, glider: string) => ({
  character: slim(pick(chars, character)),
  vehicle: slim(pick(vehicles, vehicle)),
  wheels: slim(pick(wheels, wheel)),
  glider: slim(pick(gliders, glider)),
});

function shareToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

// --- the configs -----------------------------------------------------------

interface Seed {
  name: string;
  slug: string;
  data: SavedConfigData;
}

function seeds(): Seed[] {
  const meta = build("Metal Mario", "Teddy Buggy", "Roller", "Cloud");
  const inward = build("Peach", "Sport Bike", "Roller", "Super");

  return [
    {
      name: "Meta — Metal Mario / Teddy Buggy",
      slug: MK8DX_SLUG,
      data: { type: "kart-build", gameSlug: MK8DX_SLUG, ...meta },
    },
    {
      name: "Inward drift — Peach / Sport Bike",
      slug: MK8DX_SLUG,
      data: { type: "kart-build", gameSlug: MK8DX_SLUG, ...inward },
    },
    {
      name: "Competitive items (no blues)",
      slug: MK8DX_SLUG,
      data: {
        type: "item-set",
        gameSlug: MK8DX_SLUG,
        items: ["Banana", "Green Shell", "Red Shell", "Mushroom", "Super Horn", "Coin"]
          .map((n) => slim(pick(items, n))),
      },
    },
    {
      name: "200cc gauntlet",
      slug: MK8DX_SLUG,
      data: {
        type: "track-list",
        gameSlug: MK8DX_SLUG,
        tracks: ["Rainbow Road", "Bowser's Castle", "Mount Wario", "Big Blue"]
          .map((n) => { const c = course(n); return { name: c.name, img: c.img, cup: c.cup }; }),
      },
    },
    {
      name: "House rules — 150cc, no blues",
      slug: MK8DX_SLUG,
      data: {
        type: "ruleset",
        gameSlug: MK8DX_SLUG,
        mode: "competitive",
        cc: "150cc",
        items: true,
        charFilters: ["Heavy"],
        vehiFilters: ["Bike"],
        bannedTrackIds: ["c0-t0", "c5-t2"],
      },
    },
    {
      name: "Friday night crew",
      slug: MK8DX_SLUG,
      data: {
        type: "player-preset",
        gameSlug: MK8DX_SLUG,
        players: ["Britton", "Sam", "Jules", "Riya", "Marco", "Dee"],
      },
    },
    {
      name: "Game night — 8 races, 4 players",
      slug: MK8DX_SLUG,
      data: {
        type: "game-night-setup",
        gameSlug: MK8DX_SLUG,
        players: [
          { name: "Britton", combo: build("Yoshi", "Mach 8", "Slick", "Super") },
          { name: "Sam", combo: build("Waluigi", "Wild Wiggler", "Azure Roller", "Cloud") },
          { name: "Jules", combo: build("Toad", "Pipe Frame", "Roller", "Paraglider") },
          { name: "Riya", combo: null },
        ],
        charFilters: [],
        vehiFilters: [],
        tracks: ["Mario Kart Stadium", "Water Park", "Sweet Sweet Canyon", "Thwomp Ruins",
                 "Mario Circuit", "Toad Harbor", "Twisted Mansion", "Shy Guy Falls"]
          .map((n) => { const c = course(n); return { name: c.name, img: c.img, cupImg: c.cupImg }; }),
        trackCount: 8,
        noDups: true,
        tourOnly: false,
        activeItems: ["Banana", "Green Shell", "Red Shell", "Mushroom", "Star", "Bob-omb"],
      },
    },
    // One MK World entry so the list is not single-game. MKW combos are two
    // parts, but the stored shape keeps all four slots; wheels/glider stay
    // empty and PlayerCard hides them via hasWheels / hasGlider.
    {
      name: "MK World — Rosalina / Cloud 9",
      slug: MKW_SLUG,
      data: {
        type: "kart-build",
        gameSlug: MKW_SLUG,
        character: slim(pick(mkworld.characters as Named[], "Rosalina")),
        vehicle: slim(pick(mkworld.vehicles as Named[], "Cloud 9")),
        wheels: { name: "", img: "" },
        glider: { name: "", img: "" },
      },
    },
  ];
}

// --- run -------------------------------------------------------------------

(async () => {
  console.log(`project ${url.slice(8, 14)}…  ${dry ? "(DRY RUN)" : ""}`);

  const q = db.from("user_directory").select("id, username, email");
  const { data: users, error } = all ? await q.limit(200) : await q.ilike("email", email);
  if (error) throw new Error(error.message);
  if (!users?.length) throw new Error(`No account matching ${all ? "--all" : email}`);

  const rows = seeds();
  console.log(`${users.length} account(s), ${rows.length} configs each\n`);

  for (const u of users) {
    const { data: existing } = await db
      .from("saved_configs").select("config_name").eq("user_id", u.id);
    const have = new Set((existing ?? []).map((r) => r.config_name));

    const todo = rows.filter((r) => !have.has(r.name));
    console.log(`${u.email ?? u.username ?? u.id}: ${have.size} existing, inserting ${todo.length}`);
    if (!todo.length || dry) {
      todo.forEach((r) => console.log(`    + ${r.name}`));
      continue;
    }

    const { error: insErr } = await db.from("saved_configs").insert(
      todo.map((r) => ({
        user_id: u.id,
        randomizer_slug: r.slug,
        config_name: r.name,
        config_data: r.data,
        share_token: shareToken(),
      })),
    );
    if (insErr) console.error(`    failed: ${insErr.message}`);
    else todo.forEach((r) => console.log(`    + ${r.name}`));
  }

  console.log("\ndone");
})();
