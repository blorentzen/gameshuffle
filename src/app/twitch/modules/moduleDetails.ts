/**
 * Per-module long-form details — drives the info modal on
 * /twitch/modules. Catalog metadata (display_name, description,
 * compliance_class) lives in `gs_modules`; this file carries the
 * streamer-facing copy that explains what each module does in
 * plain language, lists its commands, and flags surfaces where it
 * shows up.
 *
 * Keys mirror `gs_modules.module_key`. Adding a new module:
 *   1. Insert in the seed migration (command-suite-modules-m2-5.sql)
 *   2. Add an entry here
 *   3. Tag the relevant CommandDef rows with `moduleKey`
 */

export type CommandActor = "everyone" | "player" | "crew" | "host";

export interface CommandDoc {
  trigger: string;
  description: string;
  actor: CommandActor;
}

export interface ModuleConfigKnob {
  name: string;
  default: string;
  range?: string;
  note?: string;
  /** True when the value is tuned by GameShuffle platform ops rather
   *  than the streamer. Surfaces a "platform-controlled" badge in
   *  the modal so streamers know they can't edit it themselves. */
  platformOnly?: boolean;
}

export interface ModuleDetail {
  /** One-paragraph plain-language explanation of the module. */
  long: string;
  /** Chat commands the module ships with. */
  commands: CommandDoc[];
  /** Where the module surfaces in the UI besides chat. */
  surfaces: string[];
  /** Tunable parameters with defaults. */
  config?: ModuleConfigKnob[];
  /** Compliance, age-gating, or other regulatory notes. */
  notes?: string[];
}

export const MODULE_DETAILS: Record<string, ModuleDetail> = {
  markets: {
    long: "Parimutuel prediction markets — viewers stake tokens on the outcome of a chapter (race finish, mode, etc.). The streamer opens a market on a system-authored topic, viewers bet from chat or the live page, and one resolve call distributes the pool pro-rata to the winners. Streamers never receive tokens; the pool moves between viewers only.",
    commands: [
      { trigger: "!gs market open [1|3|5]", description: "Open a market with a 1/3/5-minute lock timer.", actor: "host" },
      { trigger: "!gs market lock", description: "Lock the market early — no more bets.", actor: "host" },
      { trigger: "!gs market close", description: "Cancel + silently refund all bets.", actor: "host" },
      { trigger: "!gs resolve <value>", description: "Resolve the locked market. One call fans out across markets, bounties, and event challenges keyed to the same variable.", actor: "host" },
      { trigger: "!bet <option> <amount>", description: "Stake tokens on an outcome. Accepts int / N% / all. Spectator-mode viewers pick without staking.", actor: "everyone" },
    ],
    surfaces: [
      "Hub session detail → Markets tab (open/lock/close/resolve buttons)",
      "/live/<slug> Markets tab (viewer-side bet UI + pool display)",
    ],
    config: [
      { name: "Lock timer options", default: "1 / 3 / 5 minutes", platformOnly: true },
      { name: "Stream-end grace window", default: "60s", platformOnly: true, note: "Stream offline beyond this triggers silent refund." },
    ],
    notes: [
      "Only one open or locked market can run at a time per stream + game.",
      "Region-restricted viewers participate in spectator mode automatically — see the restricted regions list below.",
    ],
  },

  bounty: {
    long: "Streamer-funded single-winner rewards. The streamer offers a bounty (\"200 to the first viewer to finish top 3\"), and on resolve mints from their monthly allowance to the named winner. Unlike markets, bounties don't pool viewer stakes — the funding comes entirely from the streamer's allowance ceiling.",
    commands: [
      { trigger: "!gs bounty <amount> <description>", description: "Open a bounty. Reserves the amount against your monthly allowance.", actor: "host" },
      { trigger: "!gs bounty award @user", description: "Pay out the open bounty to a viewer. Mints from your allowance into their balance.", actor: "host" },
      { trigger: "!gs bounty cancel", description: "Release the reservation. Nothing minted.", actor: "host" },
    ],
    surfaces: [
      "Hub session detail → Markets tab (open + award/cancel controls + history)",
      "/live/<slug> Markets tab (viewer-side open-bounty list)",
    ],
    config: [
      { name: "Default monthly ceiling", default: "5,000 tokens", platformOnly: true, note: "Per-tier overrides snapshot at month start." },
    ],
    notes: [
      "Requires a paid tier — communities without a monthly allowance ceiling can't open bounties.",
      "Today the streamer awards bounties manually with `!gs bounty award @user`. Automatic resolution on conditions like \"first to top 3\" is coming.",
    ],
  },

  award: {
    long: "Discretionary streamer-to-viewer mint. Instant tip from the monthly allowance — no bounty mechanics, no condition. Best for end-of-night MVP shoutouts, surprise rewards, or thanking helpful viewers.",
    commands: [
      { trigger: "!gs award @user <amount>", description: "Mint tokens directly into the viewer's balance. Drawn from your monthly allowance.", actor: "host" },
    ],
    surfaces: [
      "Hub session detail → Markets tab → recent awards history (last 25)",
    ],
    config: [
      { name: "Default monthly ceiling", default: "5,000 tokens", platformOnly: true },
    ],
    notes: [
      "You can't award yourself.",
      "The monthly allowance is shared with bounties — opening a bounty reserves the amount, settling mints it, cancelling releases it back.",
    ],
  },

  chaos: {
    long: "Viewers pay tokens to trigger a gameplay-disruption event. The cost is BURNED (destroyed, not paid to the streamer) — chaos is the economy's primary inflation counterweight. Each fire pulls from the chaos-only event deck for the current game.",
    commands: [
      { trigger: "!chaos", description: "Burn tokens to fire a disruption event. Cost is the per-community chaos price.", actor: "everyone" },
    ],
    surfaces: [
      "Chat event flavor message on each fire",
    ],
    config: [
      { name: "Platform price band", default: "50 – 200 tokens", platformOnly: true, note: "Floor and ceiling are set by GameShuffle; streamers pick a price within the band." },
      { name: "Default price", default: "100 tokens", platformOnly: true, note: "Used until per-community config UI ships." },
      { name: "Per-user cooldown", default: "30 seconds" },
    ],
    notes: [
      "Pricing self-balances against the Streamer Leaderboard — overpricing reduces fires, lowering engagement rank.",
      "Streamer balance is never affected. Tokens are destroyed.",
    ],
  },

  random: {
    long: "The wild-event lever. Free to fire (per-user cooldown). Pulls from the general random-event deck — could be a token gain, a token loss, a durational modifier, a challenge issued, or just a story moment. \"It's just not obvious\" that tokens are sometimes involved — that's by design.",
    commands: [
      { trigger: "!random", description: "Fire a wild event. Cooldown-gated; no token cost.", actor: "everyone" },
    ],
    surfaces: [
      "Chat event flavor message on each fire",
    ],
    config: [
      { name: "Per-user cooldown", default: "60 seconds" },
    ],
    notes: [
      "Event deck token-delta EV is calibrated neutral-to-mildly-negative across the deck — random isn't a faucet.",
    ],
  },

  leaderboard: {
    long: "Token rankings per-community. The Viewer Leaderboard surfaces three flavors: Combined (raw balance), Player (in-game payouts + earn_t1), and Crowd (prediction-market payouts + bet net). Streamers are excluded from their own leaderboard — they're operators, not participants.",
    commands: [
      { trigger: "!leaderboard", description: "Post the top 5 token holders in chat.", actor: "everyone" },
    ],
    surfaces: [
      "/live/<slug> Leaderboard tab (three sub-tabs: Combined / Player / Crowd)",
      "/staff/economy (admin: includes Streamer Leaderboard ranked by engagement counts)",
    ],
    config: [
      { name: "Default top-N", default: "10" },
      { name: "Realtime debounce", default: "300ms", platformOnly: true, note: "Bursts collapse into a single refresh." },
    ],
  },

  custom_commands: {
    long: "Per-community static-response commands. Edit !socials / !discord / !youtube and create your own custom commands. Supports template variables — caller info ($user / $touser), random ($random / $count), stream stats ($uptime / $followage / $accountage), and streamer-profile substitutions ($twitch / $discord / $psn / $youtube / etc.).",
    commands: [
      { trigger: "!commands add <trigger> <response>", description: "Add a new command from chat.", actor: "host" },
      { trigger: "!commands edit <trigger> <response>", description: "Update an existing command from chat.", actor: "host" },
      { trigger: "!commands delete <trigger>", description: "Remove a custom command.", actor: "host" },
      { trigger: "!commands list", description: "Hint where to find the full list (`/twitch/commands`).", actor: "host" },
    ],
    surfaces: [
      "/twitch/commands — full editor with variable picker (recommended)",
    ],
    config: [
      { name: "Editor seed defaults", default: "!socials / !discord / !youtube / !twitter / !so / !uptime / !followage / !accountage", platformOnly: true, note: "Seeded per-community on first creation; editable." },
    ],
  },

  seed_library: {
    long: "Built-in trivial commands every community ships with by default. Pure-logic — no DB lookups, no Helix calls. Disabling this module hides all three from chat at once.",
    commands: [
      { trigger: "!roll [min-max]", description: "Random integer in range (default 1-100).", actor: "everyone" },
      { trigger: "!choose a | b | c", description: "Pick one at random.", actor: "everyone" },
      { trigger: "!8ball <question>", description: "Random canned answer.", actor: "everyone" },
    ],
    surfaces: [
      "Chat only",
    ],
    config: [
      { name: "Per-user cooldown", default: "3 seconds (all three)" },
    ],
  },

  lurk: {
    long: "Viewers signal they're lurking — bot acknowledges and remembers. The next chat message that viewer sends in this community triggers a 'Welcome back!' from the bot.",
    commands: [
      { trigger: "!lurk", description: "Mark yourself as lurking. The bot welcomes you back on your next message.", actor: "everyone" },
    ],
    surfaces: [
      "Chat only",
    ],
    config: [
      { name: "Per-user cooldown", default: "10 seconds" },
    ],
    notes: [
      "Welcome-back check runs before command parsing — even a non-command first message after returning triggers the welcome.",
    ],
  },
};
