"use client";

/**
 * Pokémon Fire Red/Leaf Green run challenge (beta): a seeded run through Kanto
 * with a forced starter, catches to make before each badge, and a level cap,
 * team size and optional twist for every gym. The run lives in the URL
 * (?seed=&v=&c=&tw=&nf=) so a link shares the exact run; the checklist is kept
 * in this browser per run. Type cards, with a showcase TCG card on top where
 * one has been populated (see TypeCard and src/lib/pokemon/showcase.ts).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Checkbox, Progress, Select } from "@empac/cascadeds";
import { LabeledCarousel } from "@/components/ui/LabeledCarousel";
import { IconCopy, IconDice5, IconLink } from "@tabler/icons-react";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { PokemonDisclaimer, type ShowcaseArt } from "@/components/pokemon/TypeCard";
import { PokemonCard } from "@/components/pokemon/PokemonCard";
import { PokemonDetails, type DetailsPokemon } from "@/components/pokemon/PokemonDetails";
import { speciesName } from "@/lib/pokemon/names";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { EVENTS, track } from "@/lib/analytics/events";
import { FRLG_VERSIONS, METHOD_LABEL, buildRun, checklistIds, newSeed, runText, type FrlgVersion, type RunOptions } from "@/lib/pokemon/frlgRun";

/** The run a first visit opens on, so the page shows a real run straight away. */
const SAMPLE_SEED = "kanto1";
const STORE_EVENT = "gs-frlg-run";

function storageKey(seed: string, o: RunOptions) {
  return `gs-frlg-run:${seed}:${o.version}:${o.catches}:${o.noFishing ? 1 : 0}`;
}
function readStore(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(STORE_EVENT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(STORE_EVENT, cb); };
}

export function FrlgRunChallenge({ art = {} }: { art?: Record<number, ShowcaseArt> }) {
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const seed = params.get("seed")?.slice(0, 24) || SAMPLE_SEED;
  const options: RunOptions = {
    version: (params.get("v") === "leafgreen" ? "leafgreen" : "firered") as FrlgVersion,
    catches: params.get("c") === "2" ? 2 : 1,
    twists: params.get("tw") !== "0",
    noFishing: params.get("nf") === "1",
  };
  const run = buildRun(seed, options);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    if (!next.get("seed")) next.set("seed", seed);
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  // Checklist, per run, in this browser.
  const key = storageKey(seed, options);
  const raw = useSyncExternalStore(subscribe, () => readStore(key), () => "");
  const done = new Set(raw ? raw.split("|") : []);
  const ids = checklistIds(run);
  const doneCount = ids.filter((id) => done.has(id)).length;
  const toggle = (id: string) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem(key, [...next].join("|")); } catch { /* private mode: ticks last for the visit only */ }
    window.dispatchEvent(new Event(STORE_EVENT));
  };

  // The deck: press the carousel's own Next button (CDS has no controlled index).
  const deckRef = useRef<HTMLDivElement>(null);
  const next = () => deckRef.current?.querySelector<HTMLButtonElement>('.empac-carousel__nav-arrow[aria-label="Next slide"]')?.click();
  /** Every box on each card: the starter, then each badge's catches plus beating the leader. */
  const cardIds = (seg: (typeof run.segments)[number]) => [...seg.catches.map((c) => `${seg.id}:${c.name}`), `${seg.id}:beat`];
  const cards = [["starter"], ...run.segments.map(cardIds)];
  /** Tick a box; the deck moves on only once every box on that card is ticked. */
  const tick = (id: string, card: string[]) => {
    const finishing = !done.has(id);
    toggle(id);
    if (finishing) {
      track(EVENTS.runPartTicked, { part: id === "starter" ? "starter" : id.endsWith(":beat") ? "beat" : "catch" });
      if (id === `${run.segments[run.segments.length - 1]?.id}:beat`) track(EVENTS.runFinished, { version: options.version });
    }
    if (finishing && card.every((x) => x === id || done.has(x))) window.setTimeout(next, 350);
  };
  // Open on the first unfinished part (once, after this browser's ticks load).
  const positioned = useRef<string | null>(null);
  useEffect(() => {
    if (positioned.current === key || !raw) return;
    positioned.current = key;
    const first = cards.findIndex((card) => card.some((id) => !done.has(id)));
    const steps = first < 0 ? cards.length - 1 : first;
    for (let i = 0; i < steps; i++) window.setTimeout(next, 120 * (i + 1));
  }, [key, raw]); // eslint-disable-line react-hooks/exhaustive-deps
  const [details, setDetails] = useState<(DetailsPokemon & { where?: string }) | null>(null);
  const showDetails = (p: DetailsPokemon & { where?: string }) => {
    setDetails(p);
    track(EVENTS.pokemonDetailsOpened, { game: "frlg" });
  };

  /** The seed "New run" just rolled: its cards play the rolling animation (a shared link doesn't). */
  const [rolledSeed, setRolledSeed] = useState<string | null>(null);
  const reel = rolledSeed === seed ? [run.starter, ...run.segments.flatMap((s) => s.catches)].map((p) => ({ dex: p.dex, name: p.name, types: p.types })) : undefined;
  const newRun = () => {
    const fresh = newSeed();
    setRolledSeed(fresh);
    setParams({ seed: fresh });
    trackEvent("FRLG Run Rolled", { version: options.version, catches: String(options.catches) });
  };
  const copy = (text: string, ok: string) => navigator.clipboard.writeText(text).then(() => { toast.success(ok); track(EVENTS.resultCopied, { tool: "pokemon-firered-leafgreen" }); }, () => toast.error("Couldn't copy that"));
  const shareUrl = () => {
    const q = new URLSearchParams({ seed, v: options.version, c: String(options.catches), tw: options.twists ? "1" : "0", nf: options.noFishing ? "1" : "0" });
    return `${window.location.origin}${pathname}?${q.toString()}`;
  };
  const versionLabel = FRLG_VERSIONS.find((v) => v.id === options.version)?.label;

  return (
    <div className="frlg-run">
      <div className="randomizer-controls">
        <span className="party-muted">Seed <strong>{seed}</strong> · {versionLabel} · {options.catches} catch{options.catches > 1 ? "es" : ""} per badge</span>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
          <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={() => copy(runText(run), "Run copied")}>Copy run</Button>
          <Button variant="secondary" size="small" iconBefore={IconLink} onClick={() => copy(shareUrl(), "Link copied")}>Copy link</Button>
        </div>
      </div>

      <section>
        <div className="kart-intro">
          <div className="kart-intro__content">
            <h2>A new way through Kanto.</h2>
            <p>Take the starter you&apos;re given, catch what&apos;s listed before each gym, and beat the leader within the level cap and team size.</p>
            <div className="kart-intro__actions">
              <Button variant="primary" iconBefore={IconDice5} onClick={newRun}>New run</Button>
            </div>
            <div className="frlg-run__progress">
              <span className="party-muted">{doneCount} of {ids.length} done</span>
              <Progress value={doneCount} max={ids.length} size="small" variant={doneCount === ids.length ? "success" : "primary"} />
            </div>
          </div>
          <div className="randomizer-setup">
            <Select floatingLabel="Version" value={options.version} onChange={(v) => setParams({ v: String(v) })}
              options={FRLG_VERSIONS.map((v) => ({ value: v.id, label: v.label }))} />
            <RandomizerOptions summary={[`${options.catches} catch${options.catches > 1 ? "es" : ""} per badge`, options.twists && "Gym twists", options.noFishing && "No fishing"].filter((x): x is string => !!x)}>
              <FilterGroup label="Catches per badge" activeValues={[String(options.catches)]} onToggle={(v) => setParams({ c: v })}
                options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]} />
              <FilterGroup label="Rules" activeValues={[options.twists ? "twists" : "", options.noFishing ? "nofish" : ""].filter(Boolean)}
                onToggle={(v) => { if (v === "twists") setParams({ tw: options.twists ? "0" : "1" }); if (v === "nofish") setParams({ nf: options.noFishing ? "0" : "1" }); }}
                options={[{ value: "twists", label: "Gym twists" }, { value: "nofish", label: "No fishing" }]} />
              <p className="party-muted">Everything on the list can be caught before that gym on your version, at a level you can use. The level cap is the leader&apos;s strongest Pokémon: don&apos;t take anyone higher into the fight. Your ticks are saved in this browser for this run.</p>
            </RandomizerOptions>
          </div>
        </div>

        {/* One card per part of the run; ticking it complete moves to the next. */}
        <div className="frlg-run__deck" ref={deckRef}>
          <LabeledCarousel label="Your run, part by part" slidesToShow={{ mobile: 1, tablet: 2, desktop: 2 }} gap={16} showDots showArrows arrowPosition="bottom" touch keyboard>
            <Card variant="elevated" padding="large" className="frlg-seg">
              <div className="frlg-seg__head">
                <div>
                  <span className="frlg-seg__eyebrow">Pallet Town</span>
                  <h3 className="frlg-seg__title">Your starter</h3>
                  <p className="party-muted">Professor Oak&apos;s lab, Lv 5. No resetting for a different one.</p>
                </div>
              </div>
              <div className="frlg-seg__catches">
                <div className="frlg-catch">
                  <PokemonCard key={seed} reel={reel} dex={run.starter.dex} name={run.starter.name} types={run.starter.types} level={5} art={art[run.starter.dex]}
                    onDetails={() => showDetails({ dex: run.starter.dex, name: run.starter.name, types: run.starter.types, level: 5, where: "Professor Oak's lab in Pallet Town, Lv 5." })} />
                </div>
              </div>
              <div className="frlg-seg__beat">
                <Checkbox label={`Picked ${run.starter.name}`} checked={done.has("starter")} onChange={() => tick("starter", ["starter"])} />
              </div>
            </Card>
            {run.segments.map((s, i) => {
              const isLeague = i === run.segments.length - 1;
              const beat = `${s.id}:beat`;
              return (
                <Card key={s.id} variant="elevated" padding="large" className="frlg-seg">
                  <div className="frlg-seg__head">
                    <div>
                      <span className="frlg-seg__eyebrow">{isLeague ? "Indigo Plateau" : `Badge ${i + 1} of 8`}</span>
                      <h3 className="frlg-seg__title">{s.title}</h3>
                      <p className="party-muted">{s.sub}{s.leaderTeam.length ? ` · ${s.leaderTeam.map((p) => `${p.name} Lv ${p.level}`).join(", ")}` : ""}</p>
                    </div>
                    <div className="frlg-seg__rules">
                      <Badge variant="info" size="small">Level cap {s.levelCap}</Badge>
                      <Badge variant="info" size="small">Team up to {s.teamSize}</Badge>
                      {s.twist && <Badge variant="warning" size="small">{s.twist}</Badge>}
                    </div>
                  </div>
                  <p className="frlg-seg__lead">Catch before this fight:</p>
                  <div className="frlg-seg__catches">
                    {s.catches.map((c) => {
                      const id = `${s.id}:${c.name}`;
                      const where = `${c.area}: ${METHOD_LABEL[c.method] ?? c.method}, Lv ${c.min}${c.max !== c.min ? `-${c.max}` : ""}, ${c.rate}% of encounters.${c.tradeNote ? ` ${c.tradeNote}` : ""}`;
                      return (
                        <div key={id} className="frlg-catch">
                          <PokemonCard key={seed} reel={reel} dex={c.dex} name={c.name} types={c.types} art={art[c.dex]} onDetails={() => showDetails({ dex: c.dex, name: c.name, types: c.types, where })} />
                          <div className="frlg-catch__info">
                            <p><strong>{c.area}</strong></p>
                            <p className="party-muted">{METHOD_LABEL[c.method] ?? c.method} · Lv {c.min}{c.max !== c.min ? `-${c.max}` : ""}</p>
                            {c.tradeNote && <p className="party-muted">{c.tradeNote}</p>}
                            <Checkbox label="Caught" checked={done.has(id)} onChange={() => tick(id, cardIds(s))} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="frlg-seg__beat">
                    <Checkbox label={isLeague ? "Became Champion" : `Beat ${s.title.split(",")[0]}`} checked={done.has(beat)} onChange={() => tick(beat, cardIds(s))} />
                  </div>
                </Card>
              );
            })}
          </LabeledCarousel>
        </div>
        <PokemonDetails pokemon={details} onClose={() => setDetails(null)} nameOf={speciesName}>
          {details?.where && (
            <section className="poke-details__section" aria-label="Where to find it">
              <h3 className="poke-details__h">Where to find it</h3>
              <p className="party-muted" style={{ margin: 0 }}>{details.where}</p>
            </section>
          )}
        </PokemonDetails>
        {Object.keys(art).length ? <TcgAttribution className="type-card-disclaimer" /> : <PokemonDisclaimer />}
      </section>
    </div>
  );
}
