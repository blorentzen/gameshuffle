"use client";

/**
 * The random Pokémon generator (Britton's picks, 2026-10-20): 1, 3 or 6
 * different Pokémon from all 1,025, narrowed by generation and type, with
 * fully evolved only, no Legendaries or Mythicals and no repeated types in
 * the options drawer. Randomizer rules: each card's refresh changes only that
 * card, Roll rolls them all, no copy-as-text, and Copy link rebuilds the same
 * roll for anyone. Type cards with a showcase TCG card where one is populated
 * (the Pokémon imagery rule). Rules in src/lib/pokemon/generator.ts.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Switch, Tabs } from "@empac/cascadeds";
import { IconLink, IconRefresh } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { IconAction } from "@/components/actions/IconAction";
import { PokemonCard } from "@/components/pokemon/PokemonCard";
import { PokemonDetails } from "@/components/pokemon/PokemonDetails";
import { PokemonDisclaimer, type ShowcaseArt } from "@/components/pokemon/TypeCard";
import { PokeBall } from "@/components/pokemon/PokeBall";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  COUNTS, DEFAULT_OPTIONS, GENERATIONS, GEN_REGIONS, TYPES, genPool, linkParams, pokemonByDex, readLink, rerollSlot, rollPokemon, shortfall,
  type GenCount, type GenOptions, type GenPokemon,
} from "@/lib/pokemon/generator";

const nameOf = (dex: number) => pokemonByDex(dex)?.name;
const STAGE_WORDS: Record<GenPokemon["stage"], string> = { Single: "Doesn't evolve", First: "First stage", Middle: "Middle stage", Final: "Fully evolved" };

export function PokemonGenerator({ art = {} }: { art?: Record<number, ShowcaseArt> }) {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [count, setCount] = useState<GenCount>(6);
  const [options, setOptions] = useState<GenOptions>(DEFAULT_OPTIONS);
  const [rolled, setRolled] = useState<(GenPokemon | null)[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [animate, setAnimate] = useState(true);
  // Each slot's roll count re-keys its card so the reel spins on that card only.
  const [rolls, setRolls] = useState<number[]>([]);
  const [open, setOpen] = useState<GenPokemon | null>(null);
  const pool = useMemo(() => genPool(options), [options]);
  const reel = useMemo(() => pool.slice(0, 400), [pool]);

  // A shared link (?p=…) rebuilds the roll and its options.
  useEffect(() => {
    const link = readLink(new URLSearchParams(searchParams.toString()));
    if (!link) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address
    setCount(link.count);
    setOptions(link.options);
    setRolled(link.rolled);
  }, [searchParams]);

  const set = (patch: Partial<GenOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const rollAll = () => {
    const next = rollPokemon(count, options);
    setRolled(next);
    setNote(shortfall(count, next.length, options));
    setRolls(Array.from({ length: count }, (_, i) => (rolls[i] ?? 0) + 1));
    track(EVENTS.pokemonRolled, { count, gen: options.gen ? String(options.gen) : "all", type: options.type ?? "any", slot: "all" });
  };
  const rerollOne = (i: number) => {
    const current = Array.from({ length: count }, (_, j) => rolled[j] ?? null);
    const next = rerollSlot(current, i, options);
    if (!next) { setNote("No other Pokémon fit these options."); return; }
    current[i] = next;
    setRolled(current);
    setRolls((r) => { const n = [...r]; n[i] = (n[i] ?? 0) + 1; return n; });
    track(EVENTS.pokemonRolled, { count, gen: options.gen ? String(options.gen) : "all", type: options.type ?? "any", slot: "one" });
  };
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${linkParams(rolled, count, options).toString()}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied. It rolls these same Pokémon for anyone you send it to."); track(EVENTS.pokemonLinkCopied, { count }); }
    catch { toast.error("Couldn't copy the link. Try again."); }
  };

  const summary = [options.fullyEvolved && "Fully evolved only", options.noLegendary && "No Legendaries or Mythicals", options.noRepeatTypes && "No repeated types"].filter((x): x is string => !!x);
  const hasRoll = rolled.some(Boolean);

  return (
    <div className="pokegen">
      <div className="randomizer-controls">
        <span className="party-muted">{pool.length.toLocaleString("en-US")} Pokémon in the mix</span>
        {hasRoll && <Button variant="secondary" size="small" iconBefore={IconLink} onClick={() => void copyLink()}>Copy link</Button>}
      </div>

      <section>
        <div className="kart-intro">
          <div className="kart-intro__content">
            <h2>Roll a random Pokémon.</h2>
            <p>From all 1,025, or narrow it down by generation and type. Each card rolls on its own too.</p>
            <div className="kart-intro__actions">
              <Button variant="primary" onClick={rollAll}>{hasRoll ? "Roll again" : `Roll ${count}`}</Button>
              <span className="kart-intro__switch">
                <Switch label="Rolling animation" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
              </span>
            </div>
          </div>
          <div className="randomizer-setup">
            <Tabs
              variant="pills"
              size="small"
              fullWidth
              activeTab={String(count)}
              onChange={(id) => { setCount(Number(id) as GenCount); setRolled((r) => r.slice(0, Number(id))); setNote(null); }}
              tabs={COUNTS.map((c) => ({ id: String(c), label: c === 1 ? "1 Pokémon" : `${c} Pokémon`, content: null }))}
              className="pokegen__count"
            />
            <Select floatingLabel="Generation" value={options.gen == null ? "" : String(options.gen)}
              onChange={(v) => set({ gen: v ? Number(v) : null })}
              options={[{ value: "", label: "All generations" }, ...GENERATIONS.map((g) => ({ value: String(g), label: `Gen ${g} · ${GEN_REGIONS[g] ?? ""}`.trim() }))]} />
            <Select floatingLabel="Type" value={options.type ?? ""}
              onChange={(v) => set({ type: v ? String(v) : null })}
              options={[{ value: "", label: "Any type" }, ...TYPES.map((t) => ({ value: t, label: t }))]} />
            <RandomizerOptions summary={summary} empty="Every Pokémon is in the mix">
              <FilterGroup label="Rules" activeValues={[options.fullyEvolved ? "fe" : "", options.noLegendary ? "nl" : "", options.noRepeatTypes ? "nr" : ""].filter(Boolean)}
                onToggle={(v) => { if (v === "fe") set({ fullyEvolved: !options.fullyEvolved }); if (v === "nl") set({ noLegendary: !options.noLegendary }); if (v === "nr") set({ noRepeatTypes: !options.noRepeatTypes }); }}
                options={[
                  { value: "fe", label: "Fully evolved only" },
                  { value: "nl", label: "No Legendaries or Mythicals" },
                  { value: "nr", label: "No repeated types" },
                ]} />
              <p className="party-muted">Fully evolved keeps final stages and Pokémon that never evolve. No repeated types means no two Pokémon in a roll share a type, good for a balanced team.</p>
            </RandomizerOptions>
          </div>
        </div>

        {note && <p className="pokegen__note" role="status">{note}</p>}
        <ul className="pokegen__grid" aria-label={hasRoll ? "Your Pokémon" : "Not rolled yet"}>
          {Array.from({ length: count }, (_, i) => {
            const p = rolled[i] ?? null;
            return (
              <li key={i} className="pokegen__slot">
                {p ? (
                  <PokemonCard key={`${i}-${p.dex}-${rolls[i] ?? 0}`} dex={p.dex} name={p.name} types={p.types} art={art[p.dex]}
                    onDetails={() => { setOpen(p); track(EVENTS.pokemonDetailsOpened, { game: "generator" }); }}
                    reel={animate && rolls[i] ? reel : undefined} />
                ) : (
                  <span className="pokeball-slot"><span className="pokeball-slot__tile"><PokeBall className="pokeball-slot__ball" /></span><span className="pokeball-slot__name">???</span></span>
                )}
                <span className="pokegen__refresh">
                  <IconAction label={p ? `New Pokémon instead of ${p.name}` : `Roll Pokémon ${i + 1}`} icon={IconRefresh} variant="primary" onClick={() => rerollOne(i)} />
                </span>
              </li>
            );
          })}
        </ul>
        {Object.keys(art).length ? <TcgAttribution className="type-card-disclaimer" /> : <PokemonDisclaimer />}
      </section>

      <PokemonDetails pokemon={open ? { dex: open.dex, name: open.name, types: open.types, art: art[open.dex] } : null} onClose={() => setOpen(null)} nameOf={nameOf}>
        {open && open.dex > 251 && (
          <section className="poke-details__section" aria-label="Facts">
            <dl className="poke-details__dl">
              <div><dt>Category</dt><dd>{open.category} Pokémon{open.legendary ? " · Legendary or Mythical" : ""}</dd></div>
              <div><dt>Height</dt><dd>{open.height} m</dd></div>
              <div><dt>Weight</dt><dd>{open.weight} kg</dd></div>
            </dl>
          </section>
        )}
        {open && (
          <section className="poke-details__section" aria-label="Where it's from">
            <p className="party-muted">Generation {open.gen}{GEN_REGIONS[open.gen] ? ` (${GEN_REGIONS[open.gen]})` : ""} · {STAGE_WORDS[open.stage]}</p>
          </section>
        )}
      </PokemonDetails>
    </div>
  );
}
