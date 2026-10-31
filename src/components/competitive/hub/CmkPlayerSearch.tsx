"use client";

/**
 * One search for players on the competitive Mario Kart hub (picks 2026-10-30, 2A): lounge players
 * (MKCentral, all three games) and time trial players in two groups. A lounge player opens their
 * lounge page, a time trial player their times. Enter with nothing picked looks the name up on the
 * lounge (/lounge/find), like the lounge page's own search.
 *
 * Like LoungeLookup, the list is our own listbox on a CDS Input (CDS Combobox can't show grouped rich
 * rows or async results: a CDS gap). ARIA combobox pattern: the input owns the list, arrows move
 * through both groups, Enter opens, Escape closes, a status line reads the counts.
 */

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, Input } from "@empac/cascadeds";
import { IconBrandDiscord, IconSearch } from "@tabler/icons-react";
import { PlayerRowBody } from "@/components/lounge/PlayerRow";
import { parseFriendCode, suggestionHref, type Suggestion } from "@/lib/lounge/lookup";
import { playerPagePath } from "@/lib/timeTrials/playerPath";
import { EVENTS, track } from "@/lib/analytics/events";

type TtFound = { player: string; name: string; avatar: string | null; profile: string | null; discord: boolean };
type Option = { kind: "lounge"; s: Suggestion; href: string } | { kind: "tt"; p: TtFound; href: string };

export function CmkPlayerSearch() {
  const id = useId();
  const inputId = `${id}-q`, helpId = `${id}-help`, listId = `${id}-list`;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lounge, setLounge] = useState<Suggestion[]>([]);
  const [tt, setTt] = useState<TtFound[]>([]);
  const [answeredFor, setAnsweredFor] = useState("");
  const [loungeDown, setLoungeDown] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const text = q.trim();
  const fc = parseFriendCode(text);
  const tooShort = !fc && text.length < 2;

  useEffect(() => {
    if (tooShort) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const [l, p] = await Promise.all([
        fetch(`/api/lounge/suggest?q=${encodeURIComponent(text)}&game=all`, { signal: ctrl.signal }).then((r) => r.json()).catch(() => null) as Promise<{ ok?: boolean; results?: Suggestion[] } | null>,
        fc ? Promise.resolve(null) : fetch(`/api/time-trials?q=${encodeURIComponent(text)}`, { signal: ctrl.signal }).then((r) => r.json()).catch(() => null) as Promise<{ players?: TtFound[] } | null>,
      ]);
      if (ctrl.signal.aborted) return;
      setLoungeDown(!l?.ok);
      setLounge((l?.ok && l.results) || []);
      setTt((p?.players ?? []).slice(0, 4));
      setAnsweredFor(text);
      setActive(-1);
    }, fc ? 0 : 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [text, fc, tooShort]);

  const answered = !tooShort && answeredFor === text;
  const options: Option[] = answered ? [
    ...lounge.map((s) => ({ kind: "lounge" as const, s, href: suggestionHref(s) })),
    ...tt.map((p) => ({ kind: "tt" as const, p, href: playerPagePath(p.player, p.profile) })),
  ] : [];
  const panel = open && answered;
  const listOpen = panel && options.length > 0;

  const go = (o: Option) => {
    track(EVENTS.cmkSearchUsed, { kind: o.kind });
    setOpen(false);
    router.push(o.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!options.length) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % options.length : a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (listOpen && active >= 0 && options[active]) { e.preventDefault(); go(options[active]); }
    } else if (e.key === "Escape") {
      if (panel) { e.preventDefault(); setOpen(false); setActive(-1); }
      else if (q) { e.preventDefault(); setQ(""); }
    }
  };

  const announce = !panel ? ""
    : options.length ? `${lounge.length} lounge ${lounge.length === 1 ? "player" : "players"} and ${tt.length} time trial ${tt.length === 1 ? "player" : "players"} found. Use the up and down arrows to choose one.`
      : loungeDown ? "The lounge isn't answering right now, and no time trial player has that name."
        : `Nobody found for ${text}.`;

  let n = -1;
  const row = (o: Option) => {
    n += 1;
    const i = n;
    return (
      <li
        key={o.kind === "lounge" ? `l-${o.s.name}-${o.s.primary.game}` : `t-${o.p.player}`}
        id={`${listId}-${i}`}
        role="option"
        aria-selected={i === active}
        className={`lounge-prow lounge-prow--option${i === active ? " lounge-prow--active" : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => { if (active !== i) setActive(i); }}
        onClick={() => go(o)}
      >
        {o.kind === "lounge" ? <PlayerRowBody s={o.s} /> : (
          <>
            <span className="lounge-prow__emblem" aria-hidden="true"><Avatar size="small" src={o.p.avatar ?? undefined} initials={o.p.name.slice(0, 1).toUpperCase()} alt="" /></span>
            <span className="lounge-prow__main">
              <span className="lounge-prow__name"><b>{o.p.name}</b></span>
              <span className="lounge-prow__meta">{o.p.discord ? <><IconBrandDiscord size={14} aria-hidden="true" /> Plays from Discord</> : "Time trial times"}</span>
            </span>
          </>
        )}
      </li>
    );
  };

  return (
    <div className="lounge-lookup lounge-lookup--dark cmk-search">
      <form action="/lounge/find" method="get" role="search" aria-label="Players" className="lounge-lookup__form" onSubmit={() => track(EVENTS.cmkSearchUsed, { kind: "enter" })}>
        <label htmlFor={inputId} className="lounge-lookup__label">Find a player</label>
        <div className="lounge-lookup__row">
          <Input
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
          <Button type="submit" variant="primary" size="large">Look up</Button>
        </div>
        <p id={helpId} className="lounge-lookup__help">A lounge name, a friend code or a GameShuffle name. Searches the lounge and the time trial boards.</p>
      </form>
      <div role="status" className="sr-only">{announce}</div>
      {panel && (
        <div className="lounge-lookup__panel">
          {listOpen ? (
            <div id={listId} role="listbox" aria-label="Players found" className="cmk-search__list">
              {lounge.length > 0 && (
                <ul role="group" aria-labelledby={`${listId}-g1`} className="lounge-lookup__list">
                  <li role="presentation" id={`${listId}-g1`} className="cmk-search__group">Lounge players</li>
                  {options.filter((o) => o.kind === "lounge").map(row)}
                </ul>
              )}
              {tt.length > 0 && (
                <ul role="group" aria-labelledby={`${listId}-g2`} className="lounge-lookup__list">
                  <li role="presentation" id={`${listId}-g2`} className="cmk-search__group">Time trials</li>
                  {options.filter((o) => o.kind === "tt").map(row)}
                </ul>
              )}
            </div>
          ) : (
            <p className="lounge-lookup__none" aria-hidden="true">
              {loungeDown ? "The lounge isn't answering right now, and no time trial player has that name. Press Enter to try the lounge anyway." : <>Nobody found for &ldquo;{text}&rdquo;. Check the spelling.</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
