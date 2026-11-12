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
  /** The today bar or Next up took someone to another daily. {to, from, via: bar|bar-more|next|week-line} */
  dailiesSwitched: "Dailies Switched",
  /** The Choose sheet closed with a new list of your dailies. {count, picks: "shuffle,dex"} */
  dailyPicksSaved: "Daily Picks Saved",
  /** A row on /dailies opened a daily. {to, from: yours|more|today|week} */
  allDailiesClicked: "All Dailies Clicked",
  /** "Copy link" on the dailies' Invite friends card or Account ▸ Invite friends. {from} */
  referralLinkCopied: "Referral Link Copied",
  /** Tokens spent on help at a daily's last chance. {game, kind: letter|guess} */
  dailyHelpBought: "Daily Help Bought",

  /** A homepage section's card or button (Run the night, Pokémon, the plans band). {to} */
  homeSectionClicked: "Home Section Clicked",
  /** A Your games card on /home opened its game space ({ to: space id }). */
  homeGameClicked: "Home Game Clicked",
  /** The phone app bar ({ tab: home | games | create | inbox | you }; create's choices as { tab: "create", to }). */
  appBarUsed: "App Bar Used",
  /** The game band under a search page's tool ({ to: open | join | pro | circuit, space, from }). */
  gameBandClicked: "Game Band Clicked",
  /** The game space sign-up sheet sent someone to sign up ({ from: space-sheet-join | space-sheet-checkin, provider }). */
  signupStarted: "Signup Started",

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
  /** Merch: Add to cart on a product page {item: Tees | Hoodies | …}. */
  merchAddedToCart: "Merch Added To Cart",

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
  /** The Daily Duel (src/lib/originals/duel/): today's official duel started (the Start button). {tier} */
  duelStarted: "Duel Started",
  /** A duel ended {won, turns, par, official}. */
  duelFinished: "Duel Finished",
  /** A practice duel started (only once the official one is over). */
  duelPracticed: "Duel Practiced",
  /** The duel's Share or copy {via}. */
  duelShared: "Duel Shared",
  /** Trainer Road (/pokemon-trainers): a duel started {tier, level, region}. */
  roadStarted: "Road Duel Started",
  /** A Trainer Road duel ended {won, stars, tier, level}. */
  roadFinished: "Road Duel Finished",
  /** A link from Trainer Road to the Daily Duel pressed {from: result}. */
  roadToDaily: "Road To Daily Duel",
  /** The Daily Duel page's Trainer Road module was used ({ from: "duel-module" | "duel-module-next" }). */
  duelToRoad: "Duel To Trainer Road",
  /** A badge on a region's path (Trainer Road phase 2) {region}. */
  roadBadge: "Road Badge Earned",
  /** A region cleared on the path {region}. */
  roadCleared: "Road Region Cleared",
  /** A villain team turned up on someone's road (road encounters) {region, kind: set | grunt}. */
  roadEncounter: "Road Encounter Appeared",
  /** A villain team on the road beaten {region, kind}. */
  roadEncounterBeaten: "Road Encounter Beaten",
  /** "Battle Team Rocket" pressed where an encounter blocks the road {from: path | hub | duel-module | result | start, kind}. */
  roadEncounterClicked: "Road Encounter Clicked",
  /** A challenger card ("Larry challenged you to a duel") pressed {from: home | shuffle | dex | fire, played}. */
  duelChallengerClicked: "Duel Challenger Clicked",
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
  /** The random Pokémon generator rolled (props: { count, gen: all | 1-9, type: any | the type, slot: all | one }). */
  pokemonRolled: "Pokemon Rolled",
  /** A generator roll's link was copied. */
  pokemonLinkCopied: "Pokemon Link Copied",
  /** The Pokémon Champions team builder reached six legal Pokémon (props: { via: pick | fill | link }), once a visit. */
  championsTeamCompleted: "Champions Team Completed",
  /** "Fill the rest at random" in the team builder (props: { added, cover: on | off }). */
  championsTeamFilled: "Champions Team Filled",
  /** A team builder link was copied (props: { size }). */
  championsTeamLinkCopied: "Champions Team Link Copied",
  /** A player sent their team list to a Pokémon Champions tournament (props: { size, swap: yes | no }). */
  teamListSent: "Team List Sent",
  /** The Sonic Racing: CrossWorlds randomizer rolled racers (props: { players, slot: all | one }). */
  sonicRacersRolled: "Sonic Racers Rolled",
  /** The Sonic Racing: CrossWorlds randomizer rolled races or a Grand Prix (props: { kind: races | grand-prix, count }). */
  sonicRacesRolled: "Sonic Races Rolled",
  /** The Super Mario Bros. Wonder randomizer rolled a challenge or part of one (props: { part: all | player | level | rule, players, switch2: yes | no }). */
  wonderChallengeRolled: "Wonder Challenge Rolled",
  /** The Super Mario Bros. Wonder randomizer rolled a run of levels (props: { count, world }). */
  wonderLevelsRolled: "Wonder Levels Rolled",
  /** The Mario Kart: Double Dash!! randomizer rolled karts (props: { mode: solo | duo, karts, slot: all | one }). */
  doubleDashRolled: "Double Dash Rolled",
  /** The Double Dash randomizer rolled races or battles (props: { kind: cup | tour | races | battle, count, engine }). */
  doubleDashRacesRolled: "Double Dash Races Rolled",
  /** The Mario Kart DS randomizer rolled characters and karts (props: { karts, slot: all | one, level: start | own | borrowed | all }). */
  marioKartDsRolled: "Mario Kart DS Rolled",
  /** The Mario Kart DS randomizer rolled races or battles (props: { kind: cup | nitro | retro | races | battle, count, engine }). */
  marioKartDsRacesRolled: "Mario Kart DS Races Rolled",
  /** The Mario Kart DS randomizer rolled Mission Mode missions (props: { count, level: any | 1-7, bosses, level7 }). */
  marioKartDsMissionRolled: "Mario Kart DS Mission Rolled",
  /** The Mario Kart 7 randomizer rolled karts (props: { karts, slot: all | one, parts: start | all }). */
  mario7Rolled: "Mario Kart 7 Rolled",
  /** The Mario Kart 7 randomizer rolled races or battles (props: { kind: cup | new | classic | races | battle, count, engine }). */
  mario7RacesRolled: "Mario Kart 7 Races Rolled",
  /** The Super Mario Kart randomizer rolled racers (props: { players, slot: all | one }). */
  superMarioKartRolled: "Super Mario Kart Rolled",
  /** The Super Mario Kart randomizer rolled races or battles (props: { kind: cup | races | battle, count, engine }). */
  superMarioKartRacesRolled: "Super Mario Kart Races Rolled",
  /** A game space's Rolls switched game (Retro Mario Kart: Double Dash, Mario Kart DS, Mario Kart 64, Mario Kart 7 or Super Mario Kart) (props: { space, game }). */
  spaceRollGame: "Space Roll Game Switched",
  /** A free bracket tool made a bracket, schedule or round 1 (props: { format: single | double | roundrobin | swiss, players }). */
  bracketMade: "Bracket Made",
  /** A bracket tool's link was copied (props: { format }). */
  bracketLinkCopied: "Bracket Link Copied",
  /** A bracket tool was printed (props: { format }). */
  bracketPrinted: "Bracket Printed",
  /** "Run it as a live tournament" from a bracket tool (props: { format, players }). */
  bracketRunLive: "Bracket Run Live",
  /** The MMR card's lounge name was found and saved (props: { game }). */
  mmrCardSaved: "MMR Card Saved",
  /** The war overlay setup page (GameShuffle Competitive): a look saved to the account, an OBS link copied. */
  warLookSaved: "War Look Saved",
  warOverlayCopied: "War Overlay Link Copied",
  warPieceAdded: "War Added To GS Overlay",
  warPageCopied: "War Page Link Copied",
  /** The MMR card's OBS link was copied (props: { layout }). */
  mmrCardLinkCopied: "MMR Card Link Copied",
  /** The MMR card studio switched between the live card and a picture (props: { mode }). */
  mmrModePicked: "MMR Mode Picked",
  /** A picture of the MMR card saved from the studio (props: { size }). */
  mmrPictureSaved: "MMR Picture Saved",
  /** Tonight's goal set on the MMR card, GS Pro (props: { game }). */
  mmrGoalSet: "MMR Goal Set",
  /** The speedrun overlay's look changed in its setup (props: { layout }). */
  speedrunLookSaved: "Speedrun Look Saved",
  /** A speedrun address copied from its setup: the timer's for LiveSplit One, or the OBS link (props: { kind }). */
  speedrunAddressCopied: "Speedrun Address Copied",
  /** GameShuffle for LiveSplit downloaded from the setup page {from: setup|studio}. */
  speedrunAddonDownloaded: "Speedrun Addon Downloaded",
  /** Splits set on the setup page: { from: template:<id> | numbers | typed | file, game }. */
  speedrunSplitsSet: "Speedrun Splits Set",
  /** Speedrun races (src/components/races, picks 2026-11-10): made, joined, started by the host, shared after. */
  raceMade: "Race Made",
  raceJoined: "Race Joined",
  raceStarted: "Race Started",
  raceShared: "Race Shared",
  /** A LiveSplit file downloaded from the setup page: { from: template | numbers | typed }. */
  speedrunSplitsDownloaded: "Speedrun Splits Downloaded",
  /** Levels from players (picks 2026-11-11): a level shared to a space's board {game}. */
  levelShared: "Level Shared",
  /** Copy code on a level's card {game, from: board | now | queue}. */
  levelCodeCopied: "Level Code Copied",
  /** The level queue opened from the dashboard {game}. */
  levelQueueOpened: "Level Queue Opened",
  /** A level ended on the dashboard {game, result: cleared | skipped | gave_up | none, via: next | random | result}. */
  levelPlayed: "Level Played",
  /** Curating player levels (picks 2026-11-11): a like {game}; a player's mark {game, outcome: cleared | gave_up | no_load | none}. */
  levelLiked: "Level Liked",
  levelMarked: "Level Marked",
  /** A list made on a board {game}; a list queued by a GS Pro streamer {game, added}. */
  levelListMade: "Level List Made",
  levelListQueued: "Level List Queued",
  /** "Add to my queue" on a board level {game}. */
  levelQueuedFromBoard: "Level Queued From Board",
  /** A Mario Maker 2 maker ID saved on the profile. */
  makerIdSaved: "Maker ID Saved",
  /** The weekly lounge report switched on or off in the MMR studio (props: { on }). */
  loungeWeeklySwitched: "Lounge Weekly Switched",
  /** A lounge name confirmed by Discord on /lounge ({games}: how many lounge games). */
  loungeConfirmed: "Lounge Confirmed",
  /** Time trials (picks 2026-10-29): a time saved on the site {game, proof: none|screenshot|video, read: yes|no}. */
  ttAdded: "Time Trial Added",
  /** A screenshot sent to be read {game, result: read|unread|cap}. */
  ttScreenshotRead: "Time Trial Screenshot Read",
  /** A paste import saved {game, count}. */
  ttImported: "Time Trial Imported",
  /** A room read on /lounge ({players, format}: how many names, players per team). */
  loungeRoomRead: "Lounge Room Read",
  /** A player opened from the lounge lookup (props: { via: suggestion | enter | fc | recent | did-you-mean }). */
  loungeSearchUsed: "Lounge Search Used",
  /** The competitive Mario Kart hub: its player search {kind: lounge | tt | enter} and its tool links {to}. */
  cmkSearchUsed: "Competitive Search Used",
  cmkClicked: "Competitive Hub Clicked",
  /** A board tab opened on /lounge (props: { board: world | climbing | countries | gs }). */
  loungeBoardViewed: "Lounge Board Viewed",
  /** A lounge player's page shared from its header (props: { via: share | copy }). */
  loungePlayerShared: "Lounge Player Shared",
  /** The compare form sent (props: { from: lounge | player }). */
  loungeCompareUsed: "Lounge Compare Used",
  /** Name every Pokémon started (props: { set: all | 1-9, clock: standard | long | none }). */
  nameQuizStarted: "Name Quiz Started",
  /** Name every Pokémon ended (props: { set, clock, count, reason: time | gave-up | done }). */
  nameQuizFinished: "Name Quiz Finished",
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
  /** Team series (the GS Summer Series). Prediction placed {kind, from: live|series}. */
  seriesPredicted: "Series Predicted",
  /** A team locked in its ban and protect in the track draft. */
  seriesDraftPicked: "Series Draft Picked",
  /** A vote for the best play. */
  seriesVoted: "Series Voted",
  /** A player saved their own card (hours, kart build). */
  seriesCardSaved: "Series Card Saved",
  /** Chat Brain at the table finished (co-op picks 2026-11-11) {where: phone, mode: table | teams, won}. */
  brainTableFinished: "Brain Table Finished",
  /** A Chat Brain co-stream invite where both chats play as one team (co-op picks 2026-11-11). */
  brainTogetherInvited: "Brain Together Invited",
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
