import type { SmkGame } from "@/lib/super-mario-kart/types";

/**
 * Super Mario Kart (Super NES, 1992). Checked 2026-11-12 on Super Mario Wiki (mariowiki.com):
 *   - "Super Mario Kart": Characters (eight drivers in four pairs with the same stats, as the manual names them: The
 *     Bros., The Dragon and The Lady, The Showdown, The Small Guys; the game calls Peach "Princess"), Courses (20
 *     courses, five to a cup, in four cups in order; four battle courses), Gameplay (50cc, 100cc and 150cc, 150cc
 *     after every cup is cleared in 100cc; outside Mario Kart GP everyone races at 100cc), Game modes (Mario Kart GP
 *     for one or two players with a field of eight, Match Race and Battle Mode for two players only, Balloon Battle
 *     the only battle).
 * Two players and the same character: the wiki doesn't say. A two-player Grand Prix fills its field of eight with
 * the six characters the players didn't take, and Mario Kart 64 (the next game) doesn't allow a repeat either, so
 * the randomizer gives the two players different characters.
 *
 * Do not reorder these lists: saved setups and chat rolls store names, and shared rolls are read back by name.
 * Art: scripts/pull-super-mario-kart-art.ts (sources in scripts/data/super-mario-kart-art.json).
 */
export const SUPER_MARIO_KART: SmkGame = {
  slug: "super-mario-kart",
  name: "Super Mario Kart",
  assetBase: "/images/super-mario-kart/",
  checkedOn: "2026-11-12",
  classes: [
    { id: "bros", name: "The Bros.", line: "Standard Performance" },
    { id: "dragon", name: "The Dragon and The Lady", line: "Fast Acceleration" },
    { id: "showdown", name: "The Showdown", line: "High Top Speed" },
    { id: "small", name: "The Small Guys", line: "Good Control" },
  ],
  characters: [
    { name: "Mario", slug: "mario", class: "bros", color: "#e60012" },
    { name: "Luigi", slug: "luigi", class: "bros", color: "#2a9d3a" },
    { name: "Princess", slug: "princess", class: "dragon", color: "#e886b4" },
    { name: "Yoshi", slug: "yoshi", class: "dragon", color: "#4fb33a" },
    { name: "Bowser", slug: "bowser", class: "showdown", color: "#3e7a2c" },
    { name: "Donkey Kong Jr.", slug: "donkey-kong-jr", class: "showdown", color: "#8a4a1e" },
    { name: "Koopa Troopa", slug: "koopa-troopa", class: "small", color: "#3b9a3b" },
    { name: "Toad", slug: "toad", class: "small", color: "#e2463b" },
  ],
  cups: [
    { name: "Mushroom Cup", slug: "mushroom", courses: [
      { name: "Mario Circuit 1", slug: "mario-circuit-1" },
      { name: "Donut Plains 1", slug: "donut-plains-1" },
      { name: "Ghost Valley 1", slug: "ghost-valley-1" },
      { name: "Bowser Castle 1", slug: "bowser-castle-1" },
      { name: "Mario Circuit 2", slug: "mario-circuit-2" },
    ] },
    { name: "Flower Cup", slug: "flower", courses: [
      { name: "Choco Island 1", slug: "choco-island-1" },
      { name: "Ghost Valley 2", slug: "ghost-valley-2" },
      { name: "Donut Plains 2", slug: "donut-plains-2" },
      { name: "Bowser Castle 2", slug: "bowser-castle-2" },
      { name: "Mario Circuit 3", slug: "mario-circuit-3" },
    ] },
    { name: "Star Cup", slug: "star", courses: [
      { name: "Koopa Beach 1", slug: "koopa-beach-1" },
      { name: "Choco Island 2", slug: "choco-island-2" },
      { name: "Vanilla Lake 1", slug: "vanilla-lake-1" },
      { name: "Bowser Castle 3", slug: "bowser-castle-3" },
      { name: "Mario Circuit 4", slug: "mario-circuit-4" },
    ] },
    { name: "Special Cup", slug: "special", courses: [
      { name: "Donut Plains 3", slug: "donut-plains-3" },
      { name: "Koopa Beach 2", slug: "koopa-beach-2" },
      { name: "Ghost Valley 3", slug: "ghost-valley-3" },
      { name: "Vanilla Lake 2", slug: "vanilla-lake-2" },
      { name: "Rainbow Road", slug: "rainbow-road" },
    ] },
  ],
  battleCourses: [
    { name: "Battle Course 1", slug: "battle-course-1" },
    { name: "Battle Course 2", slug: "battle-course-2" },
    { name: "Battle Course 3", slug: "battle-course-3" },
    { name: "Battle Course 4", slug: "battle-course-4" },
  ],
  engines: ["50cc", "100cc", "150cc"],
};
