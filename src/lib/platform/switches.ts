/**
 * Every platform switch the code reads (gs_platform_flags), in plain words, so
 * Platform admin ▸ Switches can show each one even before it has a database
 * row. Add a switch here when code starts reading a new flag. Client-safe.
 */

export type SwitchGroup = "Shop" | "Events" | "Circuit";

export interface SwitchDef {
  key: string;
  group: SwitchGroup;
  name: string;
  /** What On and Off mean, for the row. */
  description: string;
  /** Confirmation text when turning it on / off. */
  turnOn: string;
  turnOff: string;
}

export const SWITCHES: SwitchDef[] = [
  {
    key: "shop_open", group: "Shop", name: "Shop open to everyone",
    description: "Off: visitors see the Coming soon page with the email signup, and staff see the full shop. On: anyone can buy.",
    turnOn: "Anyone can buy from the shop, and it starts showing up in search. You can turn it off again.",
    turnOff: "Visitors go back to the Coming soon page and checkout closes. Orders already placed aren't affected.",
  },
  {
    key: "shop_live_catalog", group: "Shop", name: "Edit products in Stripe live mode",
    description: "Lets Shop ▸ Products create and change real Stripe products and prices once the site runs on live keys. Test mode never needs it.",
    turnOn: "Product changes in the admin will change real Stripe products and prices.",
    turnOff: "Product edits are refused while the site runs on live Stripe keys.",
  },
  {
    key: "paid_tickets_enabled", group: "Events", name: "Paid event tickets",
    description: "Paid ticket tiers, ticket checkout and organizer payouts for tournaments and game nights. Waiting on the tax and organizer-agreement answers.",
    turnOn: "Organizers can sell paid tickets and connect payout accounts.",
    turnOff: "New paid tickets can't be sold. Events that already sold tickets keep their orders.",
  },
  {
    key: "organizer_billing_enabled", group: "Circuit", name: "Circuit billing",
    description: "Off: Circuit is free (preview). On: organizer paid tiers and Circuit checkout. The first time it turns on, tournaments made before then keep full access.",
    turnOn: "Circuit paid tiers start. Tournaments created before now keep full access.",
    turnOff: "Circuit goes back to free for everyone.",
  },
  {
    key: "circuit_billing_live", group: "Circuit", name: "Circuit plan changes",
    description: "Lets Circuit subscribers switch plans themselves. Off: they see what would change, but nothing is charged.",
    turnOn: "Circuit subscribers can change plans, and Stripe charges or credits them.",
    turnOff: "Plan changes show a preview only. Nothing is charged.",
  },
];

/** Rows in gs_platform_flags that aren't switches (internal markers). */
export const NOT_SWITCHES = new Set(["organizer_billing_enabled_at"]);

export const SWITCH_GROUPS: SwitchGroup[] = ["Shop", "Events", "Circuit"];
