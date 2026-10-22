"use client";

/**
 * The lounge lookup (lookup picks, 2026-10-21, all as recommended): one labeled search for any
 * lounge player. After two letters it suggests players from all three games at once (or the game
 * picked under it), best MMR first; a friend code finds the player who has it. Picking a suggestion
 * opens their page in their game; Enter with nothing picked keeps the old behavior (/lounge/find).
 * Under it: the players looked up lately on this device and the compare form.
 *
 * The suggestion list is our own listbox on a CDS Input: CDS Combobox only takes plain value/label
 * options (no rich rows, no loading or async results), so it can't show these rows. Flagged as a
 * CDS gap. It follows the ARIA combobox pattern: the input owns the list (aria-controls,
 * aria-activedescendant), arrows move, Enter opens, Escape closes, and a status line reads the count.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Chip, Input } from "@empac/cascadeds";
import { IconSearch } from "@tabler/icons-react";
import { MmrEmblem } from "@/components/mmr/MmrEmblem";
import { PlayerRowBody } from "@/components/lounge/PlayerRow";
import { LoungeCompare } from "@/components/lounge/LoungeCompare";
import { parseRecent, rememberLookup, useRecentRaw } from "@/components/lounge/LoungeRecent";
import { divisionLook } from "@/lib/mmr/look";
import { MMR_GAMES, MMR_GAME_IDS, type MmrGame } from "@/lib/mmr/rules";
import { normName, parseFriendCode, suggestionHref, type Suggestion } from "@/lib/lounge/lookup";
import { EVENTS, track } from "@/lib/analytics/events";

type Scope = "all" | MmrGame;
type Status = "idle" | "loading" | "done" | "error" | "slow";
const SCOPES: { id: Scope; label: string }[] = [{ id: "all", label: "All games" }, ...MMR_GAME_IDS.map((g) => ({ id: g as Scope, label: MMR_GAMES[g].short }))];
const recentHref = (name: string, game: MmrGame) => `/lounge/${encodeURIComponent(name)}${game === "mkworld12p" ? "" : `?game=${game}`}`;

export function LoungeLookup({ tone = "dark", initial = "", compareGame = "mkworld12p" }: {
  /** On the dark header band (/lounge) or on the page (a name nobody has). */
  tone?: "dark" | "light";
  initial?: string;
  /** The game the compare form starts on. */
  compareGame?: MmrGame;
}) {
  const id = useId();
  const inputId = `${id}-q`, helpId = `${id}-help`, listId = `${id}-list`, scopeId = `${id}-scope`;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  const [scope, setScope] = useState<Scope>("all");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const recentRaw = useRecentRaw();
  const recent = useMemo(() => parseRecent(recentRaw), [recentRaw]);

  const text = q.trim();
  const fc = parseFriendCode(text);
  const tooShort = !fc && text.length < 2;

  useEffect(() => {
    if (tooShort) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/lounge/suggest?q=${encodeURIComponent(text)}&game=${scope}`, { signal: ctrl.signal });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; results?: Suggestion[] };
        if (ctrl.signal.aborted) return;
        if (!j.ok) { setResults([]); setStatus(j.reason === "slow_down" ? "slow" : "error"); }
        else { setResults(j.results ?? []); setStatus("done"); }
        setResultsFor(`${scope}:${text}`);
        setActive(-1);
      } catch {
        if (!ctrl.signal.aborted) setStatus("error");
      }
    }, fc ? 0 : 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [text, scope, fc, tooShort]);

  const shown = tooShort ? [] : results;
  const answered = !tooShort && resultsFor === `${scope}:${text}` && status !== "loading";
  const panel = open && !tooShort && (shown.length > 0 || answered);
  const listOpen = panel && shown.length > 0;
  const exact = shown.find((s) => normName(s.name) === normName(text));

  const go = (s: Suggestion, via: "suggestion" | "enter" | "fc") => {
    track(EVENTS.loungeSearchUsed, { via });
    rememberLookup({ name: s.name, game: s.primary.game, division: s.played ? s.primary.division : null });
    setOpen(false);
    router.push(suggestionHref(s));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!shown.length) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % shown.length : a <= 0 ? shown.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (listOpen && active >= 0 && shown[active]) { e.preventDefault(); go(shown[active], fc ? "fc" : "suggestion"); }
      else if (exact) { e.preventDefault(); go(exact, "enter"); }
      else if (fc && shown[0]) { e.preventDefault(); go(shown[0], "fc"); }
      // Otherwise the form sends the name to /lounge/find, as before.
    } else if (e.key === "Escape") {
      if (panel) { e.preventDefault(); setOpen(false); setActive(-1); }
      else if (q) { e.preventDefault(); setQ(""); }
    }
  };

  const announce = !panel ? ""
    : status === "error" ? "The lounge isn't answering right now. Press Enter to look the name up."
      : status === "slow" ? "Too many searches at once. Wait a moment, or press Enter to look the name up."
        : shown.length ? `${shown.length} ${shown.length === 1 ? "player" : "players"} found. Use the up and down arrows to choose one.`
          : fc ? "Nobody on the lounge has that friend code." : `No lounge player has ${text} in their name.`;

  return (
    <div className={`lounge-lookup lounge-lookup--${tone}`}>
      <form
        action="/lounge/find"
        method="get"
        role="search"
        aria-label="Lounge players"
        className="lounge-lookup__form"
        onSubmit={() => track(EVENTS.loungeSearchUsed, { via: "enter" })}
      >
        <label htmlFor={inputId} className="lounge-lookup__label">Find a player</label>
        <div className="lounge-lookup__row">
          <Input
            ref={inputRef}
            id={inputId}
            name="name"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            iconBefore={IconSearch}
            maxLength={40}
            required
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={listOpen && active >= 0 ? `${listId}-${active}` : undefined}
            aria-describedby={helpId}
            fullWidth
            size="large"
          />
          {scope !== "all" && <input type="hidden" name="game" value={scope} />}
          <Button type="submit" variant="primary" size="large">Look up</Button>
        </div>
        <p id={helpId} className="lounge-lookup__help">A lounge name, part of one, or a friend code</p>

        <div className="lounge-lookup__scope" role="group" aria-labelledby={scopeId}>
          <span id={scopeId} className="lounge-lookup__scope-label">Search in</span>
          {SCOPES.map((s) => (
            <Chip key={s.id} label={s.label} clickable selected={scope === s.id} size="small" onClick={() => setScope(s.id)} className="lounge-lookup__chip" />
          ))}
        </div>
      </form>

      <div role="status" className="sr-only">{announce}</div>
      {panel && (
        <div className="lounge-lookup__panel">
          {listOpen ? (
            <ul id={listId} role="listbox" aria-label={fc ? "Player with this friend code" : "Players found"} className="lounge-lookup__list">
              {shown.map((s, i) => (
                <li
                  key={`${s.name}-${s.primary.game}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`lounge-prow lounge-prow--option${i === active ? " lounge-prow--active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => { if (active !== i) setActive(i); }}
                  onClick={() => go(s, fc ? "fc" : "suggestion")}
                >
                  <PlayerRowBody s={s} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="lounge-lookup__none" aria-hidden="true">
              {status === "error" ? "The lounge isn't answering right now. Press Enter to look the name up."
                : status === "slow" ? "Too many searches at once. Wait a moment, or press Enter to look the name up."
                  : fc ? "Nobody on the lounge has that friend code."
                    : <>No lounge player has &ldquo;{text}&rdquo; in their name. Check the spelling, or try another game.</>}
            </p>
          )}
        </div>
      )}

      {(recent.length > 0 || tone === "dark") && (
        <div className="lounge-lookup__more">
          {recent.length > 0 && (
            <div className="lounge-recent">
              <span className="lounge-recent__label" id={`${id}-recent`}>Looked up lately</span>
              <ul className="lounge-recent__list" aria-labelledby={`${id}-recent`}>
                {recent.map((r) => (
                  <li key={`${r.name}-${r.game}`}>
                    <Link href={recentHref(r.name, r.game)} className="lounge-recent__link" onClick={() => track(EVENTS.loungeSearchUsed, { via: "recent" })}>
                      <Chip
                        label={r.name}
                        size="small"
                        variant="outline"
                        className="lounge-recent__chip"
                        icon={<span className="lounge-recent__emblem" aria-hidden="true"><MmrEmblem d={divisionLook(r.division ?? "Placement")} frame="tile" /></span>}
                      />
                      {r.game !== "mkworld12p" && <span className="sr-only"> in {MMR_GAMES[r.game].short}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tone === "dark" && <LoungeCompare from="lounge" trigger="link" game={compareGame} />}
        </div>
      )}
    </div>
  );
}
