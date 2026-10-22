/**
 * Share images (1200x630) for the site's static pages: tools, hubs, guides,
 * help, legal, and the per-slug tier list, bingo and truth or dare images.
 * The Mario Party OG style: game art or event photography under the blue wash
 * where the page has it, otherwise a field of Tabler glyphs that fits the page;
 * the official white logo file (never the name typed out), an auto-fitted title
 * and a subtitle. No word repeats across the logo, title and subtitle.
 *
 * First made 2026-09-28 by a scratch script that was never committed; rebuilt
 * here 2026-10-18 with the logo. Each image is an HTML card photographed by
 * headless Chrome (so CSS text-wrap: balance fits the titles).
 *
 *   node scripts/render-page-og.cjs                 every image (needs the dev server for help + guide titles)
 *   node scripts/render-page-og.cjs --only /coin-flip,/help
 *   node scripts/render-page-og.cjs --preview <dir> writes <dir>/<id>.jpg only
 *
 * Writes src/app/<route>/opengraph-image.jpg + twitter-image.jpg, or the `out` path.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script, run with node */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");
const sharp = require("sharp");

const APP = path.resolve(__dirname, "..");
const PUB = `file://${APP}/public`;
const ICONS = path.join(APP, "node_modules/@tabler/icons/icons/outline");
const LOGO = `${PUB}/images/fg/logos/gameshuffle-wht.svg`;
const FONT = `file://${APP}/src/app/fonts/gabarito.woff2`;
const DEV = process.env.OG_BASE || "http://localhost:3000";
const MKW = `${PUB}/images/bg/mkw-main-image.jpg`, MK8 = `${PUB}/images/bg/MK8DX_Background_Music.jpg`;
const GN = `${PUB}/images/lifestyle/hero-game-nights.96d98118.jpg`, TOUR = `${PUB}/images/lifestyle/hero-tournaments.b274d0e2.jpg`;
const CARDS = "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png";

const G = (...icons) => ({ glyphs: icons });
const A = (url) => ({ art: url });
const HELP = G("lifebuoy", "help-circle", "book", "message-circle", "bulb");
const GUIDE = G("book-2", "trophy", "tournament", "dice-5", "bulb");
const LEGAL = G("shield-lock", "file-text", "scale", "lock", "eye");
/** Help headings that name GameShuffle (it's already in the logo). */
const HELP_TITLES = { "/help/contact": "Contact Us", "/help/pro/overview": "What Is GS Pro?" };

function specsFor(titles) {
  const specs = [];
  const add = (route, big, sub, bg, out) => {
    if (!out && route.includes("[")) throw new Error(`${route}: a dynamic route needs an out path under public (a static image there breaks the build)`);
    specs.push({ id: route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "home", route, big, sub, bg, out: out || `src/app${route}/opengraph-image.jpg` });
  };
  // Tools
  add("/dice-roller", "Dice Roller", "D4 to D20, instantly", G("dice-1", "dice-2", "dice-3", "dice-4", "dice-5", "dice-6"));
  add("/coin-flip", "Coin Flip", "Heads or tails, instantly", G("coin", "coins", "currency-dollar", "arrows-shuffle", "circle-dot"));
  add("/name-picker", "Name Picker", "Draw someone at random", G("users", "user-check", "arrows-shuffle", "ticket", "trophy"));
  add("/stream-timer", "Stream Timer", "Countdowns for your broadcast", G("clock", "hourglass", "alarm", "broadcast", "player-play"));
  add("/magic-8-ball", "Magic 8-Ball", "Ask a yes-or-no question", G("help-circle", "sparkles", "ball-bowling", "moon-stars", "question-mark"));
  add("/yes-no", "Yes or No?", "Tap for a quick decision", G("check", "x", "help-circle", "thumb-up", "thumb-down"));
  add("/tier-list-maker", "Tier Lists", "Rank anything, then share it", G("list-numbers", "trophy", "stairs", "star", "layout-list"));
  const tiers = { "mario-kart-8-deluxe-characters": ["MK8DX Characters", MK8], "mario-kart-8-deluxe-tracks": ["MK8DX Tracks", MK8], "mario-kart-8-deluxe-karts": ["MK8DX Karts", MK8],
    "mario-kart-world-vehicles": ["MK World Vehicles", MKW], "mario-kart-world-characters": ["MK World Characters", MKW], "mario-kart-world-tracks": ["MK World Tracks", MKW], "best-party-games": ["Best Party Games", null] };
  for (const [slug, [big, art]] of Object.entries(tiers)) add(`/tier-list-maker/${slug}`, big, "Tier List", art ? A(art) : G("list-numbers", "confetti", "dice-5", "device-gamepad-2", "star"), `public/images/opengraph/tier-list/${slug}.jpg`);
  add("/bingo-card-generator", "Bingo", "Card Generator", G("layout-grid", "check", "star", "confetti", "circle-check"));
  const bingo = { "twitch-stream-bingo": ["Stream Bingo", G("brand-twitch", "broadcast", "message-circle", "layout-grid", "check")], "mario-kart-bingo": ["Mario Kart Bingo", A(MK8)],
    "game-night-bingo": ["Game Night Bingo", A(GN)], "speedrun-bingo": ["Speedrun Bingo", G("stopwatch", "bolt", "layout-grid", "flag", "check")] };
  for (const [slug, [big, bg]] of Object.entries(bingo)) add(`/bingo-card-generator/${slug}`, big, "Card Generator", bg, `public/images/opengraph/bingo/${slug}.jpg`);
  add("/truth-or-dare", "Truth or Dare", "Endless party prompts", G("flame", "message-question", "mood-happy", "confetti", "bolt"));
  for (const [slug, t] of [["clean", "Clean"], ["party", "Party"], ["couples", "Couples"]])
    add(`/truth-or-dare/${slug}`, t, "Truth or Dare", G("flame", "message-question", "mood-happy", slug === "couples" ? "heart" : "confetti", "bolt"), `public/images/opengraph/truth-or-dare/${slug}.jpg`);
  // Halloween (2026-10-19): the three Halloween templates, on the spooky glyphs.
  const SPOOKY = G("ghost", "pumpkin-scary", "bat", "candy", "spider", "moon-stars");
  add("/truth-or-dare/halloween", "Halloween", "Truth or Dare", SPOOKY, "public/images/opengraph/truth-or-dare/halloween.jpg");
  add("/bingo-card-generator/halloween-party-bingo", "Halloween Bingo", "Card Generator", SPOOKY, "public/images/opengraph/bingo/halloween-party-bingo.jpg");
  add("/tier-list-maker/halloween-treats", "Halloween Treats", "Tier List", SPOOKY, "public/images/opengraph/tier-list/halloween-treats.jpg");
  add("/game-nights/halloween-party-games", "Halloween", "Free party games", SPOOKY);
  // Christmas (2026-10-19): the party games page and the new Christmas sets.
  const FESTIVE = G("christmas-tree", "gift", "snowflake", "candy", "star", "bell");
  add("/game-nights/christmas-party-games", "Christmas", "Free party games", FESTIVE);
  add("/truth-or-dare/christmas", "Christmas", "Truth or Dare", FESTIVE, "public/images/opengraph/truth-or-dare/christmas.jpg");
  add("/bingo-card-generator/christmas-party-bingo", "Christmas Bingo", "Card Generator", FESTIVE, "public/images/opengraph/bingo/christmas-party-bingo.jpg");
  add("/tier-list-maker/christmas-movies", "Christmas Movies", "Tier List", FESTIVE, "public/images/opengraph/tier-list/christmas-movies.jpg");
  // Hubs
  add("/welcome", "Welcome", "Free tools for every game night", G("calendar", "device-tv", "brand-discord", "broadcast", "trophy", "pokeball"));
  // Search pages (2026-10-20): the random Pokémon generator (glyphs only: no Pokémon art on our images).
  add("/randomizers/pokemon", "Random Pokémon", "Roll from all 1,025", G("pokeball", "dice-5", "flame", "droplet", "leaf", "bolt"), "public/images/opengraph/pokemon-og.jpg");
  add("/twitch-chat-games", "Chat Games", "Twelve ways viewers play along", G("broadcast", "message-circle", "trophy", "dice-5", "users-group"));
  add("/name-every-pokemon", "Name Them All", "How many can you remember?", G("list-numbers", "pokeball", "stopwatch", "brain", "trophy"));
  // The free bracket tools (search pages round, 2026-10-20).
  add("/bracket-generator", "Bracket Maker", "Single or double elimination", G("tournament", "trophy", "users", "crown", "flag"));
  add("/round-robin-generator", "Round Robin", "A schedule with live standings", G("layout-grid", "refresh", "users", "list-numbers", "trophy"));
  add("/swiss-pairing-generator", "Swiss Pairings", "Rounds, tiebreakers and a top cut", G("chess-knight", "cards", "list-numbers", "trophy", "users"));
  // Support levels (2026-10-19): the credits page and the campaign page.
  add("/credits", "Credits", "Made possible by our supporters", G("heart", "crown", "star", "award", "users-group"));
  add("/support", "Support", "Keep game night free", G("heart", "crown", "star", "award", "server"));
  add("/game-nights", "Game Nights", "Find a table near you", A(GN));
  add("/gs-circuit", "Circuit", "Run bigger tournaments", A(TOUR));
  add("/communities", "Communities", "Find your people", G("users-group", "message-circle", "heart-handshake", "home", "star"));
  add("/players", "Find Players", "People into the same games", G("user-search", "users", "device-gamepad-2", "map-pin", "heart-handshake"));
  add("/for-streamers", "For Streamers", "Make chat part of the game", G("broadcast", "device-tv", "microphone", "message-circle", "device-gamepad-2"));
  add("/for-streamers/current", "For Streamers", "Turn your viewers into players", G("broadcast", "users", "trophy", "message-circle", "device-gamepad-2"));
  add("/for-streamers/aspiring", "New Streamers", "Start with something to play", G("broadcast", "rocket", "sparkles", "device-gamepad-2", "message-circle"));
  add("/for-organizers", "For Organizers", "Run your events in one place", A(TOUR));
  add("/tcg-companion", "TCG Companion", "Pokémon game-night kit", A(CARDS));
  add("/pokemon-tcg/decks", "Deck Lists", "Pokémon TCG Standard 2026", A(CARDS));
  add("/sms", "Text Messages", "Alerts on your phone", G("message", "device-mobile", "bell", "checks", "message-circle"));
  add("/ideas", "Idea Board", "Vote on what we build next", G("bulb", "thumb-up", "sparkles", "message-circle", "rocket"));
  // Dynamic routes can't hold a static image file (the production build fails): their
  // opengraph-image.tsx / twitter-image.tsx read these from public instead.
  add("/ideas/[id]", "Idea Board", "Vote on what we build next", G("bulb", "thumb-up", "sparkles", "message-circle", "rocket"), "public/images/opengraph/pages/ideas.jpg");
  // Guides + help
  add("/guides", "Guides", "Tournaments and game nights", GUIDE);
  add("/guides/[slug]", "Guides", "Tournaments and game nights", GUIDE, "public/images/opengraph/pages/guides.jpg");
  for (const [route, h1] of Object.entries(titles)) {
    if (route.startsWith("/guides/")) add(route, h1.split(":")[0], "Guide", GUIDE);
    else if (route === "/help") add(route, "Help Center", "Answers and support", HELP);
    // The logo already says GameShuffle, so a heading that names it drops the word.
    else if (route.startsWith("/help/")) add(route, HELP_TITLES[route] ?? h1, "Help Center", HELP);
  }
  // Legal
  for (const [route, big] of [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"], ["/cookie-policy", "Cookie Policy"], ["/accessibility", "Accessibility"], ["/data-request", "Data Request"], ["/legal/tcg-attribution", "TCG Attribution"]])
    add(route, big, "Legal", LEGAL);
  return specs;
}

function checkWords(s) {
  const words = (t) => t.toLowerCase().split(/[^a-z0-9é]+/).filter((w) => w.length > 2);
  const seen = new Set(words("GameShuffle"));
  for (const w of [...words(s.big), ...words(s.sub)]) {
    if (seen.has(w)) throw new Error(`${s.route}: "${w}" repeats across the share image lines`);
    seen.add(w);
  }
}

/** Every route that has one of these images, and its h1 (help + guide titles come from the pages). */
async function titlesFromDev() {
  const routes = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "opengraph-image.jpg") routes.push(p.slice(path.join(APP, "src/app").length).replace(/\/opengraph-image\.jpg$/, "") || "/");
    }
  };
  walk(path.join(APP, "src/app/help"));
  walk(path.join(APP, "src/app/guides"));
  const titles = {};
  for (const route of routes) {
    if (route.includes("[")) continue;
    const html = await (await fetch(DEV + route)).text();
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const clean = (x) => x.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&apos;|&#39;/g, "'").replace(/&quot;/g, '"').trim();
    if (!h1) throw new Error(`no h1 on ${route} (is the dev server running?)`);
    titles[route] = clean(h1[1]);
  }
  return titles;
}

function inner(name) {
  let p = path.join(ICONS, `${name}.svg`);
  if (!fs.existsSync(p)) p = path.join(ICONS, "star.svg");
  return fs.readFileSync(p, "utf8").replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, "").replace('<path stroke="none" d="M0 0h24v24H0z" fill="none"/>', "");
}
/** A seeded, tiled field of the page's glyphs (the same seed gives the same field every run). */
function pattern(icons, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h % 10000) / 10000);
  const T = 240, parts = [];
  for (let i = 0; i < 9; i++) {
    const cx = i % 3, cy = Math.floor(i / 3);
    const name = icons[(i + Math.floor(rnd() * icons.length)) % icons.length];
    const size = 40 + Math.floor(rnd() * 23), x = cx * 80 + 10 + Math.floor(rnd() * 31), y = cy * 80 + 10 + Math.floor(rnd() * 31), rot = Math.floor(rnd() * 49) - 24;
    const body = inner(name);
    for (const [dx, dy] of [[0, 0], [-T, 0], [0, -T], [-T, -T]])
      parts.push(`<g transform="translate(${x + dx + size / 2} ${y + dy + size / 2}) rotate(${rot}) scale(${size / 24}) translate(-12 -12)" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</g>`);
  }
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">${parts.join("")}</svg>`)}")`;
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cardHtml(s) {
  const layer = s.bg.art
    ? `.og{background:url("${s.bg.art}") center/cover} .og::before{background:linear-gradient(135deg,rgba(47,102,236,.86),rgba(75,92,245,.80))} .glyph{display:none}`
    : `.og{background:linear-gradient(135deg,#2f66ec,#4b5cf5)} .og::before{background:radial-gradient(90% 90% at 50% 45%,rgba(47,102,236,0),rgba(24,40,140,.35))} .glyph{position:absolute;inset:0;background-image:${pattern(s.bg.glyphs, s.id)};background-size:240px 240px;opacity:.16}`;
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:G;src:url(${FONT}) format("woff2");font-weight:400 900}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
.og{position:relative;width:1200px;height:630px;font-family:G,sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 70px;box-sizing:border-box}
.og::before{content:"";position:absolute;inset:0}
${layer}
.og>*:not(.glyph){position:relative}
.brand{height:52px;width:auto;margin-bottom:14px}
.title{font-size:200px;font-weight:700;line-height:1.02;letter-spacing:-2px;max-width:1060px;text-wrap:balance}
.sub{font-size:64px;font-weight:600;margin-top:18px;letter-spacing:.5px}
</style>
<div class="og"><div class="glyph"></div><img class="brand" src="${LOGO}" alt=""><div class="title" id="t">${esc(s.big)}</div><div class="sub">${esc(s.sub)}</div></div>
<script>
// Fit the title: at most two lines and 330px tall, as big as it can be.
const t = document.getElementById("t"); let f = 200;
const ok = () => t.scrollWidth <= 1060 && t.offsetHeight <= 330 && t.offsetHeight / (f * 1.02) <= 2.05;
document.fonts.ready.then(() => { while (!ok() && f > 70) { f -= 4; t.style.fontSize = f + "px"; } document.body.dataset.ready = "1"; });
</script>`;
}

(async () => {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  const preview = args.includes("--preview") ? args[args.indexOf("--preview") + 1] : null;
  const specs = specsFor(await titlesFromDev()).filter((s) => !only || only.includes(s.route));
  const problems = specs.flatMap((sp) => { try { checkWords(sp); return []; } catch (e) { return [e.message]; } });
  if (problems.length) throw new Error(`Fix these first:\n${problems.join("\n")}`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "gs-page-og-"));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gs-page-og-chrome-"));
  const port = 9100 + Math.floor(Math.random() * 100);
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--hide-scrollbars", "--allow-file-access-from-files", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "--window-size=1200,630", "about:blank"], { stdio: "ignore" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let tabs; for (let i = 0; i < 60 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); } }
    const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => ws.on("open", r));
    let id = 0; const pending = new Map();
    ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
    for (const s of specs) {
      const file = path.join(work, `${s.id}.html`);
      fs.writeFileSync(file, cardHtml(s));
      await send("Page.navigate", { url: `file://${file}` });
      for (let i = 0; i < 80; i++) {
        const r = await send("Runtime.evaluate", { expression: "document.body && document.body.dataset.ready === '1' && [...document.images].every((i) => i.complete)", returnByValue: true });
        if (r.result?.result?.value) break;
        await sleep(100);
      }
      await sleep(350); // background art paint
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
      const jpg = await sharp(Buffer.from(shot.result.data, "base64")).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
      if (preview) { fs.mkdirSync(preview, { recursive: true }); fs.writeFileSync(path.join(preview, `${s.id}.jpg`), jpg); }
      else {
        const out = path.join(APP, s.out);
        if (!fs.existsSync(path.dirname(out))) { console.warn(`skip ${s.route}: ${path.dirname(s.out)} doesn't exist`); continue; }
        fs.writeFileSync(out, jpg);
        if (out.endsWith("opengraph-image.jpg")) fs.writeFileSync(out.replace("opengraph-image.jpg", "twitter-image.jpg"), jpg);
      }
      process.stdout.write(".");
    }
    console.log(`\n${preview ? "previewed" : "wrote"} ${specs.length}`);
    ws.close();
  } finally {
    chrome.kill("SIGKILL");
  }
})().catch((e) => { console.error(e); process.exit(1); });
