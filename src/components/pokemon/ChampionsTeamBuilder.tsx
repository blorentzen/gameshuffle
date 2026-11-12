"use client";

/**
 * The Pokémon Champions team builder (game space picks 2026-11-11, all as recommended): pick six from this season's
 * list with a search and a type filter, see what's legal (on the list, no species twice) and the team's weaknesses
 * and resistances by type, fill the rest at random, and copy a link that rebuilds the team. Type cards only, with a
 * showcase TCG card's art where one is populated (the Pokémon imagery rule). Rules in src/lib/pokemon/champions.ts.
 *
 * Two uses: the page (`mode="page"`, reads and copies ?team= links, the full type table) and a tournament team list
 * (`mode="pick"`, inside a window: the team, the weak spots and the list, then "Use this team").
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCheck, IconLink, IconPlus, IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { TableScroll } from "@/components/ui/TableScroll";
import { IconAction } from "@/components/actions/IconAction";
import { PokeBall } from "@/components/pokemon/PokeBall";
import { TypeCard, TypeTile, type ShowcaseArt } from "@/components/pokemon/TypeCard";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  CHAMPIONS_ROSTER, CHAMPIONS_SEASON, DEFAULT_FILL, TEAM_PARAM, TEAM_SIZE, TYPES,
  blockedBy, coverScore, fillTeam, formOf, nameFromId, problemText, readTeamParam, rerollSlot, teamParam, teamProblems, typeLines, weakSpots,
  type ChampMon, type FillOptions, type TypeLine,
} from "@/lib/pokemon/champions";
import "@/styles/champions.css";

const empty = (): (ChampMon | null)[] => Array.from({ length: TEAM_SIZE }, () => null);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const num = (dex: number) => `#${String(dex).padStart(4, "0")}`;

/** "Raichu, Garchomp ×4 and Incineroar" for a table cell. */
function names(list: string[], double: string[] = []): string {
  const shown = list.map((n) => (double.includes(n) ? `${n} ×4` : n));
  return shown.length <= 2 ? shown.join(" and ") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** "hits Incineroar and Raichu (Alolan) hard, and nobody resists it." after the type's name. */
function spotLine(l: TypeLine): string {
  const takers = [...l.resist, ...l.immune];
  return `hits ${names(l.weak, l.double)} hard, ${takers.length ? `and only ${names(takers)} ${takers.length === 1 ? "resists" : "resist"} it` : "and nobody resists it"}.`;
}

export function ChampionsTeamBuilder({ art = {}, mode = "page", initial, onUse, useLabel = "Use this team", busy = false }: {
  art?: Record<number, ShowcaseArt>;
  mode?: "page" | "pick";
  /** Team ids to start from (a team list being swapped). */
  initial?: string[];
  /** Pick mode: what "Use this team" does. */
  onUse?: (team: ChampMon[]) => void;
  useLabel?: string;
  busy?: boolean;
}) {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [slots, setSlots] = useState<(ChampMon | null)[]>(() => {
    if (!initial?.length) return empty();
    const { team } = readTeamParam(initial.join("."));
    return Array.from({ length: TEAM_SIZE }, (_, i) => team[i] ?? null);
  });
  const [fill, setFill] = useState<FillOptions>(DEFAULT_FILL);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [coverOnly, setCoverOnly] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const completed = useRef(false);
  const lastVia = useRef<"pick" | "fill" | "link">("pick");

  // A shared link (?team=…) rebuilds the team, in order; ids no longer on the list are said, not added.
  useEffect(() => {
    if (mode !== "page") return;
    const value = searchParams.get(TEAM_PARAM);
    if (!value) return;
    const { team, unknown } = readTeamParam(value);
    lastVia.current = "link";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address
    setSlots(Array.from({ length: TEAM_SIZE }, (_, i) => team[i] ?? null));
    if (unknown.length) setNote(`${unknown.map(nameFromId).join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} on the ${CHAMPIONS_SEASON.name} list, so the link left ${unknown.length === 1 ? "it" : "them"} out.`);
  }, [mode, searchParams]);

  const team = useMemo(() => slots.filter((m): m is ChampMon => !!m), [slots]);
  const lines = useMemo(() => typeLines(team), [team]);
  const spots = useMemo(() => weakSpots(lines), [lines]);
  const problems = useMemo(() => teamProblems(team), [team]);
  const legal = team.length > 0 && problems.length === 0;

  // Six legal Pokémon, once a visit.
  useEffect(() => {
    if (completed.current || team.length < TEAM_SIZE || problems.length) return;
    completed.current = true;
    track(EVENTS.championsTeamCompleted, { via: lastVia.current });
  }, [team.length, problems.length]);

  const list = useMemo(() => {
    const q = fold(query);
    return CHAMPIONS_ROSTER.filter((m) =>
      (!q || fold(m.name).includes(q) || String(m.dex) === q.replace(/^0+/, ""))
      && (!type || m.types.includes(type))
      && (!coverOnly || coverScore(m, team) > 0));
  }, [query, type, coverOnly, team]);

  // From the current slots, so two quick taps add two Pokémon.
  const add = (m: ChampMon) => {
    lastVia.current = "pick";
    setSlots((cur) => {
      const i = cur.findIndex((x) => !x);
      if (i < 0 || blockedBy(m, cur)) return cur;
      const next = [...cur];
      next[i] = m;
      return next;
    });
    setNote(null);
  };
  const remove = (i: number) => { setSlots((cur) => cur.map((x, j) => (j === i ? null : x))); setNote(null); };
  const reroll = (i: number) => {
    const m = rerollSlot(slots, i, fill);
    if (!m) { setNote("No other Pokémon fit this slot with these options."); return; }
    const next = [...slots];
    next[i] = m;
    lastVia.current = "fill";
    setSlots(next);
  };
  const fillRest = () => {
    const before = team.length;
    const next = fillTeam(slots, fill);
    const added = next.filter(Boolean).length - before;
    lastVia.current = "fill";
    setSlots(next);
    setNote(added + before < TEAM_SIZE ? `Only ${added} more fit without repeating a type. Switch off no repeated types for a full team.` : null);
    track(EVENTS.championsTeamFilled, { added, cover: fill.cover ? "on" : "off" });
  };
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${TEAM_PARAM}=${teamParam(slots)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied. It opens this same team for anyone you send it to.");
      track(EVENTS.championsTeamLinkCopied, { size: team.length });
    } catch { toast.error("Couldn't copy the link. Try again."); }
  };

  const full = team.length >= TEAM_SIZE;
  const statusText = !team.length
    ? `Pick up to six from the ${CHAMPIONS_ROSTER.length} Pokémon in ${CHAMPIONS_SEASON.name}.`
    : legal
      ? `Legal for ${CHAMPIONS_SEASON.name}: ${team.length} of 6, no species twice.${team.length < 4 ? " An event needs at least four." : ""}`
      : problems.map(problemText).join(" ");

  return (
    <div className={`champ-builder champ-builder--${mode}`}>
      <section className="champ-team" aria-labelledby={`champ-team-${mode}`}>
        <div className="champ-head">
          <h2 id={`champ-team-${mode}`}>Your team</h2>
          <span className="champ-count">{team.length} of {TEAM_SIZE}</span>
        </div>
        <ul className="champ-slots" aria-label="Your six">
          {slots.map((m, i) => (
            <li key={i} className="champ-slot">
              {m ? (
                <>
                  <TypeCard dex={m.dex} name={m.name} types={m.types} art={formOf(m) ? undefined : art[m.dex]} />
                  <span className="champ-slot__acts">
                    <IconAction label={`New Pokémon instead of ${m.name}`} icon={IconRefresh} variant="secondary" onClick={() => reroll(i)} />
                    <IconAction label={`Remove ${m.name}`} icon={IconX} variant="secondary" onClick={() => remove(i)} />
                  </span>
                </>
              ) : (
                <span className="pokeball-slot champ-slot__empty">
                  <span className="pokeball-slot__tile"><PokeBall className="pokeball-slot__ball" /></span>
                  <span className="pokeball-slot__name">Slot {i + 1}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className={`champ-status${!team.length ? " champ-status--empty" : !legal ? " champ-status--bad" : ""}`} role="status">
          {legal && <IconCheck size={18} stroke={2} aria-hidden />} {statusText}
        </p>
        {note && <p className="champ-note">{note}</p>}
        <div className="champ-actions">
          {mode === "pick" && onUse && (
            <Button variant="primary" onClick={() => onUse(team)} disabled={busy || !legal || team.length < 4} loading={busy}>{useLabel}</Button>
          )}
          <Button variant={mode === "page" ? "primary" : "secondary"} onClick={fillRest} disabled={full}>{team.length ? "Fill the rest at random" : "Roll a team"}</Button>
          {mode === "page" && team.length > 0 && <Button variant="secondary" iconBefore={IconLink} onClick={() => void copyLink()}>Copy link</Button>}
          {team.length > 0 && <Button variant="ghost" onClick={() => { setSlots(empty()); setNote(null); }}>Clear</Button>}
        </div>
        <div className="champ-switches">
          <Switch label="Cover weak spots" checked={fill.cover} onChange={(e) => setFill((o) => ({ ...o, cover: e.target.checked }))} />
          <Switch label="No repeated types" checked={fill.noRepeatTypes} onChange={(e) => setFill((o) => ({ ...o, noRepeatTypes: e.target.checked }))} />
        </div>
      </section>

      <section className="champ-weak" aria-labelledby={`champ-weak-${mode}`}>
        <h2 id={`champ-weak-${mode}`}>Weak spots</h2>
        {!team.length ? (
          <p className="champ-muted">Add a Pokémon and the types your team struggles with show here.</p>
        ) : spots.length ? (
          <ul className="champ-spots">
            {spots.slice(0, 4).map((l) => (
              <li key={l.type}>
                <TypeTile types={[l.type]} size="small" />
                <span><b>{l.type}</b> {spotLine(l)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="champ-muted">No weak spots: no type hits two or more of your team hard without someone to take it.</p>
        )}
      </section>

      <section className="champ-pick" aria-labelledby={`champ-pick-${mode}`}>
        <div className="champ-head">
          <h2 id={`champ-pick-${mode}`}>Add Pokémon</h2>
          <span className="champ-count">{list.length} shown</span>
        </div>
        <div className="champ-filters">
          <Input floatingLabel="Search by name or number" iconBefore={IconSearch} value={query} onChange={(e) => setQuery(e.target.value)} fullWidth />
          <Select floatingLabel="Type" value={type ?? ""} onChange={(v) => setType(v ? String(v) : null)}
            options={[{ value: "", label: "Any type" }, ...TYPES.map((t) => ({ value: t, label: t }))]} />
        </div>
        {spots.length > 0 && !full && (
          <Switch label="Only ones that cover a weak spot" checked={coverOnly} onChange={(e) => setCoverOnly(e.target.checked)} />
        )}
        {full && <p className="champ-muted">Your team is full. Remove one to add another.</p>}
        {list.length ? (
          // The list scrolls in its frame; the frame takes focus so it scrolls by keyboard even when every Add is off.
          <div className="champ-list" role="region" aria-label={`${CHAMPIONS_SEASON.name} Pokémon`} tabIndex={0}>
          <ul className="champ-list__items">
            {list.map((m) => {
              const why = blockedBy(m, slots);
              return (
                <li key={m.id} className={`champ-row${why ? " champ-row--off" : ""}`}>
                  <TypeTile types={m.types} />
                  <span className="champ-row__who">
                    <b>{m.name}</b>
                    <span className="champ-row__line">{num(m.dex)} · {m.types.join(" / ")}{why && why !== "Team is full" ? ` · ${why}` : ""}</span>
                  </span>
                  <Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => add(m)} disabled={!!why} aria-label={`Add ${m.name}`}>Add</Button>
                </li>
              );
            })}
          </ul>
          </div>
        ) : (
          <p className="champ-muted">Nothing on this season&apos;s list matches. Try another name or type.</p>
        )}
      </section>

      {mode === "page" && team.length > 0 && (
        <section className="champ-types" aria-labelledby="champ-types-page">
          <h2 id="champ-types-page">Every type against your team</h2>
          <p className="champ-muted">By type only: abilities such as Levitate, held items and Mega Evolution can change these.</p>
          <TableScroll label="Damage from each type">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Attack type</TableHead>
                  <TableHead>Weak</TableHead>
                  <TableHead>Resist</TableHead>
                  <TableHead>Immune</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.type} className={spots.includes(l) ? "champ-types__row--spot" : undefined}>
                    <TableCell><span className="champ-types__type"><TypeTile types={[l.type]} size="small" />{l.type}</span></TableCell>
                    <TableCell>{l.weak.length ? <><b>{l.weak.length}</b> <span className="champ-types__names">{names(l.weak, l.double)}</span></> : <span className="champ-muted">0</span>}</TableCell>
                    <TableCell>{l.resist.length ? <><b>{l.resist.length}</b> <span className="champ-types__names">{names(l.resist)}</span></> : <span className="champ-muted">0</span>}</TableCell>
                    <TableCell>{l.immune.length ? <><b>{l.immune.length}</b> <span className="champ-types__names">{names(l.immune)}</span></> : <span className="champ-muted">0</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </section>
      )}
    </div>
  );
}

/** A team as a short list (type tile, name, types): tournament team lists, the organizer's table. */
export function ChampionsTeamList({ members, label }: { members: { id: string; name: string; dex: number; types: string[]; onList: boolean }[]; label: string }) {
  return (
    <ul className="champ-teamlist" aria-label={label}>
      {members.map((m) => (
        <li key={m.id} className={m.onList ? undefined : "champ-teamlist__off"}>
          <TypeTile types={m.types.length ? m.types : ["Normal"]} />
          <span className="champ-teamlist__who"><b>{m.name}</b><span className="champ-row__line">{m.types.length ? m.types.join(" / ") : "Not on this season's list"}</span></span>
        </li>
      ))}
    </ul>
  );
}
