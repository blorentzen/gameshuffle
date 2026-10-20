/**
 * Copy check: lists phrases in site copy that read as machine-written or
 * filler (Britton, 2026-10-20: "obvious signs of AI writing"), so a writing
 * pass can find them. Scans string literals and JSX text in src/app,
 * src/components, src/data and src/lib (comments are skipped). It's a
 * pointer, not a judge: some hits are fine in context.
 *
 *   npx tsx scripts/copy-check.ts                 # every phrase, grouped by file
 *   npx tsx scripts/copy-check.ts src/app/daily   # only under a path
 *   npx tsx scripts/copy-check.ts --summary       # counts per phrase
 *
 * What to do with a hit: say the thing plainly, once per page. The rules
 * behind the list are in CLAUDE.md ("Writing").
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src/app", "src/components", "src/data", "src/lib"];
const args = process.argv.slice(2);
const summary = args.includes("--summary");
const only = args.filter((a) => !a.startsWith("--"));

const PHRASES: { name: string; re: RegExp }[] = [
  { name: "\"not just\" contrast", re: /\b(not just|isn't just|more than just|not only)\b/i },
  { name: "\", not\" contrast", re: /\w, not (a|an|the|just|another)\b/i },
  { name: "\"a real\"", re: /\ba real\b/i },
  { name: "\"whether you're\"", re: /\bwhether you('re| are)\b/i },
  { name: "rhetorical opener", re: /(^|["'`>{]\s*)(Done for today|Want more|One more before you go|Answer one more [a-z ]{2,20}|Ready to [a-z ]{2,30}|Streaming it|Looking for [a-z ]{2,30}|Need more [a-z ]{2,20})\?/i },
  { name: "slogan filler", re: /\b(everything you need|all in one place|at your fingertips|seamless(ly)?|effortless(ly)?|unleash|elevate|supercharge|game[- ]changer|next level|level up your|dive in|the ultimate|say goodbye|heavy lifting|without the hassle|just works|out of the box|stack up|it's that simple|what are you waiting for)\b/i },
  { name: "\"journey\" / \"finally\" / \"simply\"", re: /\b(journey|finally|simply)\b/i },
  { name: "\"whole\"", re: /\bthe whole (couch|table|night|room|crew|group|squad|family|lobby|chat)\b/i },
  { name: "\"designed to\" / \"built for\"", re: /\b(designed to|built for|made for)\b/i },
  { name: "dash", re: /\s[—–]\s|[—–]/ },
];

// Lines that are code or comments, not copy.
const SKIP_LINE = /^\s*(\/\/|\*|\/\*|import |export type|type |interface |console\.|throw new Error)/;
// A hit only counts inside quotes, a template string or JSX text.
const IN_COPY = /(["'`])(?:(?!\1).)*$|>[^<]*$/;

function walk(dir: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p, out); }
    else if (/\.(tsx?|mdx?)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
}

const files: string[] = [];
for (const r of only.length ? only : ROOTS) {
  if (fs.existsSync(r) && fs.statSync(r).isFile()) files.push(r); else walk(r, files);
}

type Hit = { file: string; line: number; phrase: string; text: string };
const hits: Hit[] = [];
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let inBlock = false;
  lines.forEach((raw, i) => {
    const line = raw;
    if (inBlock) { if (line.includes("*/")) inBlock = false; return; }
    if (/^\s*\/\*/.test(line) && !line.includes("*/")) { inBlock = true; return; }
    if (SKIP_LINE.test(line)) return;
    const code = line.replace(/\/\/.*$/, (m) => (/["'`]/.test(m) ? m : ""));
    for (const p of PHRASES) {
      const m = p.re.exec(code);
      if (!m) continue;
      if (!IN_COPY.test(code.slice(0, m.index + 1))) continue;
      hits.push({ file, line: i + 1, phrase: p.name, text: line.trim().slice(0, 140) });
    }
  });
}

if (summary) {
  const by = new Map<string, number>();
  for (const h of hits) by.set(h.phrase, (by.get(h.phrase) ?? 0) + 1);
  for (const [k, v] of [...by.entries()].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(5)}  ${k}`);
  const fileCount = new Set(hits.map((h) => h.file)).size;
  console.log(`\n${hits.length} hits in ${fileCount} files`);
} else {
  let last = "";
  for (const h of hits) {
    if (h.file !== last) { console.log(`\n${h.file}`); last = h.file; }
    console.log(`  ${String(h.line).padStart(5)}  [${h.phrase}]  ${h.text}`);
  }
  console.log(`\n${hits.length} hits`);
}
