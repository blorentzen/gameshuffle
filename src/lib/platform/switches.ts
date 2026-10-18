/**
 * Every platform switch the code reads (gs_platform_flags), in plain words, so
 * Platform admin ▸ Switches can show each one even before it has a database
 * row. Add a switch here when code starts reading a new flag. Client-safe.
 */

export type SwitchGroup = "Shop" | "Events" | "Circuit" | "Sign-in";

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
    description: "Off: visitors can't buy (they get the Coming soon page if that switch is on, else page not found), and staff see the full shop. On: anyone can buy.",
    turnOn: "Anyone can buy from the shop, and it starts showing up in search. You can turn it off again.",
    turnOff: "Checkout closes and visitors lose the shop again. Orders already placed aren't affected.",
  },
  {
    key: "shop_coming_soon", group: "Shop", name: "Show the Coming soon shop page",
    description: "While the shop is closed. Off: /shop is page not found for visitors (hidden while products are being worked out, 2026-10-10). On: visitors see the Coming soon page with the email signup. Staff always see the full shop.",
    turnOn: "Visitors who go to /shop see the Coming soon page and can sign up for an email.",
    turnOff: "Visitors who go to /shop get page not found. Staff still see the full shop.",
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
    description: "Off: Circuit is free (preview). On: Circuit has launched: paid plans and checkout, and the Terms and /gs-circuit say so. Tournaments made before the first launch keep full access, and their organizers keep every Circuit feature free for 30 days after the launch email below.",
    turnOn: "Circuit launches now: paid plans and checkout open, the Terms publish the prices, and new organizers get one free lobby. Tournaments created before now keep full access, and organizers who made one keep Circuit free for 30 days after you send them the launch email.",
    turnOff: "Circuit goes back to free for everyone.",
  },
  {
    key: "circuit_billing_live", group: "Circuit", name: "Circuit plan changes",
    description: "Lets Circuit subscribers switch plans themselves. Off: they see what would change, but nothing is charged.",
    turnOn: "Circuit subscribers can change plans, and Stripe charges or credits them.",
    turnOff: "Plan changes show a preview only. Nothing is charged.",
  },
  {
    key: "auth_facebook", group: "Sign-in", name: "Sign in with Facebook",
    description: "Shows Continue with Facebook on sign-in and sign-up, and Facebook in Settings ▸ Sign-in & security. Needs Facebook turned on in Supabase ▸ Authentication ▸ Providers (live and dev) with the Meta app's ID and secret.",
    turnOn: "Everyone sees Continue with Facebook on sign-in and sign-up, and can connect Facebook in Settings.",
    turnOff: "The Facebook buttons disappear. People who already connected Facebook can still see and disconnect it in Settings.",
  },
];

/** Rows in gs_platform_flags that aren't switches (internal markers). */
export const NOT_SWITCHES = new Set(["organizer_billing_enabled_at", "organizer_circuit_notice_at", "organizer_circuit_notice_sent"]);

/** The Switches screen's sections, in the order switches first appear above (so a new group can't be left off the screen, as Sign-in was on 2026-10-18). */
export const SWITCH_GROUPS: SwitchGroup[] = [...new Set(SWITCHES.map((s) => s.group))];
