
/**
 * Custom-CSS sanitizer for profile skins (Level 3 customization).
 *
 * THREAT MODEL + DEFENSES (see scripts/test-custom-css.ts for the proof suite):
 *  1. Layout escape / clickjacking — every selector is SCOPED under
 *     `.u-custom`; html/body/:root are rewritten to the scope; `position: fixed`
 *     and `position: sticky` are dropped; the scope container is `position:
 *     relative; isolation: isolate` so absolutely-positioned children can't sit
 *     over the site chrome, and z-index can't escape the stacking context.
 *  2. External resource loads / CSS exfiltration — any declaration whose value
 *     contains `url(...)` pointing anywhere but our own R2 origin (or a same-doc
 *     `#fragment`) is dropped. No tracking pixels, no attribute-selector leaks.
 *  3. Legacy script-in-CSS — `@import`/`@charset`/`@namespace`/`@font-face` are
 *     removed; values containing `expression(`, `javascript:`, `-moz-binding`,
 *     or `behavior` are dropped; properties are allowlisted (default deny).
 *
 * We NEVER accept HTML/JS — only presentation. Parsing is done with postcss
 * (real AST). Runs on write AND read; a stored blob is re-sanitized every time.
 */

import postcss, { type Declaration, type Rule, type AtRule } from "postcss";

/** The class the profile content is wrapped in; every selector is scoped to it. */
export const CUSTOM_CSS_SCOPE = "u-custom";
/** Hard cap so a huge blob can't blow up parse time / storage. */
export const MAX_CUSTOM_CSS = 12_000;

/** Our own R2 UGC origins — prod + dev (same Cloudflare zone). The only hosts a
 *  `url()` may reference. Static so the pure sanitizer + its tests need no env. */
const UGC_HOSTS = new Set(["gs-ugc.empac.co", "gs-ugc-dev.empac.co"]);
const UGC_PRIMARY_HOST = "gs-ugc.empac.co";
const ALLOWED_ATRULES = new Set(["media", "supports", "keyframes"]);

// Curated property allowlist (exact names + prefixes). Default deny.
const ALLOWED_PROPS = new Set([
  "color", "background", "opacity", "filter", "backdrop-filter", "box-shadow",
  "border", "border-radius", "outline", "outline-offset",
  "margin", "padding", "gap", "row-gap", "column-gap",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "top", "left", "right", "bottom", "inset",
  "display", "visibility", "overflow", "overflow-x", "overflow-y",
  "flex", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "align-items", "align-content", "align-self", "justify-content", "justify-items", "justify-self",
  "grid", "gap", "aspect-ratio", "object-fit", "object-position",
  "font", "line-height", "letter-spacing", "word-spacing", "text-align",
  "text-decoration", "text-transform", "text-shadow", "text-overflow", "white-space",
  "list-style", "cursor", "transform", "transform-origin", "transition",
  "animation", "animation-name", "animation-duration", "animation-timing-function",
  "animation-delay", "animation-iteration-count", "animation-direction", "animation-fill-mode",
  "z-index", "content", "position",
]);
const ALLOWED_PREFIXES = [
  "background-", "border-", "margin-", "padding-", "font-", "text-", "flex-",
  "grid-", "animation-", "transition-", "transform-", "outline-", "box-",
  "list-", "overflow-", "align-", "justify-", "place-", "text-decoration-",
];

const BAD_VALUE = /(expression\s*\(|javascript:|-moz-binding|behavior\s*:|vbscript:)/i;
const URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

function propAllowed(prop: string): boolean {
  const p = prop.toLowerCase().trim();
  if (p.startsWith("--")) return true; // custom props are inert data
  if (ALLOWED_PROPS.has(p)) return true;
  return ALLOWED_PREFIXES.some((pre) => p.startsWith(pre));
}

/** True if every url() in the value is our R2 origin or a same-doc fragment. */
function urlsSafe(value: string): boolean {
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(value))) {
    const raw = (m[2] || "").trim();
    if (!raw) return false;
    if (raw.startsWith("#")) continue; // same-document reference (e.g. SVG filter)
    try {
      const u = new URL(raw, `https://${UGC_PRIMARY_HOST}`);
      if (!(u.protocol === "https:" && UGC_HOSTS.has(u.hostname))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function declOk(decl: Declaration): boolean {
  if (!propAllowed(decl.prop)) return false;
  const value = decl.value || "";
  if (BAD_VALUE.test(value)) return false;
  if (value.includes("url(") && !urlsSafe(value)) return false;
  // position: fixed/sticky can overlay the whole viewport — drop them.
  if (decl.prop.toLowerCase() === "position" && /\b(fixed|sticky)\b/i.test(value)) return false;
  return true;
}

/** Split a selector list on TOP-LEVEL commas (ignoring commas inside parens). */
function splitSelectorList(sel: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "," && depth === 0) { out.push(sel.slice(start, i)); start = i + 1; }
  }
  out.push(sel.slice(start));
  return out;
}

const SCOPE_SEL = `.${CUSTOM_CSS_SCOPE}`;

function scopeSelector(sel: string): string {
  return splitSelectorList(sel)
    .map((partRaw) => {
      let part = partRaw.trim();
      if (!part) return "";
      // Rewrite any attempt to target the document root to the scope itself.
      part = part.replace(/^\s*(html|body|:root)\b\s*/i, "");
      if (!part) return SCOPE_SEL;
      // Already scoped? leave it.
      if (part.startsWith(SCOPE_SEL)) return part;
      return `${SCOPE_SEL} ${part}`;
    })
    .filter(Boolean)
    .join(", ");
}

export interface SanitizeResult { css: string; warnings: string[] }

export function sanitizeCustomCss(input: unknown): SanitizeResult {
  const warnings: string[] = [];
  if (typeof input !== "string" || !input.trim()) return { css: "", warnings };
  const src = input.slice(0, MAX_CUSTOM_CSS);
  if (input.length > MAX_CUSTOM_CSS) warnings.push(`CSS was truncated to ${MAX_CUSTOM_CSS} characters.`);

  let root: postcss.Root;
  try {
    root = postcss.parse(src);
  } catch {
    return { css: "", warnings: ["Couldn't parse that CSS — nothing was saved."] };
  }

  const walkContainer = (container: postcss.Container, inKeyframes: boolean) => {
    for (const node of [...container.nodes]) {
      if (node.type === "atrule") {
        const at = node as AtRule;
        const name = at.name.toLowerCase();
        if (!ALLOWED_ATRULES.has(name)) {
          if (name === "import" || name === "charset" || name === "namespace" || name === "font-face") {
            warnings.push(`Removed @${name} (not allowed).`);
          }
          at.remove();
          continue;
        }
        walkContainer(at, name === "keyframes");
      } else if (node.type === "rule") {
        const rule = node as Rule;
        if (!inKeyframes) rule.selector = scopeSelector(rule.selector);
        // Prune declarations.
        for (const d of [...rule.nodes]) {
          if (d.type === "decl") {
            if (!declOk(d as Declaration)) { (d as Declaration).remove(); }
          } else if (d.type === "atrule" || d.type === "rule") {
            walkContainer(d as postcss.Container, inKeyframes);
          }
        }
        if (rule.nodes.length === 0) rule.remove();
      } else if (node.type === "decl") {
        if (!declOk(node as Declaration)) (node as Declaration).remove();
      }
    }
  };

  walkContainer(root, false);
  return { css: root.toString(), warnings };
}
