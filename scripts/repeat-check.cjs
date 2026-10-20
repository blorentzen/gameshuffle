/**
 * Repeat check: loads pages of the local dev server at phone width and lists
 * wording that appears in more than one place on the same page (the hero, the
 * steps, How it works and the FAQ saying the same thing). Britton, 2026-10-20:
 * say each thing once per page. Accordions and <details> are opened first so
 * folded answers count.
 *
 *   node scripts/repeat-check.cjs /daily /daily-dex
 *   REPEAT_WORDS=5 node scripts/repeat-check.cjs /trivia     # shorter runs (default 6 words)
 *
 * A hit is a run of at least REPEAT_WORDS words found in two or more separate
 * blocks (paragraphs, list items, headings, table cells). Navigation, the
 * footer and hidden text are skipped. Exits 1 when it finds any.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");

const BASE = process.env.BASE || "http://localhost:3000";
const N = Number(process.env.REPEAT_WORDS || 6);
const PAGES = process.argv.slice(2);
if (!PAGES.length) {
  console.error("Usage: node scripts/repeat-check.cjs <path> [path...]");
  process.exit(2);
}
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in the page: the text of each visible block inside <main>, outside nav and footer.
const BLOCKS = `(async () => {
  document.querySelectorAll("details").forEach((d) => { d.open = true; });
  for (const b of document.querySelectorAll("main button[aria-expanded='false']")) { if (b.closest(".empac-accordion")) b.click(); }
  await new Promise((r) => setTimeout(r, 700));
  const main = document.querySelector("main") || document.body;
  const out = [];
  // Leaf blocks: block-level elements with text and no block-level element with text inside.
  const isBlock = (el) => /^(block|list-item|table-cell|flex|grid)$/.test(getComputedStyle(el).display);
  for (const el of main.querySelectorAll("*")) {
    if (!isBlock(el) || !el.innerText || !el.innerText.trim()) continue;
    if ([...el.querySelectorAll("*")].some((c) => isBlock(c) && c.innerText && c.innerText.trim())) continue;
    if (el.closest("nav, footer, [aria-hidden='true'], .sr-only")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const t = el.innerText.replace(/\\s+/g, " ").trim();
    if (t.split(" ").length >= ${N}) out.push(t);
  }
  return out;
})()`;

const words = (t) => t.toLowerCase().replace(/[’']/g, "'").replace(/(\d),(\d)/g, "$1$2").replace(/[^\p{L}\p{N}'×.\- ]+/gu, " ").replace(/\.(?!\d)/g, " ").split(/\s+/).filter(Boolean);

function repeats(blocks) {
  const seen = new Map(); // shingle -> Set(block index)
  blocks.forEach((b, i) => {
    const w = words(b);
    for (let k = 0; k + N <= w.length; k++) {
      const s = w.slice(k, k + N).join(" ");
      if (!seen.has(s)) seen.set(s, new Set());
      seen.get(s).add(i);
    }
  });
  // Shingles shared by 2+ blocks, merged into longer runs per pair of blocks.
  const shared = [...seen.entries()].filter(([, set]) => set.size > 1);
  const groups = new Map(); // block set key -> shingles
  for (const [s, set] of shared) {
    const key = [...set].sort((a, b) => a - b).join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const res = [];
  for (const [key, shingles] of groups) {
    const idx = key.split(",").map(Number);
    // Rebuild the longest run from the first block that contains these shingles.
    const w = words(blocks[idx[0]]);
    const set = new Set(shingles);
    let best = "", cur = [];
    for (let k = 0; k + N <= w.length; k++) {
      const s = w.slice(k, k + N).join(" ");
      if (set.has(s)) { cur = cur.length ? [...cur, w[k + N - 1]] : w.slice(k, k + N); if (cur.join(" ").length > best.length) best = cur.join(" "); }
      else cur = [];
    }
    res.push({ phrase: best, blocks: idx.map((i) => blocks[i]) });
  }
  return res.sort((a, b) => b.phrase.length - a.phrase.length);
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gs-repeat-"));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
  const done = (code) => {
    chrome.kill("SIGKILL");
    // Headless profiles are ~30MB each; leaving them filled the disk once.
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 300);
  };
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.on("open", r));
  let id = 0;
  const pending = new Map();
  ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  let total = 0;
  for (const page of PAGES) {
    await send("Page.navigate", { url: `${BASE}${page}` });
    await sleep(6000);
    const r = await send("Runtime.evaluate", { expression: BLOCKS, awaitPromise: true, returnByValue: true });
    const found = repeats(r.result?.result?.value || []);
    total += found.length;
    console.log(`\n${page}: ${found.length ? `${found.length} repeated` : "nothing repeated"}`);
    for (const f of found) {
      console.log(`  "${f.phrase}"`);
      for (const b of f.blocks) console.log(`      in: ${b.slice(0, 110)}${b.length > 110 ? "…" : ""}`);
    }
  }
  done(total ? 1 : 0);
})();
