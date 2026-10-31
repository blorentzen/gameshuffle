"use client";

/**
 * Trivia team name generator: pick themes, get six names at a time, copy one.
 * "Clean for kids" hides the names that joke about drinking. Our own lists
 * (src/data/trivia-team-names.ts), nothing sent anywhere.
 */

import { useMemo, useRef, useState } from "react";
import { Button, Chip, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { TEAM_NAMES, TEAM_NAME_THEMES, type TeamNameTheme } from "@/data/trivia-team-names";

const SHOWN = 6;

/** A fixed shuffle so the first render matches the server; "More names" reshuffles. */
function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function TeamNameGenerator() {
  const toast = useToast();
  const [themes, setThemes] = useState<TeamNameTheme[]>(["gaming", "funny"]);
  const [clean, setClean] = useState(false);
  const [seed, setSeed] = useState(7);
  const [page, setPage] = useState(0);
  const used = useRef(false);

  const pool = useMemo(() => {
    const names = themes.flatMap((t) => TEAM_NAMES[t]).filter((n) => !clean || !n.adult).map((n) => n.name);
    return shuffled([...new Set(names)], seed);
  }, [themes, clean, seed]);
  const pages = Math.max(1, Math.ceil(pool.length / SHOWN));
  const shown = pool.slice((page % pages) * SHOWN, (page % pages) * SHOWN + SHOWN);

  const note = () => { if (!used.current) { used.current = true; track(EVENTS.toolUsed, { tool: "trivia-team-names" }); } };
  const toggle = (t: TeamNameTheme) => {
    setThemes((cur) => (cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t]));
    setPage(0);
  };
  const more = () => {
    note();
    if (page + 1 >= pages) { setSeed((s) => (s * 48271) % 2147483647); setPage(0); } else setPage((p) => p + 1);
  };
  const copy = async (name: string) => {
    note();
    try { await navigator.clipboard.writeText(name); toast.success(`Copied "${name}"`); }
    catch { toast.error("Couldn't copy that. Long-press the name to copy it."); }
  };

  return (
    <div className="team-names">
      <div className="team-names__controls">
        <div className="team-names__themes" role="group" aria-label="Themes">
          {TEAM_NAME_THEMES.map((t) => (
            <Chip key={t.id} label={t.label} clickable selected={themes.includes(t.id)} onClick={() => toggle(t.id)} />
          ))}
        </div>
        <Switch checked={clean} onChange={(e) => { setClean(e.target.checked); setPage(0); }} label="Clean for kids" />
      </div>

      <ul className="team-names__list" aria-live="polite">
        {shown.map((name) => (
          <li key={name} className="team-names__item">
            <span className="team-names__name">{name}</span>
            <Button variant="ghost" size="small" onClick={() => void copy(name)} aria-label={`Copy ${name}`}>Copy</Button>
          </li>
        ))}
      </ul>

      <div className="team-names__more">
        <Button variant="primary" onClick={more}>More names</Button>
        <span className="team-names__count">{pool.length} names in these themes</span>
      </div>
    </div>
  );
}
