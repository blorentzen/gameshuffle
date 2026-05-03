/**
 * One-time bot consent flow for GameShuffle's Twitch bot account.
 *
 * GameShuffle sends chat using an app access token (client_credentials grant),
 * not a bot user token. But Twitch's Helix POST /chat/messages endpoint
 * requires that the sender (the bot account) has consented to the app for
 * specific scopes. That consent is a durable record on Twitch's side, not
 * a token we hold.
 *
 * This script generates the authorization URL the bot account needs to
 * visit one time. After the bot account clicks "Authorize," Twitch records
 * the consent and chat sends start working.
 *
 * Required scopes:
 *   - user:bot         — lets the app act as the bot in chat (architectural)
 *   - user:write:chat  — required by the new Helix chat send endpoint
 *   - user:read:chat   — lets the app read chat as the bot (for command parsing)
 *
 * Usage:
 *   npx tsx scripts/authorize-twitch-bot.ts
 *
 * Then:
 *   1. Open the printed URL in an incognito browser window
 *   2. Sign in as `gameshuffle_bot` (NOT your streamer account)
 *   3. Click "Authorize"
 *   4. Twitch redirects to the GameShuffle callback URL — that page may
 *      404 or show an error. That is fine. The consent has been recorded.
 *   5. Test with `/api/twitch/bot/test-message` — should now succeed.
 *
 * Run again whenever:
 *   - Twitch adds a new required scope to the chat send endpoint
 *   - The bot's consent is revoked (manually or by Twitch)
 *   - You need to verify the bot's current scope grants
 */

const BOT_SCOPES = ["user:bot", "user:write:chat", "user:read:chat"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n✗ Missing required env var: ${name}`);
    console.error(`  Add it to .env.local before running this script.\n`);
    process.exit(1);
  }
  return value;
}

function resolveRedirectUri(): string {
  // Match the same priority resolution that src/lib/twitch/client.ts uses,
  // minus the request-context path (this is a CLI script, no request).
  if (process.env.TWITCH_OAUTH_REDIRECT_URI) {
    return process.env.TWITCH_OAUTH_REDIRECT_URI;
  }
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return `${process.env.NEXT_PUBLIC_BASE_URL}/api/twitch/auth/callback`;
  }
  return "https://www.gameshuffle.co/api/twitch/auth/callback";
}

function main(): void {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const redirectUri = resolveRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: BOT_SCOPES.join(" "),
    force_verify: "true",
  });

  const authorizeUrl = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;

  console.log("\n=================================================================");
  console.log("  GameShuffle bot consent authorization");
  console.log("=================================================================\n");
  console.log("Scopes being requested:");
  for (const scope of BOT_SCOPES) {
    console.log(`  • ${scope}`);
  }
  console.log(`\nRedirect URI: ${redirectUri}`);
  console.log("\nNext steps:");
  console.log("  1. Copy the URL below");
  console.log("  2. Open it in an INCOGNITO browser window");
  console.log("  3. Sign in as `gameshuffle_bot` (NOT your streamer account)");
  console.log('  4. Click "Authorize"');
  console.log("  5. The redirect destination may 404 — that is expected.");
  console.log("     The consent is recorded on Twitch's side regardless.\n");
  console.log("Authorization URL:\n");
  console.log(authorizeUrl);
  console.log("\n=================================================================\n");
}

main();
