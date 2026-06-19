"use client";

/**
 * VariableAutocomplete — Textarea wrapper with inline `{name}`
 * autocomplete.
 *
 * Drops in anywhere a flavor template / response template is
 * edited. Detects the moment the caret is inside an unclosed
 * `{...}` token, pops a filtered list of catalog variables below
 * the textarea, and inserts `{name}` on click / Enter.
 *
 * Source of truth for variables: `/api/flavor-variables` (public
 * read of `gs_flavor_variables`). The catalog is loaded lazily on
 * first focus + cached in module scope for the page lifetime; the
 * actual list is updated under the admin Platform → Variables tab.
 *
 * Keyboard:
 *   - ArrowDown / ArrowUp   — move highlight
 *   - Enter / Tab           — insert highlighted
 *   - Esc                   — dismiss menu
 *   - Typing                — filters by prefix
 *
 * Caret detection uses a tiny scan-backward from selectionStart:
 *   - If we hit `{` before whitespace / `}` / start-of-string, the
 *     caret is inside a token and the text between `{` and the
 *     caret is the prefix query.
 *   - Anything else closes the menu.
 *
 * Drop-in API mirrors CDS Textarea (label-less, value + onChange,
 * placeholder, rows, fullWidth, disabled). Wrap inside a normal
 * `<label className="hub-form__field">` for the label affordance.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Textarea } from "@empac/cascadeds";

export type VariableCategory =
  | "caller"
  | "stream"
  | "profile"
  | "event"
  | "pool";

export interface FlavorVariable {
  name: string;
  description: string;
  example: string;
  category: VariableCategory;
}

/** Map each category to a CDS Badge variant. Using the design
 *  system's semantic intent (`info`, `success`, etc.) keeps the
 *  pills consistent with the rest of the app's chrome and inherits
 *  dark-mode + theme overrides automatically. */
const CATEGORY_BADGE: Record<
  VariableCategory,
  {
    label: string;
    variant: "default" | "success" | "warning" | "error" | "info" | "outline";
  }
> = {
  caller: { label: "Caller", variant: "info" },
  stream: { label: "Stream", variant: "default" },
  profile: { label: "Profile", variant: "success" },
  event: { label: "Event-only", variant: "warning" },
  pool: { label: "Pool-only", variant: "outline" },
};

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  fullWidth?: boolean;
  disabled?: boolean;
  /** Override the default fetch (e.g. for tests). */
  variables?: FlavorVariable[];
  /** Surface for telemetry / a11y label. */
  ariaLabel?: string;
}

// Module-scoped cache — the variable list is global, doesn't change
// between component instances, and is small enough that one fetch
// per page lifetime is overkill anyway. Suspense isn't worth pulling
// in for ~12 rows.
let cachedVariables: FlavorVariable[] | null = null;
let inflightFetch: Promise<FlavorVariable[]> | null = null;

async function loadVariables(): Promise<FlavorVariable[]> {
  if (cachedVariables) return cachedVariables;
  if (inflightFetch) return inflightFetch;
  inflightFetch = (async () => {
    try {
      const res = await fetch("/api/flavor-variables", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        cachedVariables = body.variables as FlavorVariable[];
        return cachedVariables;
      }
    } catch (err) {
      console.error("[VariableAutocomplete] load failed:", err);
    }
    cachedVariables = [];
    return cachedVariables;
  })();
  return inflightFetch;
}

export function VariableAutocomplete({
  value,
  onChange,
  variables: variablesProp,
  placeholder,
  rows = 3,
  fullWidth = true,
  disabled = false,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [allVariables, setAllVariables] = useState<FlavorVariable[] | null>(
    variablesProp ?? null,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  // Position in `value` of the `{` that opened the current token.
  const [bracketStart, setBracketStart] = useState(-1);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (variablesProp) {
      setAllVariables(variablesProp);
      return;
    }
    let cancelled = false;
    void (async () => {
      const vars = await loadVariables();
      if (!cancelled) setAllVariables(vars);
    })();
    return () => {
      cancelled = true;
    };
  }, [variablesProp]);

  const filtered = useMemo(() => {
    if (!allVariables) return [];
    const q = query.toLowerCase();
    if (!q) return allVariables;
    return allVariables.filter((v) => v.name.toLowerCase().startsWith(q));
  }, [allVariables, query]);

  // Keep the highlighted index in bounds when filtered list shrinks.
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  // Track the textarea wrapper rect so we can position the menu in
  // viewport coordinates via a portal — avoids being clipped by any
  // parent's overflow / containing-block (Modal, Card, scroll
  // containers all clipped the inline-absolute version).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    /** When `true`, the menu opens upward (anchor is bottom of the
     *  textarea, menu grows above) because there's not enough room
     *  below the textarea before the viewport edge. */
    above: boolean;
  } | null>(null);

  useEffect(() => {
    if (!menuOpen || filtered.length === 0) {
      setMenuPos(null);
      return;
    }
    const updatePosition = () => {
      const wrap = wrapperRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      // Conservative max-height matches the maxHeight style on the
      // menu (240) so flip logic predicts the rendered footprint.
      const ESTIMATED_HEIGHT = 240;
      const GAP = 4;
      const spaceBelow = window.innerHeight - rect.bottom - GAP;
      const spaceAbove = rect.top - GAP;
      const above =
        spaceBelow < ESTIMATED_HEIGHT && spaceAbove > spaceBelow;
      setMenuPos({
        top: above ? Math.max(GAP, rect.top - GAP) : rect.bottom + GAP,
        left: rect.left,
        width: rect.width,
        above,
      });
    };
    updatePosition();
    // Re-anchor on scroll / resize / typing — the textarea can grow
    // as the user types (auto-sizing) or the user can scroll the
    // page while the menu is open. capture-true catches scroll on
    // any ancestor.
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen, filtered.length, value]);

  /** Re-derive menu state from the current value + cursor position.
   *  Called from onChange + onSelect events on the textarea. */
  const refreshMenuFromCaret = (nextValue: string, caret: number) => {
    // Walk backward from the caret looking for a `{`. If we hit any
    // of: whitespace, `}`, or start-of-string before `{`, the caret
    // isn't inside a token and the menu should close.
    let i = caret - 1;
    while (i >= 0) {
      const ch = nextValue[i];
      if (ch === "{") {
        // Found an opener — confirm it's not already-closed by
        // checking there's no `}` between i and the caret.
        const between = nextValue.slice(i + 1, caret);
        if (!between.includes("}")) {
          setBracketStart(i);
          setQuery(between);
          setMenuOpen(true);
          setHighlight(0);
          return;
        }
        break;
      }
      if (ch === "}" || /\s/.test(ch)) break;
      i -= 1;
    }
    setMenuOpen(false);
    setBracketStart(-1);
    setQuery("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    refreshMenuFromCaret(next, e.target.selectionStart);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    refreshMenuFromCaret(target.value, target.selectionStart);
  };

  const insertVariable = (name: string) => {
    if (bracketStart < 0) return;
    const caret = ref.current?.selectionStart ?? bracketStart + 1;
    const before = value.slice(0, bracketStart);
    const after = value.slice(caret);
    // Build the result. If the existing content already had a
    // closing `}`, we don't want to double up; refreshMenuFromCaret
    // already ensures there's no `}` between bracket and caret.
    const inserted = `{${name}}`;
    const next = `${before}${inserted}${after}`;
    onChange(next);
    setMenuOpen(false);
    // After React re-renders, move the caret to just after the
    // inserted token so the writer can keep typing.
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      const pos = bracketStart + inserted.length;
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
      ta.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!menuOpen || filtered.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlight((h) => (h + 1) % filtered.length);
        return;
      case "ArrowUp":
        e.preventDefault();
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
        return;
      case "Enter":
      case "Tab":
        e.preventDefault();
        insertVariable(filtered[highlight].name);
        return;
      case "Escape":
        e.preventDefault();
        setMenuOpen(false);
        return;
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Defer close so a mousedown on the menu can fire its click
          // first. 150ms is plenty for the click cycle.
          setTimeout(() => setMenuOpen(false), 150);
        }}
        rows={rows}
        placeholder={placeholder}
        fullWidth={fullWidth}
        disabled={disabled}
        aria-label={ariaLabel}
      />

      {menuOpen &&
        filtered.length > 0 &&
        menuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            aria-label="Insert variable"
            style={{
              position: "fixed",
              top: menuPos.above ? undefined : menuPos.top,
              bottom: menuPos.above
                ? window.innerHeight - menuPos.top
                : undefined,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: 240,
              overflowY: "auto",
              padding: "var(--spacing-4)",
              background: "var(--background-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-medium)",
              boxShadow:
                "var(--shadow-elevated, 0 4px 16px rgba(0,0,0,0.12))",
              listStyle: "none",
              margin: 0,
              zIndex: 2000,
            }}
          >
          {filtered.map((v, idx) => {
            const isActive = idx === highlight;
            const badge = CATEGORY_BADGE[v.category] ?? CATEGORY_BADGE.stream;
            return (
              <li
                key={v.name}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  // mousedown + preventDefault keeps the textarea
                  // focused (avoids the blur-close race).
                  e.preventDefault();
                  insertVariable(v.name);
                }}
                onMouseEnter={() => setHighlight(idx)}
                style={{
                  padding: "var(--spacing-6) var(--spacing-12)",
                  borderRadius: "var(--radius-small)",
                  cursor: "pointer",
                  background: isActive
                    ? "var(--bg-secondary)"
                    : "transparent",
                  color: "var(--text-primary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-8)",
                  }}
                >
                  <code style={{ fontSize: "var(--font-size-14)" }}>
                    {`{${v.name}}`}
                  </code>
                  <Badge
                    variant={badge.variant}
                    size="small"
                    aria-label={`Category: ${badge.label}`}
                  >
                    {badge.label}
                  </Badge>
                </span>
                <span
                  style={{
                    fontSize: "var(--font-size-12)",
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {v.description}
                </span>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
