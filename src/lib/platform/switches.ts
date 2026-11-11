/**
 * Every platform switch the code reads (gs_platform_flags), in plain words, so
 * Platform admin ▸ Switches can show each one even before it has a database
 * row. Add a switch here when code starts reading a new flag. Client-safe.
 */

export type SwitchGroup = "Shop" | "Events" | "Circuit" | "Sign-in" | "Support" | "Discord" | "Streaming";

export interface SwitchDef {
  key: string;
  group: SwitchGroup;
  name: string;
  /** What On and Off mean, for the row. */
  description: string;
  /** Confirmation text when turning it on / off. */
  turnOn: string;
  turnOff: string;
  /** What the code does while the switch has no row yet (getPlatformFlag's fallback). Off unless set. */
  defaultOn?: boolean;
}

export const SWITCHES: SwitchDef[] = [
  {
    key: "speedrun_listed", group: "Streaming", name: "Speedrun overlay in the menus",
    description: "Speedrun launch (picks 2026-11-10): /speedrun is live and in search from the release; this lists it in the Stream menu, the footer, the For streamers pages and the chat games guide. Off for the quiet week while the first runners try it.",
    turnOn: "The speedrun overlay shows in the Stream menu, the footer, the For streamers pages and the chat games guide.",
    turnOff: "The speedrun overlay leaves the menus and guides. /speedrun still works for anyone with the link.",
  },
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
    key: "printful_auto_confirm", group: "Shop", name: "Send merch orders to Printful automatically",
    description: "Off: each paid merch order waits in Printful as a draft until someone presses Send to Printful on the order. On: paid orders go straight to Printful, which charges for them when it does.",
    turnOn: "New paid merch orders go straight to Printful for printing.",
    turnOff: "New paid merch orders wait as drafts until someone presses Send to Printful.",
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
  {
    key: "support_supporter_looks", group: "Support", name: "Supporter looks", defaultOn: true,
    description: "On (the default): the $3 Supporter level also unlocks every look (MMR card looks, profile and community skins, brand themes, custom CSS, dice and coin looks), checkout collects sales tax and the Terms like Backer, and looks walls offer Supporter first. Off: new Supporter subscriptions are a thank-you only (a gift, no tax). Needs its database update first.",
    turnOn: "New Supporter subscriptions are sold with looks and taxed. Looks walls offer Supporter at $3 first. People who already give $3 a month as a thank-you keep that until they choose Supporter again.",
    turnOff: "New Supporter subscriptions go back to a thank-you with no looks, and looks walls offer GS Pro only. Anyone who bought Supporter with looks keeps them.",
  },
  {
    key: "support_international", group: "Support", name: "Support outside the US", defaultOn: true,
    description: "On (the default): anyone, anywhere Stripe takes cards, can give support, once or monthly at every level (Supporter looks, Backer and Champion with GS Pro). Checkout adds any sales tax, VAT or GST Stripe Tax collects for GameShuffle's registrations. Off: support goes back to US billing addresses only; checkout refuses other countries and a non-US billing address is refunded. GS Pro's own plan checkout stays US-only either way.",
    turnOn: "Support opens to every country Stripe takes cards from. The support asks and the Supporter looks walls show their buttons outside the US instead of the waitlist.",
    turnOff: "Support is US-only again: other countries see the waitlist, and new support with a non-US billing address is refunded. Support already given stays.",
  },
  {
    key: "comp_war_room", group: "Discord", name: "War room button on war cards",
    description: "Shows War room on GameShuffle Competitive's war cards, which opens its Activity in that channel. Turn on only after Activities are switched on for GameShuffle Competitive in the Discord Developer Portal (URL mapping / to activity.gameshuffle.co); before that the button fails when pressed. The App Launcher works either way once Activities are on.",
    turnOn: "War cards get a War room button from their next change. Make sure Activities are on for GameShuffle Competitive first.",
    turnOff: "War cards lose the War room button from their next change. The App Launcher still opens the War room.",
  },
  {
    key: "comp_ladders", group: "Discord", name: "GS Ranked",
    description: "Opens /ranked on GameShuffle Competitive and the lounge pages at /ranked/<address>: a lounge's ranked board, where reporters submit tables, updaters verify and MMR moves. Turn on once the lounge you're starting with is ready (needs its database updates first).",
    turnOn: "/ranked works in every server with GameShuffle Competitive, and the lounge pages open.",
    turnOff: "/ranked says GS Ranked isn't open yet, and the lounge pages show page not found. Nothing is deleted.",
  },
];

/** Rows in gs_platform_flags that aren't switches (internal markers). */
export const NOT_SWITCHES = new Set(["organizer_billing_enabled_at", "organizer_circuit_notice_at", "organizer_circuit_notice_sent"]);

/** The Switches screen's sections, in the order switches first appear above (so a new group can't be left off the screen, as Sign-in was on 2026-10-18). */
export const SWITCH_GROUPS: SwitchGroup[] = [...new Set(SWITCHES.map((s) => s.group))];
