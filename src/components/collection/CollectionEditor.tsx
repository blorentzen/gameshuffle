"use client";

import { useMemo, useState } from "react";
import { Accordion, Button, Chip, Input, Radio, RadioGroup, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { PARTY_GAMES } from "@/data/party";
import { collectionCatalog, defaultCollection, type GameCollection } from "@/lib/collection/catalog";
import { useGameCollection } from "@/hooks/useGameCollection";

/**
 * Pick what you own for one game. Items are chips (lit = you have it), with
 * group shortcuts ("Booster Course Pass wave 3") and search for long lists.
 * Controlled: the parent decides when to save.
 */
export function CollectionEditor({ slug, value, onChange }: { slug: string; value: GameCollection; onChange: (next: GameCollection) => void }) {
  const cat = collectionCatalog(slug);
  const [q, setQ] = useState<Record<string, string>>({});
  const party = PARTY_GAMES[slug];
  if (!cat) return null;

  const offOf = (section: string) => new Set(value.off[section] ?? []);
  const setOff = (section: string, ids: Set<string>) => onChange({ ...value, off: { ...value.off, [section]: [...ids] } });
  const toggle = (section: string, id: string) => { const s = offOf(section); if (s.has(id)) s.delete(id); else s.add(id); setOff(section, s); };
  const setGroup = (section: string, ids: string[], owned: boolean) => { const s = offOf(section); ids.forEach((id) => (owned ? s.delete(id) : s.add(id))); setOff(section, s); };

  return (
    <div className="collection-editor">
      {party?.editions && (
        <RadioGroup name={`edition-${slug}`} orientation="horizontal" label="Which version do you have?" value={(value.prefs.edition as string) ?? "switch1"}
          onChange={(v) => onChange({ ...value, prefs: { ...value.prefs, edition: v } })}>
          {party.editions.map((e) => <Radio key={e.id} value={e.id} label={e.label} />)}
        </RadioGroup>
      )}
      {party && party.modes.some((m) => m.unlockable) && party.modes.filter((m) => m.unlockable).map((m) => {
        const unlocked = ((value.prefs.unlockedModes as string[] | undefined) ?? []).includes(m.id);
        return (
          <Switch key={m.id} label={`${m.label} unlocked`} checked={unlocked} onChange={(e) => {
            const cur = new Set((value.prefs.unlockedModes as string[] | undefined) ?? []);
            if (e.target.checked) cur.add(m.id); else cur.delete(m.id);
            onChange({ ...value, prefs: { ...value.prefs, unlockedModes: [...cur] } });
          }} />
        );
      })}
      <Accordion variant="bordered" allowMultiple defaultOpenIds={[cat.sections[0]?.id]} items={cat.sections.map((s) => {
        const off = offOf(s.id);
        const owned = s.items.length - s.items.filter((i) => off.has(i.id)).length;
        const query = (q[s.id] ?? "").trim().toLowerCase();
        const shown = query ? s.items.filter((i) => i.label.toLowerCase().includes(query)) : s.items;
        return {
          id: s.id,
          title: s.label,
          description: `${owned} of ${s.items.length} owned`,
          content: (
            <div className="collection-editor__section">
              <div className="party-chips">
                <Button variant="ghost" size="small" onClick={() => setGroup(s.id, s.items.map((i) => i.id), true)}>All on</Button>
                <Button variant="ghost" size="small" onClick={() => setGroup(s.id, s.items.map((i) => i.id), false)}>All off</Button>
                {s.groups.map((g) => {
                  const have = g.itemIds.filter((id) => !off.has(id)).length;
                  const all = have === g.itemIds.length;
                  return <Chip key={g.id} clickable selected={all} variant={all ? "primary" : "default"} label={`${g.label} ${have}/${g.itemIds.length}`}
                    onClick={() => setGroup(s.id, g.itemIds, !all)} />;
                })}
              </div>
              {s.items.length > 24 && <Input floatingLabel={`Find in ${s.label.toLowerCase()}`} value={q[s.id] ?? ""} onChange={(e) => setQ((cur) => ({ ...cur, [s.id]: e.target.value }))} />}
              <div className="party-chips collection-editor__items">
                {shown.map((i) => {
                  const have = !off.has(i.id);
                  return <Chip key={i.id} size="small" clickable selected={have} variant={have ? "primary" : "default"} label={i.label} onClick={() => toggle(s.id, i.id)} />;
                })}
              </div>
            </div>
          ),
        };
      })} />
    </div>
  );
}

/** Account page: every game's collection, one at a time. */
export function MyGamesPanel({ games }: { games: string[] }) {
  const [slug, setSlug] = useState(games[0]);
  const labels = useMemo(() => games.map((g) => ({ g, label: collectionCatalog(g)?.label ?? g })), [games]);
  return (
    <div className="my-games">
      <div className="party-chips">
        {labels.map(({ g, label }) => <Chip key={g} clickable selected={slug === g} variant={slug === g ? "primary" : "default"} label={label} onClick={() => setSlug(g)} />)}
      </div>
      <MyGameEditor key={slug} slug={slug} />
    </div>
  );
}

function MyGameEditor({ slug }: { slug: string }) {
  const toast = useToast();
  const { collection, save, source, loaded } = useGameCollection(slug, defaultCollection(slug));
  const [draft, setDraft] = useState<GameCollection | null>(null);
  const value = draft ?? collection;
  if (!loaded) return <p className="party-muted">Loading…</p>;
  return (
    <>
      <p className="party-muted">
        Switch off anything you don&apos;t have. {collectionCatalog(slug)?.label} randomizers will skip it.
        {source === "browser" ? " Saving in this browser for now." : ""}
      </p>
      <CollectionEditor slug={slug} value={value} onChange={setDraft} />
      <div className="party-row">
        <Button variant="primary" disabled={!draft} onClick={async () => {
          if (!draft) return;
          const ok = await save(draft);
          if (ok) { toast.success("Collection saved"); setDraft(null); } else toast.error("Couldn't save. Please try again.");
        }}>Save</Button>
        {draft && <Button variant="ghost" onClick={() => setDraft(null)}>Discard changes</Button>}
      </div>
    </>
  );
}
