/**
 * Every Plausible custom event GameShuffle sends, in one list. Plausible only
 * charts an event once it's added as a goal in the dashboard, so this file is
 * also the list to copy goals from.
 *
 * Naming: "Thing Verbed" with a few short props ({ game, tool, source }).
 * Older names (Randomize Karts, Party Setup Rolled, Tool Used…) predate this
 * list and stay as they are: renaming would split their history.
 *
 * Client-safe. Use `track()` anywhere in client code, or `useAnalytics()` in
 * components that already use it.
 */

export const EVENTS = {
  // Originals
  dailyStarted: "Daily Started",
  dailyFinished: "Daily Finished",
  dailyShared: "Daily Shared",
  dailyClueRevealed: "Daily Clue Revealed",
  weeklySubmitted: "Weekly Submitted",
  weeklyResultsViewed: "Weekly Results Viewed",
  brainAnswered: "Brain Answered",
  brainAudienceSaved: "Brain Audience Saved",
  brainShareCopied: "Brain Share Copied",
  brainUpdatesSignup: "Brain Updates Signup",

  /** A guest put their name on the Daily leaderboards. {game} */
  dailyBoardJoined: "Daily Board Joined",
  /** "Copy today's results": every daily played today in one post. {games: count, from} */
  dailiesShared: "Dailies Shared",
  /** The today bar or Next up took someone to another daily. {to, from, via: bar|next} */
  dailiesSwitched: "Dailies Switched",
  /** "Copy link" on the dailies' Invite friends card or Account ▸ Invite friends. {from} */
  referralLinkCopied: "Referral Link Copied",
  /** Tokens spent on help at a daily's last chance. {game, kind: letter|guess} */
  dailyHelpBought: "Daily Help Bought",

  /** A homepage section's card or button (Run the night, Pokémon, the plans band). {to} */
  homeSectionClicked: "Home Section Clicked",

  // Support GameShuffle (/support)
  /** A quiet "help keep it free" link or the footer link. {from} */
  supportClicked: "Support Clicked",
  /** Checkout opened. {kind: once | monthly, amount} (whole dollars) */
  supportCheckoutStarted: "Support Checkout Started",
  /** Back on the thanks page with a paid session. {kind, amount} */
  supportCompleted: "Support Completed",

  // Shop
  /** "Notify me" on the shop's Coming soon page. {signedIn} */
  shopUpdatesJoined: "Shop Updates Joined",
  /** A link into the shop from around the site (props: { from: nav | home-band | tcg | game-nights }). */
  shopLinkClicked: "Shop Link Clicked",
  /** A link out to our TCGplayer store (singles). {from: daily-dex|...} */
  tcgStoreClicked: "TCG Store Clicked",
  /** A shop order was paid (server event; props: { placement, source }). Revenue rides along. */
  shopOrderPlaced: "Shop Order Placed",

  // Discord
  /** "Add to Discord" on /discord. {from: hero|steps|band} */
  discordAddClicked: "Discord Add Clicked",
  /** "Play in Discord" (opens the Activity) on /discord. {from} */
  discordPlayClicked: "Discord Play Clicked",
  /** A link to /discord from elsewhere on the site. {from: daily|weekly|home|...} */
  discordLinkClicked: "Discord Link Clicked",

  // GS Pro and billing
  upgradeClicked: "Upgrade Clicked",
  /** A "See GS Circuit" link in a plans panel (PlansPanel). {from} */
  circuitClicked: "Circuit Clicked",
  /** Fire Round (solo trivia): a round started {mode: daily|free, length, category}. */
  fireRoundStarted: "Fire Round Started",
  /** A round ended {mode, length, category, score: 0 | 1+ | 500+ | 1000+}. */
  fireRoundFinished: "Fire Round Finished",
  /** "Copy my score" {mode}. */
  fireRoundShared: "Fire Round Shared",
  /** The Share button on any result (src/components/share): {game, via: sheet|window}, then where it went {game, place}. */
  shareOpened: "Share Opened",
  shareSent: "Share Sent",
  checkoutStarted: "Checkout Started",
  checkoutCompleted: "Checkout Completed",
  checkoutCanceled: "Checkout Canceled",
  waitlistJoined: "Waitlist Joined",
  portalOpened: "Portal Opened",

  // Live party nights (phones + TV)
  nightStarted: "Night Started",
  nightJoined: "Night Joined",
  nightEnded: "Night Ended",
  nightGameFinished: "Night Game Finished",
  nightRecapViewed: "Night Recap Viewed",
  nightTvOpened: "Night TV Opened",

  // Game nights (events)
  gameNightCreated: "Game Night Created",
  rsvp: "RSVP",
  seriesCreated: "Series Created",
  /** The share menu on a tournament, game night or season page. {type, via: link|discord|x|facebook|native} */
  eventShared: "Event Shared",

  // Trivia Nights
  /** A host started a night from a template. {template} */
  triviaNightCreated: "Trivia Night Created",
  /** A host opened the room (teams can join). {questions} */
  triviaRoomOpened: "Trivia Room Opened",
  /** A team joined from a phone. */
  triviaTeamJoined: "Trivia Team Joined",
  /** Claude drafted questions in the studio. {count} */
  triviaQuestionsDrafted: "Trivia Questions Drafted",
  /** The host filled rounds from the GameShuffle pack. {added, scope: all|round} */
  triviaPackFilled: "Trivia Pack Filled",
  /** A host started a league. {weeks, scoring} */
  triviaLeagueStarted: "Trivia League Started",
  /** A captain entered a team in a league from the league page. {crew: yes|no} */
  triviaLeagueTeamEntered: "Trivia League Team Entered",

  // Forms and accounts
  betaApplied: "Beta Applied",
  contactSent: "Contact Sent",
  accountLinked: "Account Linked",
  accountUnlinked: "Account Unlinked",

  // Free tools and game-night companion tools (props: { tool })
  toolUsed: "Tool Used",
  // The welcome page (/welcome): a door picked, a section's button, the "New to GameShuffle?" line.
  welcomeDoorClicked: "Welcome Door Clicked",
  welcomePathStarted: "Welcome Path Started",
  welcomeLineClicked: "Welcome Line Clicked",

  // /live viewer actions
  pollVoted: "Poll Voted",
  bingoCardTaken: "Bingo Card Taken",
  bingoClaimed: "Bingo Claimed",
  draftPicked: "Draft Picked",
  /** A Chat Brain guess or survey answer sent from the live page (props: { mode: host | speed | versus | teams | survey }). */
  brainLiveAnswered: "Chat Brain Live Answered",

  // Randomizer extras
  pokemonDetailsOpened: "Pokemon Details Opened",
  pokemonSlotChosen: "Pokemon Slot Chosen",
  runPartTicked: "Run Part Ticked",
  runFinished: "Run Finished",
  goldeneyePartRefreshed: "GoldenEye Part Refreshed",
  resultCopied: "Result Copied",

  // TCG
  cardCollected: "Card Collected",
  deckViewed: "Deck Viewed",

  // Cross-links (sent from links tagged with the plausible-event-name class)
  randomizerCardClicked: "Randomizer Card Clicked",
  heroShowcaseClicked: "Hero Showcase Clicked",

  // AI features
  aiPackGenerated: "AI Pack Generated",
  aiPackSaved: "AI Pack Saved",
  aiDeckGenerated: "AI Deck Generated",
  aiDeckSaved: "AI Deck Saved",
  aiRecapGenerated: "AI Recap Generated",
  aiSetupApplied: "AI Setup Applied",
  aiPlanGenerated: "AI Plan Generated",
  aiTournamentDrafted: "AI Tournament Drafted",
  /** An AI tool asked someone to sign up or upgrade first. {feature, reason: signin|pro|daily|allowance} */
  aiGateShown: "AI Gate Shown",
} as const;

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS];
export type EventProps = Record<string, string | number | boolean>;

/** Send one event to Plausible (no-op on the server or when the script is blocked). */
export function track(event: AnalyticsEvent, props?: EventProps): void {
  if (typeof window === "undefined" || !window.plausible) return;
  const clean = props && Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === "boolean" ? String(v) : v]));
  window.plausible(event, clean ? { props: clean } : undefined);
}

/**
 * Class names for a link Plausible's tagged-events script tracks on click, no
 * JavaScript needed: `<a className={tagged(EVENTS.randomizerCardClicked, { to: slug })}>`.
 * Prop values can't contain spaces, so they're slugged.
 */
export function tagged(event: AnalyticsEvent, props?: Record<string, string>): string {
  const name = `plausible-event-name=${event.replace(/ /g, "+")}`;
  const rest = Object.entries(props ?? {}).map(([k, v]) => `plausible-event-${k}=${v.replace(/\s+/g, "-")}`);
  return [name, ...rest].join(" ");
}
