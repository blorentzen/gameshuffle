/**
 * Renders the Discord Activity's art for the Developer Portal (Activities > Art
 * Assets): cover art 16:9 and 13:11 (title + art) and the embedded background
 * (16:9, art around the edges, centre clear). Brand only: the navy aurora,
 * the white logo, Daily-style match/close/miss squares and Tabler glyph tiles;
 * no game art. Writes public/images/discord/*.png.
 *
 *   node scripts/render-discord-activity-art.cjs   (needs Google Chrome installed)
 */
const fs = require("fs"); const path = require("path"); const { spawn } = require("child_process");
const WebSocket = require("ws");
const os = require("os");
const REPO = path.resolve(__dirname, "..");
const icon = (n) => fs.readFileSync(`${REPO}/node_modules/@tabler/icons/icons/outline/${n}.svg`, "utf8")
  .replace(/width="24"/, 'width="100%"').replace(/height="24"/, 'height="100%"').replace(/stroke-width="2"/, 'stroke-width="1.6"');
// The same five as the "originals" set in EventHeaderArt (the Activity's glyph field).
const ICONS = ["puzzle", "calendar-week", "brain", "trophy", "sparkles"].map(icon);
const logo = fs.readFileSync(`${REPO}/public/images/fg/logos/gameshuffle-wht.svg`, "utf8");
const fontUrl = encodeURI(`file://${REPO}/src/app/fonts/gabarito.woff2`);
const bodyFont = encodeURI(`file://${REPO}/src/app/fonts/outfit.woff2`);

// The site's glyph field (IconField on the hero bands): a jittered grid of
// small rotated Tabler glyphs at low opacity across the whole background.
function field(W, H, step = 120) {
  let seed = 31; const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let out = "";
  for (let y = -step / 2; y < H + step; y += step) for (let x = -step / 2; x < W + step; x += step) {
    const size = step * (0.42 + rand() * 0.2);
    const jx = (rand() - 0.5) * step * 0.6, jy = (rand() - 0.5) * step * 0.6;
    const rot = Math.round((rand() - 0.5) * 50);
    out += `<span class="f" style="left:${(x + jx).toFixed(0)}px;top:${(y + jy).toFixed(0)}px;width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;transform:rotate(${rot}deg)">${ICONS[Math.floor(rand() * ICONS.length)]}</span>`;
  }
  return `<div class="field">${out}</div>`;
}

// A deterministic mosaic: rows of rounded tiles in the Daily's colours, some carrying a glyph.
function mosaic({ cols, rows, size, gap, x0, y0, skip }) {
  let seed = 7; const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const kinds = ["match", "close", "miss", "glyph", "match", "glyph", "miss", "close", "glyph"];
  let out = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = x0 + c * (size + gap), y = y0 + r * (size + gap);
    if (skip && skip(x, y, size)) continue;
    const k = kinds[Math.floor(rand() * kinds.length)];
    const fade = 0.55 + rand() * 0.45;
    const inner = k === "glyph" ? `<span class="g">${ICONS[Math.floor(rand() * ICONS.length)]}</span>` : "";
    out += `<div class="t ${k}" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;opacity:${fade.toFixed(2)}">${inner}</div>`;
  }
  return out;
}

function page(W, H, kind) {
  const tiles = kind === "background"
    ? mosaic({ cols: 16, rows: 9, size: 104, gap: 18, x0: -30, y0: -24, skip: (x, y, s) => x > W * 0.2 - s && x < W * 0.8 && y > H * 0.18 - s && y < H * 0.82 })
    : kind === "cover169"
      ? mosaic({ cols: 7, rows: 9, size: 118, gap: 20, x0: W - 7 * 138 + 40, y0: -40 })
      : mosaic({ cols: 9, rows: 3, size: 118, gap: 20, x0: -20, y0: H - 3 * 138 + 44 });
  const copy = kind === "background" ? "" : `
    <div class="copy ${kind}">
      <div class="logo">${logo}</div>
      <h1>The Daily.<br>The Weekly.<br>Chat Brain.</h1>
      <p>GameShuffle's games, played together in Discord.</p>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Gabarito; src: url("${fontUrl}") format("woff2"); font-weight: 400 800; }
    @font-face { font-family: Outfit; src: url("${bodyFont}") format("woff2"); font-weight: 300 700; }
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
    body { position: relative; background: radial-gradient(120% 140% at 30% -20%, #1c1e5f 0%, #0b0d14 68%); color: #fff; font-family: Outfit, sans-serif; }
    .blob { position: absolute; border-radius: 50%; filter: blur(120px); }
    .b1 { width: 900px; height: 900px; left: -260px; top: -420px; background: radial-gradient(circle, rgba(39,102,236,.75), transparent 62%); }
    .b2 { width: 900px; height: 900px; right: -300px; top: -300px; background: radial-gradient(circle, rgba(201,73,233,.5), transparent 62%); }
    .b3 { width: 800px; height: 800px; right: 10%; bottom: -520px; background: radial-gradient(circle, rgba(39,102,236,.45), transparent 62%); }
    .field { position: absolute; inset: 0; opacity: .11; color: #fff; }
    .field .f { position: absolute; display: block; }
    .field .f svg { width: 100%; height: 100%; display: block; }
    /* As on the site's hero bands: the field is welcome in the margins, noise behind the type. */
    .veil { position: absolute; inset: 0; pointer-events: none; }
    .veil.cover169 { background: radial-gradient(48% 62% at 26% 52%, rgba(11,13,28,.94), rgba(11,13,28,.6) 55%, rgba(11,13,28,0) 80%); }
    .veil.cover1311 { background: radial-gradient(70% 48% at 34% 30%, rgba(11,13,28,.94), rgba(11,13,28,.6) 55%, rgba(11,13,28,0) 82%); }
    .veil.background { background: radial-gradient(42% 46% at 50% 50%, rgba(11,13,28,.9), rgba(11,13,28,0) 85%); }
    .t { position: absolute; border-radius: 22%; box-sizing: border-box; display: grid; place-items: center; }
    .t.match { background: #1a8a57; box-shadow: inset 0 0 0 2px rgba(255,255,255,.12); }
    .t.close { background: #e2a336; box-shadow: inset 0 0 0 2px rgba(255,255,255,.14); }
    .t.miss { background: #1b1e36; box-shadow: inset 0 0 0 2px rgba(255,255,255,.10); }
    .t.glyph { background: #2766ec; box-shadow: 0 12px 40px rgba(39,102,236,.45), inset 0 0 0 2px rgba(255,255,255,.18); }
    .t .g { width: 52%; height: 52%; color: #fff; display: block; }
    .copy { position: absolute; z-index: 2; }
    .copy.cover169 { left: 120px; top: 50%; transform: translateY(-50%); width: 860px; }
    .copy.cover1311 { left: 100px; top: 84px; width: 1000px; }
    .cover1311 .logo { width: 300px; margin-bottom: 34px; }
    .cover1311 p { font-size: 40px; }
    .logo { width: 360px; margin-bottom: 44px; }
    .logo svg { width: 100%; height: auto; display: block; }
    h1 { font-family: Gabarito, sans-serif; font-weight: 800; font-size: 124px; line-height: .98; margin: 0 0 32px; letter-spacing: -1px; }
    .cover1311 h1 { font-size: 104px; margin-bottom: 26px; }
    p { font-size: 44px; line-height: 1.25; margin: 0; color: rgba(236,238,255,.86); max-width: 760px; }
  </style></head><body>
    <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
    ${field(W, H)}<div class="veil ${kind}"></div>${tiles}${copy}
  </body></html>`;
}

const OUT = `${REPO}/public/images/discord`;
fs.mkdirSync(OUT, { recursive: true });
const JOBS = [
  ["activity-cover-16x9", 1920, 1080, "cover169"],
  ["activity-cover-13x11", 1300, 1100, "cover1311"],
  ["activity-background-16x9", 1920, 1080, "background"],
];
const port = 9800 + Math.floor(Math.random() * 100);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gs-art-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.on("open", r));
  let id = 0; const pending = new Map();
  ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  for (const [name, W, H, kind] of JOBS) {
    const file = path.join(os.tmpdir(), `gs-${name}.html`);
    fs.writeFileSync(file, page(W, H, kind));
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: `file://${file}` });
    await sleep(800);
    await send("Runtime.evaluate", { expression: "Promise.all([document.fonts.load('400 44px Outfit'), document.fonts.load('800 120px Gabarito')])", awaitPromise: true });
    await sleep(400);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.result.data, "base64"));
    console.log("wrote", name, W + "x" + H);
  }
  chrome.kill("SIGKILL"); process.exit(0);
})();
