"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Badge, Button, Chip, Radio, RadioGroup, Select, Switch } from "@empac/cascadeds";
import { IconDice5, IconPlayerPlay } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { PARTY_GAMES } from "@/data/party";
import { NIGHT_GAMES } from "@/lib/nights/games";
import { DEFAULT_PARTY_MODULE, readModules, type PartyModule } from "@/lib/game-nights/modules";

/**
 * Game night modules on the manage page. The host adds Mario Party, sets how
 * the night plays (games, house rules, Chance cards, missions, private or open
 * hands) and starts it as a live night: RSVPs who are going get seats, guests
 * join by code. Randomizer pages only roll; this is where the meta game lives.
 */
export function NightModules({ nightId, initial, liveCode }: { nightId: string; initial: unknown; liveCode: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const saved = readModules(initial).find((m) => m.type === "mario-party") ?? null;
  const [mod, setMod] = useState<PartyModule | null>(saved);
  const [savedJson, setSavedJson] = useState(JSON.stringify(saved));
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const dirty = JSON.stringify(mod) !== savedJson;
  const isSaved = savedJson !== "null";

  const put = async (next: PartyModule | null) => {
    setBusy(true);
    const r = await fetch(`/api/game-nights/${nightId}/modules`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modules: next ? [next] : [] }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) {
      if (j.error === "unavailable") setUnavailable(true);
      else toast.error("Couldn't save the module. Please try again.");
      return false;
    }
    const clean = (j.modules as PartyModule[])[0] ?? null;
    setMod(clean); setSavedJson(JSON.stringify(clean));
    toast.success(next ? "Mario Party saved" : "Module removed");
    return true;
  };

  const start = async () => {
    setBusy(true);
    const r = await fetch(`/api/game-nights/${nightId}/modules/party`, { method: "POST" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { toast.error(j.error === "unavailable" ? "Live nights need a database update first." : "Couldn't start the live night. Please try again."); return; }
    router.push(`/party/${j.code}`);
  };

  const set = (patch: Partial<PartyModule>) => setMod((m) => (m ? { ...m, ...patch } : m));
  const setCards = (patch: Partial<PartyModule["cards"]>) => setMod((m) => (m ? { ...m, cards: { ...m.cards, ...patch } } : m));
  const toggleGame = (slug: string) => {
    if (!mod) return;
    const on = mod.games.includes(slug);
    const next = on ? mod.games.filter((g) => g !== slug) : [...mod.games, slug];
    if (!next.some((g) => PARTY_GAMES[g])) { toast.info("Keep at least one Mario Party game."); return; }
    set({ games: next });
  };
  const counts = (max: number, noun: (n: number) => string) =>
    Array.from({ length: max + 1 }, (_, n) => ({ value: String(n), label: n === 0 ? "None" : noun(n) }));

  return (
    <div className="comp-card night-modules">
      <h2 className="event-shell__h2">Modules</h2>
      {unavailable && <Alert variant="info" title="Modules need a database update">Once it&apos;s applied, you can add Mario Party to this night.</Alert>}
      {!mod ? (
        <div className="night-modules__empty">
          <p className="party-muted">Run part of the night on GameShuffle. Mario Party adds Chance cards, missions and a live scoreboard that everyone follows on their phone.</p>
          <Button variant="secondary" iconBefore={IconDice5} onClick={() => setMod({ ...DEFAULT_PARTY_MODULE })}>Add Mario Party</Button>
        </div>
      ) : (
        <div className="night-modules__module">
          <div className="night-modules__head">
            <strong>Mario Party</strong>
            {liveCode ? <Badge variant="success" size="small">Live now</Badge> : dirty ? <Badge variant="warning" size="small">Not saved</Badge> : <Badge variant="info" size="small">Ready</Badge>}
          </div>
          <p className="party-muted">When you start it, everyone who&apos;s going gets a seat with their account, so their points count. Anyone else takes an open seat by scanning the code.</p>

          <p className="party-options__label">Games tonight</p>
          <div className="party-chips">
            {NIGHT_GAMES.map((g) => {
              const on = mod.games.includes(g.slug);
              return <Chip key={g.slug} clickable selected={on} variant={on ? "primary" : "default"} label={g.short} onClick={() => toggleGame(g.slug)} />;
            })}
          </div>
          <p className="party-muted">One scoreboard for all of them: 10, 6, 3 and 1 points for the top four in each game, plus missions. Most points is the night&apos;s MVP.</p>

          <p className="party-options__label">Cards and missions</p>
          <div className="party-row">
            <Select floatingLabel="House rules" value={String(mod.cards.rules)} onChange={(v) => setCards({ rules: Number(v) })} options={counts(3, (n) => `${n} rule${n === 1 ? "" : "s"}`)} />
            <Select floatingLabel="Chance cards" value={String(mod.cards.chance)} onChange={(v) => setCards({ chance: Number(v) })} options={counts(4, (n) => `${n} to deal`)} />
            <Select floatingLabel="Mix" value={mod.cards.mix} onChange={(v) => setCards({ mix: v as PartyModule["cards"]["mix"] })}
              options={[{ value: "both", label: "Helps and crutches" }, { value: "help", label: "Helps only" }, { value: "crutch", label: "Crutches only" }]} />
            <Select floatingLabel="Missions" value={String(mod.cards.missions)} onChange={(v) => setCards({ missions: Number(v) })} options={counts(3, (n) => `${n} each`)} />
          </div>
          <Switch label="Include spicy house rules" checked={mod.cards.spicy} onChange={(e) => setCards({ spicy: e.target.checked })} />
          <RadioGroup name={`hands-${nightId}`} orientation="horizontal" label="Hands" value={mod.visibility} onChange={(v) => set({ visibility: v as PartyModule["visibility"] })}>
            <Radio value="secret" label="Private to each phone" />
            <Radio value="open" label="Everyone sees every hand" />
          </RadioGroup>
          <Switch label="Carry over from your last night (the MVP starts with a crutch, last place with a help)" checked={mod.carryover} onChange={(e) => set({ carryover: e.target.checked })} />
          <Switch label="I'm playing too" checked={mod.hostPlays} onChange={(e) => set({ hostPlays: e.target.checked })} />

          <div className="party-row">
            <Button variant="primary" disabled={busy || !dirty} onClick={() => put(mod)}>Save module</Button>
            {liveCode ? (
              <Link href={`/party/${liveCode}`}><Button variant="secondary" iconBefore={IconPlayerPlay}>Open the live night</Button></Link>
            ) : (
              <Button variant="secondary" iconBefore={IconPlayerPlay} disabled={busy || dirty || !isSaved} onClick={start}>Start the live night</Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => (isSaved ? put(null) : setMod(null))}>Remove</Button>
          </div>
          {dirty && !liveCode && <p className="party-muted">Save your changes before starting the night.</p>}
        </div>
      )}
    </div>
  );
}
