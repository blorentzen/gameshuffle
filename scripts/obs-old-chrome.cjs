/**
 * OBS before version 31 (and other streaming apps) draws browser sources with Chromium 103: no container units (cqw),
 * no color-mix(), no :has(). This renders a page the way that engine would, from the current Chrome: declarations with
 * those values are dropped (or go empty when they use var(), as they do there), :has() rules are dropped, and the
 * page's `@supports not (...)` fallbacks for them are switched on. Compare against a normal render to check an OBS
 * source before shipping it (reported 2026-11-06: the MMR card fell apart in OBS).
 *
 *   node scripts/obs-old-chrome.cjs <url> <out.jpg> <width> <height> [old]
 *   JAR=scripts/.tmp/jar-staff_steph.json node scripts/obs-old-chrome.cjs "http://localhost:3001/social/overlays?piece=battle&paused=1" a.jpg 1280 720 old
 *
 * A simulation, not the real engine: it doesn't catch newer JavaScript or other CSS a 2022 Chromium lacks.
 */
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const WebSocket = require("ws");
const [url, out, W, H, strip = ""] = process.argv.slice(2);
if (!url || !out) { console.error("usage: node scripts/obs-old-chrome.cjs <url> <out.jpg> <width> <height> [old]"); process.exit(2); }
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gs-obs-"));
  const port = 9600 + Math.floor(Math.random() * 300);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
  try {
    let tabs;
    for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {} await sleep(250); }
    const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => ws.on("open", r));
    let id = 0; const wait = new Map();
    ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && wait.has(d.id)) { wait.get(d.id)(d.result ?? d); wait.delete(d.id); } });
    const send = (method, params = {}) => new Promise((r) => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    await send("Emulation.setDeviceMetricsOverride", { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 1 } });
    if (process.env.JAR) for (const c of JSON.parse(fs.readFileSync(process.env.JAR, "utf8")).cookies) await send("Network.setCookie", { name: c.name, value: c.value, domain: "localhost", path: "/" });
    await send("Page.navigate", { url });
    await sleep(8000);
    if (strip) {
      // Chromium 103: no container units, no color-mix(). A declaration with such a value is dropped when parsed,
      // unless it uses var(): then it's kept and turns invalid when drawn (the property goes back to unset).
      // Custom properties take anything. @supports not (...) blocks for those features apply.
      const expr = `(() => {
        const bad = (v) => /[0-9.]cq(i|w|h|b|min|max)\\b/.test(v) || /color-mix\\(/.test(v);
        let dropped = 0, unset = 0; const extra = [];
        const fix = (style) => { for (const p of [...style]) { if (p.startsWith("--")) continue; const v = style.getPropertyValue(p); if (!bad(v)) continue; if (/var\\(/.test(v)) { style.setProperty(p, "unset", style.getPropertyPriority(p)); unset++; } else { style.removeProperty(p); dropped++; } } };
        const walk = (rules) => { for (const r of [...rules]) {
          if (r instanceof CSSSupportsRule && /^not/.test(r.conditionText.trim()) && /cq|color-mix/.test(r.conditionText)) { for (const x of r.cssRules) extra.push(x.cssText); continue; }
          if (r.selectorText && /:has\\(/.test(r.selectorText)) { r.parentStyleSheet && (r.parentRule ? r.parentRule.deleteRule([...r.parentRule.cssRules].indexOf(r)) : r.parentStyleSheet.deleteRule([...r.parentStyleSheet.cssRules].indexOf(r))); dropped++; continue; }
          if (r.style) fix(r.style);
          if (r.cssRules) walk(r.cssRules);
        } };
        for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch {} }
        for (const el of document.querySelectorAll("[style]")) fix(el.style);
        const st = document.createElement("style"); st.textContent = extra.join("\\n"); document.head.appendChild(st);
        return { dropped, unset, fallbacks: extra.length };
      })()`;
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
      console.log("old engine:", JSON.stringify(r.result.value));
      await sleep(1500);
    }
    const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
    fs.writeFileSync(out, Buffer.from(data, "base64"));
    ws.close();
  } finally { chrome.kill(); await sleep(300); await sleep(700); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
})();
