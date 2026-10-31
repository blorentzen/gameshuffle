/**
 * Finds (and with --write, fixes) a compiler bug that drops spaces in JSX text.
 *
 * Next 16.2's SWC removes the leading space of a JSX text run when that text
 * also contains an HTML entity (&apos;, &rsquo;, &amp;…) and a line break:
 *
 *   <p>
 *     Go to <a>Setup</a> and you&apos;re set.
 *   </p>
 *
 * renders "Setupand you're set." (found 2026-10-09 on the Discord bot tab and
 * Engagement). The fix is an explicit {" "} after the element. Run before a
 * release:
 *
 *   npx tsx scripts/fix-jsx-entity-spaces.ts          # report, exits 1 if any
 *   npx tsx scripts/fix-jsx-entity-spaces.ts --write  # fix them in place
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.join(process.cwd(), "src");
const WRITE = process.argv.includes("--write");
const ENTITY = /&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

let total = 0;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  if (!ENTITY.test(src)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.getFullText(sf);
      const parent = node.parent;
      const kids = ts.isJsxElement(parent) || ts.isJsxFragment(parent) ? parent.children : null;
      const i = kids ? kids.indexOf(node) : -1;
      const prev = i > 0 ? kids![i - 1] : null;
      // A space (not a line break) right after an element or {expression}, in a
      // run that has an entity and goes on past the end of the line.
      if (prev && !ts.isJsxText(prev) && /^ +\S/.test(text) && text.includes("\n") && ENTITY.test(text)) {
        hits.push(node.pos); // JSX text has no trivia: pos is its first character, the space
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (hits.length === 0) continue;
  total += hits.length;
  for (const pos of hits) {
    const { line } = sf.getLineAndCharacterOfPosition(pos);
    console.log(`${path.relative(process.cwd(), file)}:${line + 1}`);
  }
  if (WRITE) {
    // Replace the single leading space of each run with {" "}, last first so
    // earlier offsets stay valid.
    let next = src;
    for (const pos of [...hits].sort((a, b) => b - a)) {
      if (next[pos] !== " ") continue;
      next = `${next.slice(0, pos)}{" "}${next.slice(pos + 1)}`;
    }
    fs.writeFileSync(file, next);
  }
}

console.log(`${total} spot${total === 1 ? "" : "s"}${WRITE ? " fixed" : " found"}.`);
if (!WRITE && total > 0) process.exit(1);
