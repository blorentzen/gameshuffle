/**
 * Accessibility check: runs axe (WCAG 2.0/2.1 A + AA, plus best practices) on
 * pages of the local dev server at a phone and a desktop width, and lists what
 * fails. Exits 1 if anything does.
 *
 *   node scripts/a11y-check.cjs /daily /weekly "/discord/activity?preview=guest&tab=daily"
 *   BASE=http://localhost:3001 node scripts/a11y-check.cjs /
 *
 * Needs Google Chrome installed and the dev server running. Pages behind
 * sign-in need a signed-in Chrome profile, so check those by hand. axe can't
 * judge everything (text on gradients and photos, focus order, what a screen
 * reader actually says), so it's a floor, not a pass.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");

const BASE = process.env.BASE || "http://localhost:3000";
const PAGES = process.argv.slice(2);
if (!PAGES.length) {
  console.error("Usage: node scripts/a11y-check.cjs <path> [path...]");
  process.exit(2);
}
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SIZES = [["phone", 390, 760], ["desktop", 1280, 800]];
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gs-a11y-"));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
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

  const found = new Map();
  for (const [size, w, h] of SIZES) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    for (const page of PAGES) {
      await send("Page.navigate", { url: `${BASE}${page}` });
      await sleep(6000);
      await evalJs(`${AXE};1`);
      const violations = await evalJs(`axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } })
        .then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, url: v.helpUrl, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) })))`);
      for (const v of violations ?? []) {
        if (!found.has(v.id)) found.set(v.id, { ...v, where: [] });
        found.get(v.id).where.push(`${page} (${size})`);
      }
      console.log(`${page} (${size}): ${(violations ?? []).length ? `${violations.length} failing` : "ok"}`);
    }
  }
  for (const v of found.values()) {
    console.log(`\n[${v.impact}] ${v.id}: ${v.help}\n  ${v.url}\n  on: ${v.where.join(", ")}`);
    for (const n of v.nodes) console.log(`   - ${n}`);
  }
  chrome.kill("SIGKILL");
  process.exit(found.size ? 1 : 0);
})();
