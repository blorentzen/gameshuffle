import type { IconName } from "@empac/cascadeds";

/**
 * Content for the per-app marketing landing pages (the SEO/GEO surface).
 * Each entry drives one keyword-targeted page via <AppMarketingPage>.
 * Game randomizers are not here: their landing copy lives under the tool on
 * its own URL (src/data/randomizer-landings.ts).
 * Tools stay clean at their own routes; these pages deep-link into them.
 *
 * Copy is written answer-first and scannable for GEO (AI answer engines),
 * with a FAQ that also feeds FAQPage JSON-LD. Keep facts accurate to the
 * shipped tools — see CLAUDE.md for the source of truth on each.
 */

export interface AppFeature {
  icon: IconName;
  title: string;
  description: string;
}

export interface AppStep {
  title: string;
  description: string;
}

export interface AppFaq {
  q: string;
  /** Plain text (also used verbatim in FAQPage JSON-LD). */
  a: string;
}

export interface AppMarketingContent {
  /** Marketing page path (the route + canonical). */
  path: string;
  metaTitle: string;
  metaDescription: string;
  breadcrumbLabel: string;
  eyebrow: string;
  /** Maturity: live, or just launched ("New"). */
  status: "live" | "new";
  h1: string;
  heroSubhead: string;
  heroImage: string;
  heroImageAlt: string;
  toolHref: string;
  toolCtaLabel: string;
  /** Answer-first overview paragraph (GEO-extractable). */
  overview: string;
  featuresHeading: string;
  features: AppFeature[];
  /** Optional "how it works" steps — omitted for tools simple enough not
   *  to need instructions (the randomizers). */
  howItWorksHeading?: string;
  howItWorks?: AppStep[];
  /** Heading over the overview, which sits before the FAQ ("About lounge scoring"). */
  aboutHeading?: string;
  faqHeading: string;
  faq: AppFaq[];
  /** Name used in SoftwareApplication JSON-LD. */
  schemaName: string;
}

export const MARKETING_APPS: Record<string, AppMarketingContent> = {
  "competitive-mario-kart": {
    path: "/competitive-mario-kart",
    metaTitle: "Competitive Mario Kart: Live Lounge Scoring",
    metaDescription:
      "Run competitive Mario Kart 8 Deluxe game nights with live lounge scoring: normalized placements, FFA and team modes, per-player entry, and real-time results everyone can follow.",
    breadcrumbLabel: "Competitive Mario Kart",
    eyebrow: "Competitive",
    status: "new",
    h1: "Competitive Mario Kart Lounge Scoring",
    heroSubhead:
      "Live lounge scoring for competitive Mario Kart 8 Deluxe: normalized placements, team modes, and real-time results everyone can follow.",
    heroImage: "/images/bg/MK8DX_Background_Music.jpg",
    heroImageAlt: "Competitive Mario Kart 8 Deluxe",
    toolHref: "/competitive/mario-kart-8-deluxe",
    toolCtaLabel: "Open the competitive hub",
    overview:
      "GameShuffle's competitive hub runs live scoring for Mario Kart 8 Deluxe lounges. Each player records their own placement every race, scores are normalized across the lobby so they're fair at any size, and results update in real time for everyone watching. It supports FFA and team formats from 2v2 to 6v6, with a full session flow from character select to final standings.",
    featuresHeading: "What you can do",
    features: [
      { icon: "activity", title: "Live, real-time scoring", description: "Placements and standings update instantly as each race is logged." },
      { icon: "chart-bar", title: "Normalized placements", description: "Scoring stays fair across different lobby sizes and formats." },
      { icon: "users", title: "Team modes", description: "FFA plus 2v2, 3v3, 4v4, and 6v6 team formats." },
      { icon: "checks", title: "Per-player entry", description: "Each racer logs their own result. No bottleneck and no race conditions." },
      { icon: "eye", title: "Public viewer", description: "Anyone can follow the live standings from a shareable link." },
      { icon: "clock", title: "Session phases", description: "A clear flow: waiting, character select, lobby, in progress, complete." },
    ],
    howItWorksHeading: "How it works",
    howItWorks: [
      { title: "Create a session", description: "Start a lounge session and pick your format (FFA or team)." },
      { title: "Players join & pick", description: "Racers join, choose characters, and ready up." },
      { title: "Race & log results", description: "Each player logs their placement per race and standings update live." },
    ],
    aboutHeading: "About lounge scoring",
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is competitive lounge scoring free?", a: "Yes. The live lounge scoring hub is free to play; viewing is open to anyone with the link." },
      { q: "How does scoring stay fair across lobby sizes?", a: "Placements are normalized across the lobby, so scores are comparable whether you have a small or full lobby." },
      { q: "What team modes are supported?", a: "Free-for-all plus 2v2, 3v3, 4v4, and 6v6 team formats." },
      { q: "Do all players need accounts?", a: "Playing requires sign-in; following the live standings as a viewer does not." },
      { q: "Does it update in real time?", a: "Yes. Every table uses realtime sync, so standings update the moment a placement is logged." },
    ],
    schemaName: "Competitive Mario Kart Lounge",
  },

  "mario-kart-tournaments": {
    path: "/mario-kart-tournaments",
    metaTitle: "Mario Kart Tournaments & Championship Series",
    metaDescription:
      "Run Mario Kart 8 Deluxe or Mario Kart World tournaments: single & double-elim brackets, round-robin, FFA points, and the Heat → Mains ladder, or a full championship series where points carry across events into a season table. Advance races live on a real-time public page, your OBS overlay, and Twitch chat, with automatic reminders and timezone-aware start times. Free with an account.",
    breadcrumbLabel: "Mario Kart Tournaments",
    eyebrow: "Tournaments",
    status: "live",
    h1: "Mario Kart Tournaments & Championships",
    heroSubhead:
      "Run one-off Mario Kart tournaments: brackets, round-robin, FFA points, or the Heat → Mains ladder, or a whole championship series where points carry across events into a live season table. Built for Mario Kart 8 Deluxe and Mario Kart World.",
    heroImage: "/images/fg/mario-holding-trophy.jpg",
    heroImageAlt: "Mario holding a trophy",
    toolHref: "/tournament",
    toolCtaLabel: "Browse & create tournaments",
    overview:
      "GameShuffle's tournament builder runs real Mario Kart 8 Deluxe and Mario Kart World competitions. Pick a one-off tournament in any format (brackets, round-robin, FFA points, or the Heat → Mains ladder) or a season-long championship series, then run it live with real-time standings on a public page, your OBS overlay, and Twitch chat. And because GameShuffle owns the randomizers, you can run randomized rounds where everyone races the same shuffled tracks, combo, or items, held to your build rules and revealed live, something a generic bracket tool can't do. Free to create with an account.",
    featuresHeading: "What you can do",
    features: [
      { icon: "sparkles", title: "Randomized rounds (GameShuffle exclusive)", description: "Everyone runs the same randomized tracks, shared kart combo, and/or item set each round, generated by our own randomizers and held to your build rules. Reveal each round live, or a fresh combo every race." },
      { icon: "rosette", title: "Championship series", description: "Run a season of events. Points carry across nights into a live league standings table, with drop-worst support." },
      { icon: "flame", title: "Heat → Mains ladder", description: "Sprint-car-style: race heats into A/B mains, win to lock the A Main, and top finishers transfer up. A way back from a bad start." },
      { icon: "award", title: "Single & double-elim brackets", description: "Auto-seeded brackets with byes, winners/losers rounds, and a live public bracket." },
      { icon: "chart-bar", title: "Live scoring & standings", description: "Enter each race's finish for real-time cumulative standings, then finalize the podium." },
      { icon: "activity", title: "Now racing: live everywhere", description: "Advance the current race and it updates the public tournament page in real time, plus your OBS overlay and Twitch chat when you stream (or drive it with !gs-tourney)." },
      { icon: "bell", title: "Reminders & change alerts", description: "Players get 1-day and 1-hour reminders, and an instant email + notification if you reschedule or cancel, with start times in their own timezone." },
      { icon: "flag", title: "Track & build rules", description: "Guided, FFA, randomized, or limited tracks plus weight, drift/vehicle, and character limits." },
      { icon: "users", title: "Guests & seeding", description: "Add players without an account and seed by check-in, standings, or random, for MK8DX and Mario Kart World." },
    ],
    howItWorksHeading: "How it works",
    howItWorks: [
      { title: "Pick single or championship", description: "Run a one-off tournament in any format, or set up a championship series with a season roster." },
      { title: "Seed the field", description: "Players join with their profile and friend code, or add guests, then seed the bracket or heats." },
      { title: "Run it live", description: "Score races, report winners, or call heats into the mains, and advance the current race. Standings, brackets, and the season table update in real time on the public page, your overlay, and chat." },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "What tournament formats are supported?", a: "FFA points, round-robin, single-elimination and double-elimination brackets, Swiss rounds with a top cut, and the Heat → Mains ladder. (Double-elimination currently needs a power-of-2 player count.)" },
      { q: "Can I randomize what everyone plays?", a: "Yes, and it's a GameShuffle exclusive. Turn on randomized rounds and everyone runs the same randomized tracks, a shared kart combo, and/or a randomized item set each round, generated by our own randomizers and automatically held to your build rules (weights, drift, vehicle types, character bans). Reveal each round live during the event (the public page, overlay, and chat update in real time), generate the whole schedule up front, or roll a fresh combo every race. Live reveal is a GS Circuit feature; try it free in the sandbox demo." },
      { q: "What is a championship series?", a: "A season made of multiple events. Each event runs the Heat → Mains format and awards points (a light bonus for heat finishes plus the weight from your final main) which accumulate into a live season standings table across the whole league." },
      { q: "Do championship players need a GameShuffle account?", a: "Yes. Championship leagues are accounts-only so points stay tied to real players all season. Invite people already on GameShuffle, or send an email invite and they create a free account to join. (One-off tournaments still allow no-account guests.)" },
      { q: "What is the Heat → Mains format?", a: "A sprint-car-style ladder: the field splits into heats, winning a heat locks you into the A Main, everyone else is seeded by points, and the top finishers of each lower main transfer up. It gives every driver a path back from a bad heat." },
      { q: "Which games can I run?", a: "Mario Kart 8 Deluxe and Mario Kart World, each with its own tracks, vehicles, and build rules." },
      { q: "Does it work on stream?", a: "Yes. When you advance the current race, a card appears on your OBS overlay and a note posts to Twitch chat, and you (or your mods) can drive races from chat with !gs-tourney next / prev. Not streaming? The public tournament page is its own real-time board, so everyone following along sees the current race, bracket, and standings update live." },
      { q: "Do players get reminders?", a: "Yes. Everyone signed up gets an automatic reminder 1 day and 1 hour before start (in-app and email). If you change the time or cancel, they're emailed and notified right away." },
      { q: "What timezone are start times shown in?", a: "Each viewer sees the start time in their own account timezone (auto-detected, editable in settings). Logged-out visitors see Pacific and Eastern, so the time is never ambiguous." },
      { q: "Is it free to create a Mario Kart tournament?", a: "Yes. Creating is free with an account; browsing and joining are open to everyone." },
      { q: "Can people without an account play?", a: "Yes. Organizers can add guests by name, with a soft nudge to create a free account for the full experience." },
    ],
    schemaName: "Mario Kart Tournaments",
  },

  /* The all-up tournaments page. /mario-kart-tournaments stays and goes deep on
     MK8DX + MKW; this one is the game-agnostic pitch, and it targets the intent
     people actually search ("how do I host a tournament") rather than the head
     term where Challonge, Battlefy and start.gg already sit. */
  "host-a-tournament": {
    path: "/host-a-tournament",
    metaTitle: "Host a Tournament Online: Free Bracket & League Software",
    metaDescription:
      "Host a tournament for any game, free: brackets, round robin, points or Heat to Mains, seasons, live scoring, reminders and guests without accounts.",
    breadcrumbLabel: "Host a Tournament",
    eyebrow: "Tournaments",
    status: "live",
    h1: "Host a tournament for any game",
    heroSubhead:
      "Pick a format, invite the field, and run it live. Brackets, round-robin, points, or the Heat → Mains ladder, for one night or a whole season. Bring a game we know or name your own and write the rules.",
    /* Provisional, pending Britton's pick from the photo shortlist. It must not
       be the Mario trophy shot: this page's whole argument is "any game", and
       opening it with one game's mascot contradicts the headline above it. */
    heroImage: "/images/lifestyle/hero-tournaments.b274d0e2.jpg",
    heroImageAlt: "Players celebrating a win together",
    toolHref: "/tournament/create",
    toolCtaLabel: "Create a tournament",
    overview:
      "Most bracket tools stop at the bracket: you get a chart, then you run the actual event in a group chat. GameShuffle runs the night. Scores go in as races and matches finish, and standings update live on a public page anyone can follow, on your stream overlay, and in your chat. Players get reminders in their own timezone and an email the moment you move the start time. People without an account can still play. And because we own the randomizers, you can run rounds where everyone gets the same shuffled tracks, build, or item set, held to your rules and revealed live, which a generic bracket tool cannot do. Creating is free with an account.",
    featuresHeading: "Everything you need to run it",
    features: [
      { icon: "award", title: "Every format", description: "Single and double-elimination brackets with auto-seeding and byes, round-robin, free-for-all points, or the Heat → Mains ladder. Pick per event; nothing is locked to one game." },
      { icon: "rosette", title: "Championship seasons", description: "String events into a season. Points carry night to night into a live standings table, with drop-worst support, an accounts-only roster, and email invites for players not on GameShuffle yet." },
      { icon: "sparkles", title: "Randomized rounds", description: "Everyone runs the same shuffled tracks, a shared build, and/or a randomized item set each round, generated by our own randomizers and held to your restrictions. Reveal live, schedule up front, or re-roll every race. Nobody can argue with it." },
      { icon: "flame", title: "Heat → Mains ladder", description: "Sprint-car style. The field splits into heats, a heat win locks the A Main, and top finishers transfer up from the lower mains, so a bad first race is not the end of someone's night." },
      { icon: "layout-grid", title: "Any game, your rules", description: "Name a game we don't ship data for and the rules field becomes the format: match length, stage or map picks, tie-breaks. The bracket, points and ladder all run on named players regardless of what you're playing." },
      { icon: "flag", title: "Specialized restrictions", description: "For the games we know deeply, constrain the field: weight class, drift or vehicle type, character bans, and track selection that is guided, free pick, randomized, or limited to a pool you choose." },
      { icon: "eye", title: "Themed event pages", description: "Give an event its own look. A brand theme and header image make a league, a season, or a sponsored night feel like itself rather than like your profile, on a public page you can hand to anyone." },
      { icon: "activity", title: "Live everywhere at once", description: "Advance the current match and the public page, your OBS overlay, and your chat all update in real time. Mods can drive it from chat while you play." },
      { icon: "bell", title: "Reminders that do the chasing", description: "Everyone signed up gets a nudge a day before and an hour before, in their own timezone, plus an instant email if you reschedule or cancel." },
      { icon: "users", title: "Guests welcome", description: "Add players by name with no account required, so the one friend who will not sign up for anything is not a reason to run the night in a spreadsheet." },
      { icon: "checks", title: "Picks and bans", description: "Let the field, or your chat, vote tracks and items in or out before a round. Rate-limited, anonymous-friendly, and resolved live." },
      { icon: "share", title: "A page worth sharing", description: "Every tournament has a public URL with the bracket, standings, and current match. No login to watch, and it keeps working after the event as the result." },
    ],
    howItWorksHeading: "How it works",
    howItWorks: [
      { title: "Pick a format and a game", description: "One-off or championship season. Choose a bracket, round-robin, points, Swiss, or Heat → Mains, then pick a game we know or name your own and write the rules everyone plays by." },
      { title: "Fill the field", description: "Share the link and let players join, invite people you follow, or add guests by name. Seed by check-in, standings, or at random." },
      { title: "Run it live", description: "Enter results as they happen. Standings, brackets, and the season table update in real time on the public page, your overlay, and your chat." },
    ],
    aboutHeading: "About hosting on GameShuffle",
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is it free to host a tournament?", a: "Yes. Creating and running tournaments is free with an account, and browsing or joining is open to everyone. Every format is free for one full lobby of your game; bigger fields and live reveal are part of GameShuffle Circuit, and the Circuit page says what that costs today." },
      { q: "Do I need an account?", a: "To host, yes, and it takes a minute. To play in someone else's tournament, no: organizers can add guests by name. Championship seasons are the exception and are accounts-only, so points stay tied to real players all season." },
      { q: "What games can I run?", a: "Any. Mario Kart 8 Deluxe and Mario Kart World ship with full track, vehicle, and build data, so you get randomized rounds and build restrictions. For anything else, pick \"Other game\", name it, and write the rules; the brackets, points, and Heat → Mains ladder all run the same way." },
      { q: "What formats are supported?", a: "Single and double-elimination brackets, round-robin, free-for-all points, Swiss rounds with a top cut (the Pokémon League Cup format, for any 1v1 game), and the Heat → Mains ladder. Double-elimination currently wants a power-of-two field." },
      { q: "Can I try it before signing up?", a: "Yes. The sandbox runs real brackets and live scoring in your browser with no account and nothing saved, so you can see how a format behaves before you commit a real field to it." },
      { q: "Does it work if I stream?", a: "That is what it is built for. The current match posts to your OBS overlay and your chat as you advance it, viewers can vote in picks and bans, and your mods can drive races from chat. Not streaming? The public page is its own live board." },
      { q: "Can I charge for entry?", a: "Not yet. Paid entry is built and switched off while we get the tax side right, so every event is free to enter for now. Free events need no setup at all." },
      { q: "What happens if I change the time?", a: "Everyone signed up is emailed and notified immediately, and every start time is shown in each viewer's own timezone. Logged-out visitors see Pacific and Eastern so it is never ambiguous." },
      { q: "Can players in different regions join?", a: "Yes. Times localize per viewer, tournaments can be online or in person, and in-person events show a map and travel distance on the browse page." },
    ],
    schemaName: "Host a Tournament",
  },

  "pokemon-tcg-companion": {
    path: "/pokemon-tcg-companion",
    metaTitle: "Pokémon TCG Companion and Damage Counter",
    metaDescription:
      "A free companion for the Pokémon TCG: damage counters, Special Conditions, Prize cards and attacks worked out, with rule reminders. In your browser.",
    breadcrumbLabel: "Pokémon TCG Companion",
    eyebrow: "TCG Companion",
    status: "new",
    h1: "Pokémon TCG Companion",
    heroSubhead:
      "Damage counters, conditions, Prize cards and whose turn it is, on one phone at the table. It knows the rules, so it reminds you without stopping the game.",
    heroImage: "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png",
    heroImageAlt: "Pokémon TCG cards spread on a table",
    toolHref: "/tcg-companion",
    toolCtaLabel: "Open the companion",
    overview:
      "The GameShuffle TCG Companion is a free digital accessory kit for playing the Pokémon Trading Card Game with real cards. Pick your Pokémon from the card catalog and the board shows their art, HP, attacks and Weakness. Tap counters on, attach Energy, mark Special Conditions, and let it work out attack damage and Prize cards. It tracks the turn and the once-a-turn rules and reminds you when something slips, with Undo, but it never blocks a play: the cards on the table always win. It runs in your browser, no download, and keeps your game if the phone locks.",
    featuresHeading: "What you can do",
    features: [
      { icon: "activity", title: "Damage counters in a tap", description: "10, 50 and 100 counters, HP left on every Pokémon, and Knock Outs taken care of." },
      { icon: "bolt", title: "Attacks worked out", description: "Pick a real attack: Weakness, Resistance and the Knock Out are calculated for you." },
      { icon: "clock", title: "Turns and rule reminders", description: "Whose turn, the once-a-turn plays, first-turn rules and Checkup between turns." },
      { icon: "shield", title: "Conditions you can read", description: "Poison, Burn, Asleep, Paralyzed and Confused as clear icons, applied between turns." },
      { icon: "award", title: "Prize cards", description: "Two for a Pokémon ex, three for a Mega ex, taken automatically on a Knock Out." },
      { icon: "photo", title: "Your cards, your art", description: "Pick Pokémon from the catalog or your collection and see their art on the board." },
      { icon: "list", title: "Bring your deck list", description: "Paste a list from Pokémon TCG Live, check it's Standard legal, and its Pokémon come first when you place a card." },
    ],
    howItWorksHeading: "How it works",
    howItWorks: [
      { title: "Set up your Pokémon", description: "Pick each Pokémon from the card catalog (or add one by name) and flip for who goes first." },
      { title: "Play your turn", description: "Attach Energy, tap counters on, mark conditions; the board ticks off the once-a-turn plays." },
      { title: "Attack and end the turn", description: "Pick an attack, let it do the maths, then End turn runs the Checkup for both players." },
    ],
    aboutHeading: "About the companion",
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Pokémon TCG Companion free?", a: "Yes. The table companion is free and runs in your browser, on a phone, tablet or computer. GS Pro adds extras like unlimited saved games." },
      { q: "What does it track?", a: "Damage counters and HP, Special Conditions, attached Energy and Tools, Prize cards, whose turn it is and the once-a-turn plays, plus coin flips and dice." },
      { q: "Does it know the rules?", a: "It knows the core rules: Weakness and Resistance, Prize values, the first-turn limits, one Energy and one Supporter a turn, and the between-turn Checkup. When a play breaks one, it reminds you with Undo, but it never blocks it, since card effects change rules all the time." },
      { q: "Do I need an account?", a: "No. You can play as a guest, and the game is kept in your browser if the page reloads. Sign in to pick Pokémon from the card catalog and save games to your account." },
      { q: "Does it support other card games?", a: "Pokémon is first. The companion is built to work with other card games, and more are planned." },
    ],
    schemaName: "Pokémon TCG Companion",
  },
};

export const MARKETING_APP_PATHS = Object.values(MARKETING_APPS).map((a) => a.path);
