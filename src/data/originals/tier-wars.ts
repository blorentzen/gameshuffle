import { TIER_TEMPLATES } from "@/data/tier-templates";

/**
 * Tier Wars topics (a GameShuffle Original). Picture topics come straight from
 * the Tier List Maker templates (our own game art); text topics are our own
 * lists. A round deals a handful of items from one topic, so ranking on a phone
 * takes under a minute. Client-safe.
 */

export interface TierTopicItem { label: string; image?: string }
export interface TierTopic { id: string; label: string; items: TierTopicItem[] }

const TEXT_TOPICS: TierTopic[] = [
  { id: "pizza-toppings", label: "Pizza toppings", items: ["Pepperoni", "Pineapple", "Mushrooms", "Olives", "Extra cheese", "Anchovies", "Sausage", "Jalapeños", "Onions", "Bacon", "Spinach", "Barbecue chicken"].map((label) => ({ label })) },
  { id: "game-night-snacks", label: "Game night snacks", items: ["Popcorn", "Pretzels", "Nachos", "Pizza rolls", "Gummy bears", "Chips and dip", "Cookies", "Veggie tray", "Chocolate", "Wings", "Trail mix", "Cheese board"].map((label) => ({ label })) },
  { id: "mario-kart-items", label: "Mario Kart items", items: ["Banana", "Green shell", "Red shell", "Blue shell", "Mushroom", "Star", "Lightning", "Bob-omb", "Bullet Bill", "Blooper", "Golden Mushroom", "Coin", "Boo", "Super Horn"].map((label) => ({ label })) },
  { id: "game-night-roles", label: "Game night roles", items: ["Rule reader", "Banker", "Snack runner", "Score keeper", "Trash talker", "Sore loser", "Kingmaker", "Rules lawyer", "Host", "The one who's always late", "Dice roller", "Photographer"].map((label) => ({ label })) },
  { id: "breakfast", label: "Breakfast foods", items: ["Pancakes", "Waffles", "Bacon", "Cereal", "Eggs", "French toast", "Bagels", "Oatmeal", "Donuts", "Breakfast burrito", "Yogurt", "Hash browns"].map((label) => ({ label })) },
  { id: "ways-to-lose", label: "Ways to lose a game", items: ["Controller disconnects", "Blue shell on the last lap", "Misread the rules", "Rolled a one", "Betrayed by an ally", "Got distracted by snacks", "Forgot whose turn it was", "Lag", "Kingmaker'd", "Ran out of time", "Last-second steal", "Bad luck, pure and simple"].map((label) => ({ label })) },
];

const PICTURE_TOPICS: TierTopic[] = TIER_TEMPLATES.map((t) => ({ id: `template:${t.slug}`, label: t.title, items: t.items.map((i) => ({ label: i.label, image: i.image })) }));

export const TIER_TOPICS: TierTopic[] = [...TEXT_TOPICS, ...PICTURE_TOPICS];

export function tierTopic(id: string | null | undefined): TierTopic | null {
  return TIER_TOPICS.find((t) => t.id === id) ?? null;
}
