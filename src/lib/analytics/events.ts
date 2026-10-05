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

  // GS Pro and billing
  upgradeClicked: "Upgrade Clicked",
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

  // Forms and accounts
  betaApplied: "Beta Applied",
  contactSent: "Contact Sent",
  accountLinked: "Account Linked",
  accountUnlinked: "Account Unlinked",

  // Free tools and game-night companion tools (props: { tool })
  toolUsed: "Tool Used",

  // /live viewer actions
  pollVoted: "Poll Voted",
  bingoCardTaken: "Bingo Card Taken",
  bingoClaimed: "Bingo Claimed",
  draftPicked: "Draft Picked",

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

  // AI features
  aiPackGenerated: "AI Pack Generated",
  aiPackSaved: "AI Pack Saved",
  aiRecapGenerated: "AI Recap Generated",
  aiSetupApplied: "AI Setup Applied",
  aiPlanGenerated: "AI Plan Generated",
  aiTournamentDrafted: "AI Tournament Drafted",
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
