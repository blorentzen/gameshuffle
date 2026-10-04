"use client";

/**
 * Pokémon FireRed/LeafGreen run challenge (beta): a seeded run through Kanto
 * with a forced starter, catches to make before each badge, and a level cap,
 * team size and optional twist for every gym. The run lives in the URL
 * (?seed=&v=&c=&tw=&nf=) so a link shares the exact run; the checklist is kept
 * in this browser per run. Type cards only, no art (see TypeCard).
 */

import { useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Checkbox, Progress } from "@empac/cascadeds";
import { IconCopy, IconDice5, IconLink } from "@tabler/icons-react";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { PokemonDisclaimer, TypeCard } from "@/components/pokemon/TypeCard";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
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

export function FrlgRunChallenge() {
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

  const newRun = () => {
    setParams({ seed: newSeed() });
    trackEvent("FRLG Run Rolled", { version: options.version, catches: String(options.catches) });
  };
  const copy = (text: string, ok: string) => navigator.clipboard.writeText(text).then(() => toast.success(ok), () => toast.error("Couldn't copy that"));
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
            <p>Start with the starter you&apos;re given. Before each gym, catch the Pokémon on the list, then beat the leader with the team size and level cap shown. Everything on the list can be caught before that gym on your version, at a level you can use.</p>
            <div className="kart-intro__actions">
              <Button variant="primary" iconBefore={IconDice5} onClick={newRun}>New run</Button>
            </div>
            <div className="frlg-run__progress">
              <span className="party-muted">{doneCount} of {ids.length} done</span>
              <Progress value={doneCount} max={ids.length} size="small" variant={doneCount === ids.length ? "success" : "primary"} />
            </div>
          </div>
          <div>
            <div className="filter-section">
              <FilterGroup label="Version" activeValues={[options.version]} onToggle={(v) => setParams({ v })}
                options={FRLG_VERSIONS.map((v) => ({ value: v.id, label: v.label }))} />
              <FilterGroup label="Catches per badge" activeValues={[String(options.catches)]} onToggle={(v) => setParams({ c: v })}
                options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]} />
              <FilterGroup label="Rules" activeValues={[options.twists ? "twists" : "", options.noFishing ? "nofish" : ""].filter(Boolean)}
                onToggle={(v) => { if (v === "twists") setParams({ tw: options.twists ? "0" : "1" }); if (v === "nofish") setParams({ nf: options.noFishing ? "0" : "1" }); }}
                options={[{ value: "twists", label: "Gym twists" }, { value: "nofish", label: "No fishing" }]} />
            </div>
            <p className="party-muted">The level cap is the leader&apos;s strongest Pokémon: don&apos;t take anyone higher into the fight. Your ticks are saved in this browser for this run.</p>
          </div>
        </div>

        <div className="frlg-seg">
          <div className="frlg-seg__head">
            <div>
              <span className="frlg-seg__eyebrow">Pallet Town</span>
              <h3 className="frlg-seg__title">Your starter</h3>
              <p className="party-muted">Professor Oak&apos;s lab, Lv 5. No resetting for a different one.</p>
            </div>
          </div>
          <div className="frlg-seg__catches">
            <div className="frlg-catch">
              <TypeCard dex={run.starter.dex} name={run.starter.name} types={run.starter.types} level={5} />
              <Checkbox label={`Picked ${run.starter.name}`} checked={done.has("starter")} onChange={() => toggle("starter")} />
            </div>
          </div>
        </div>

        {run.segments.map((s, i) => {
          const isLeague = i === run.segments.length - 1;
          return (
            <div key={s.id} className="frlg-seg">
              <div className="frlg-seg__head">
                <div>
                  <span className="frlg-seg__eyebrow">{isLeague ? "Indigo Plateau" : `Badge ${i + 1}`}</span>
                  <h3 className="frlg-seg__title">{s.title}</h3>
                  <p className="party-muted">{s.sub}{s.leaderTeam.length ? ` · ${s.leaderTeam.map((p) => `${p.name} Lv ${p.level}`).join(", ")}` : ""}</p>
                </div>
                <div className="frlg-seg__rules">
                  <Badge variant="info" size="small">Level cap {s.levelCap}</Badge>
                  <Badge variant="info" size="small">Team up to {s.teamSize}</Badge>
                  {s.twist && <Badge variant="warning" size="small">{s.twist}</Badge>}
                </div>
              </div>
              <div className="frlg-seg__catches">
                {s.catches.map((c) => {
                  const id = `${s.id}:${c.name}`;
                  return (
                    <div key={id} className="frlg-catch">
                      <TypeCard dex={c.dex} name={c.name} types={c.types} />
                      <div className="frlg-catch__info">
                        <p><strong>{c.area}</strong></p>
                        <p className="party-muted">{METHOD_LABEL[c.method] ?? c.method} · Lv {c.min}{c.max !== c.min ? `-${c.max}` : ""} · {c.rate}% of encounters</p>
                        {c.tradeNote && <p className="party-muted">{c.tradeNote}</p>}
                        <Checkbox label={`Caught ${c.name}`} checked={done.has(id)} onChange={() => toggle(id)} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="frlg-seg__beat">
                <Checkbox label={isLeague ? "Became Champion" : `Beat ${s.title.split(",")[0]}`} checked={done.has(`${s.id}:beat`)} onChange={() => toggle(`${s.id}:beat`)} />
              </div>
            </div>
          );
        })}
        <PokemonDisclaimer />
      </section>
    </div>
  );
}
