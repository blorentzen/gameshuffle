/**
 * Text size check: lists visible text smaller than our floor on pages of the
 * local dev server, at a phone and a desktop width, and buttons or fields
 * smaller than a 24px tap target. Exits 1 if it finds any.
 *
 *   node scripts/text-size-check.cjs /trivia /discord
 *   BASE=http://localhost:3001 node scripts/text-size-check.cjs /
 *
 * The floor: 14px for reading text, 12px for labels (uppercase eyebrows, and
 * tags, counts or statuses of one or two words). Text hidden from sight (sr-only, aria-hidden, zero size) is skipped,
 * and so is text inside an <svg> or a <canvas> drawing. A compact layout
 * should drop elements, never shrink them below this (see CLAUDE.md, "Text
 * size"). Same flags as a11y-check.cjs: A11Y_COOKIES, A11Y_STORAGE, A11Y_CLICK.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");

const BASE = process.env.BASE || "http://localhost:3000";
const PAGES = process.argv.slice(2);
if (!PAGES.length) {
  console.error("Usage: node scripts/text-size-check.cjs <path> [path...]");
  process.exit(2);
}
const SIZES = [["phone", 390, 760], ["desktop", 1280, 800]];
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in the page: every visible text run under the floor, grouped by the
// element that sets its size, plus small buttons and fields.
const PROBE = `(() => {
  const out = [];
  const seen = new Set();
  const hidden = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return true;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return true;
      if (cs.position === "absolute" && cs.clip !== "auto" && n.offsetWidth <= 1) return true;
      if (n.tagName === "svg" || n.tagName === "CANVAS") return true;
    }
    return false;
  };
  const label = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    // React splits "{n} answers so far" into several text nodes: judge the element's whole line.
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\\s+/g, " ").trim();
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (hidden(el)) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    const upper = cs.textTransform === "uppercase" || (text.length > 2 && text === text.toUpperCase() && /[A-Z]/.test(text));
    // A tag, count or one-word status ("New", "32", "Party only") is a label, not reading text.
    const short = (text.split(" ").length <= 2 && text.length <= 16) || /badge|chip|tag|pill|count|eyebrow/.test(typeof el.className === "string" ? el.className : "");
    const floor = upper || short ? 12 : 14;
    if (px < floor - 0.25) out.push({ kind: "text", px: Math.round(px * 10) / 10, where: label(el), text: text.slice(0, 60) });
  }
  for (const el of document.querySelectorAll("button, [role=button], input:not([type=hidden]), select, textarea, a.empac-button")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || hidden(el)) continue;
    // A radio or checkbox with a label: the label is part of the target.
    if (/^(radio|checkbox)$/.test(el.type) && (el.closest("label") || (el.id && document.querySelector('label[for="' + el.id + '"]')))) continue;
    if (r.width < 24 || r.height < 24) out.push({ kind: "target", px: Math.round(Math.min(r.width, r.height)), where: label(el), text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").replace(/\\s+/g, " ").trim().slice(0, 60) });
  }
  return out;
})()`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gs-textsize-"));
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
  const evalJs = async (js) => (await send("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Page.enable");
  await send("Runtime.enable");
  if (process.env.A11Y_COOKIES) {
    await send("Network.enable");
    const host = new URL(BASE).hostname;
    for (const c of JSON.parse(fs.readFileSync(process.env.A11Y_COOKIES, "utf8")).cookies) await send("Network.setCookie", { name: c.name, value: c.value, domain: host, path: "/" });
  }

  const found = new Map();
  for (const [size, w, h] of SIZES) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    for (const page of PAGES) {
      await send("Page.navigate", { url: `${BASE}${page}` });
      await sleep(6000);
      if (process.env.A11Y_STORAGE) {
        const items = JSON.parse(fs.readFileSync(process.env.A11Y_STORAGE, "utf8"));
        for (const [k, v] of Object.entries(items)) await evalJs(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(typeof v === "string" ? v : JSON.stringify(v))});1`);
        await send("Page.reload", {});
        await sleep(6000);
      }
      for (const text of (process.env.A11Y_CLICK || "").split("||").filter(Boolean)) {
        const js = text.startsWith("css:")
          ? `document.querySelector(${JSON.stringify(text.slice(4))})?.click()`
          : `[...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === ${JSON.stringify(text)})?.click()`;
        await evalJs(js);
        await sleep(1200);
      }
      // Scroll through once so lazy sections render.
      await evalJs(`(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } window.scrollTo(0, 0); })()`);
      await sleep(800);
      for (const f of (await evalJs(PROBE)) || []) {
        const key = `${page}|${f.kind}|${f.where}|${f.px}`;
        const v = found.get(key) || { ...f, page, on: [] };
        if (!v.on.includes(size)) v.on.push(size);
        found.set(key, v);
      }
    }
  }
  const rows = [...found.values()].sort((a, b) => a.page.localeCompare(b.page) || a.kind.localeCompare(b.kind) || a.px - b.px);
  let last = "";
  for (const r of rows) {
    if (r.page !== last) { console.log(`\n${r.page}`); last = r.page; }
    console.log(`  ${r.kind === "text" ? `${r.px}px text` : `${r.px}px target`}  ${r.where}  "${r.text}"  (${r.on.join(", ")})`);
  }
  if (!rows.length) console.log("No text under the floor and no tap targets under 24px.");
  done(rows.length ? 1 : 0);
})();
