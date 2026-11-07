"use client";

/**
 * "What brings you here?" (personalization picks 2026-11-05, 7A): six pressable CDS Cards, pick any, preselected from
 * what we already know. Two places use it:
 *   - the welcome page after sign-up (`mode="welcome"`): Continue saves and shows first steps that fit; Skip hides it in
 *     this browser and keeps the usual steps;
 *   - Settings ▸ General (`mode="settings"`): every change saves itself.
 * The picks are kept on the account (/api/account/interests) and decide the order of the home.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@empac/cascadeds";
import { IconBroadcast, IconCalendarEvent, IconFlag, IconPokeball, IconSofa, IconTournament, type Icon } from "@tabler/icons-react";
import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { SaveStatus } from "@/components/account/admin/AdminKit";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { useToast } from "@/components/toast/ToastProvider";
import { INTERESTS, cleanInterests, type Interest } from "@/lib/interests/rules";
import { PILLAR_INTERESTS, type PillarId } from "@/lib/nav/pillars";
import type { HappeningWorld } from "@/lib/home/happening";
import { HappeningCard } from "@/components/home/HappeningBand";
import "@/styles/interests.css";

const LOOK: Record<Interest, { icon: Icon; tone: TileTone }> = {
  daily: { icon: IconCalendarEvent, tone: "violet" },
  home: { icon: IconSofa, tone: "magenta" },
  competitive: { icon: IconFlag, tone: "blue" },
  pokemon: { icon: IconPokeball, tone: "red" },
  stream: { icon: IconBroadcast, tone: "teal" },
  events: { icon: IconTournament, tone: "orange" },
};

const SKIP_KEY = "gs-interests-skip";
const noop = () => () => {};
const readSkip = () => { try { return localStorage.getItem(SKIP_KEY) === "1"; } catch { return false; } };

function Tiles({ picked, suggested, onToggle, labelledBy }: { picked: Set<Interest>; suggested?: Set<Interest>; onToggle: (id: Interest) => void; labelledBy: string }) {
  return (
    <div className="interest-tiles" role="group" aria-labelledby={labelledBy}>
      {INTERESTS.map((i) => {
        const look = LOOK[i.id];
        const on = picked.has(i.id);
        return (
          <Card key={i.id} variant="outlined" padding="small" interactive selected={on} onClick={() => onToggle(i.id)} className="interest-tile"
            aria-label={`${i.label}: ${i.line}`}>
            <IconTile icon={look.icon} tone={look.tone} />
            <span className="interest-tile__name">{i.label}</span>
            <span className="interest-tile__line">{i.line}</span>
            {suggested?.has(i.id) && <span className="interest-tile__why">Suggested</span>}
          </Card>
        );
      })}
    </div>
  );
}

/**
 * What's happening right now in the worlds picked (room air + discovery picks 2026-11-05, 6A): the first thing from
 * each picked world, up to three, so picking is a first look at the home rather than a form.
 */
function PickedPreview({ picked, band }: { picked: Set<Interest>; band: HappeningWorld[] }) {
  const worlds = new Set<PillarId>((Object.entries(PILLAR_INTERESTS) as [PillarId, Interest[]][]).filter(([, list]) => list.some((i) => picked.has(i))).map(([id]) => id));
  const items = band.filter((w) => worlds.has(w.id)).flatMap((w) => w.items.slice(0, 2)).slice(0, 3);
  if (!items.length) return null;
  return (
    <div className="band-preview" aria-live="polite">
      <p>Right now in what you picked. Your home starts with this.</p>
      <ul className="band__row">
        {items.map((h) => <li key={h.id}><HappeningCard h={h} from="welcome" /></li>)}
      </ul>
    </div>
  );
}

/** After sign-up: pick, then Continue (the page refreshes into first steps that fit). */
export function InterestWelcome({ suggested, band = [] }: { suggested: Interest[]; band?: HappeningWorld[] }) {
  const [picked, setPicked] = useState<Set<Interest>>(() => new Set(suggested));
  const [busy, setBusy] = useState(false);
  const skipped = useSyncExternalStore(noop, readSkip, () => false);
  const [hidden, setHidden] = useState(false);
  const router = useRouter();
  const toast = useToast();
  if (skipped || hidden) return null;
  const toggle = (id: Interest) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function save() {
    setBusy(true);
    const j = (await fetch("/api/account/interests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interests: [...picked] }) }).then((r) => r.json()).catch(() => ({}))) as { ok?: boolean };
    setBusy(false);
    if (!j.ok) { toast.error("That didn't save. Try again."); return; }
    router.refresh();
  }

  return (
    <section className="interest-welcome" aria-labelledby="interest-welcome-title">
      <h2 id="interest-welcome-title">What brings you here?</h2>
      <p className="interest-welcome__note">Pick any. It decides what you see first, and you can change it any time in Settings.</p>
      <Tiles picked={picked} suggested={new Set(suggested)} onToggle={toggle} labelledBy="interest-welcome-title" />
      <PickedPreview picked={picked} band={band} />
      <div className="interest-welcome__actions">
        <Button variant="primary" loading={busy} onClick={() => void save()}>Continue</Button>
        <Button variant="ghost" onClick={() => { try { localStorage.setItem(SKIP_KEY, "1"); } catch { /* private mode */ } setHidden(true); }}>Skip for now</Button>
      </div>
    </section>
  );
}

/** Settings ▸ General: the same tiles, saved as they change. */
export function InterestSettings({ initial, onChange }: { initial: Interest[]; onChange?: (picked: Interest[]) => void }) {
  const [picked, setPicked] = useState<Set<Interest>>(() => new Set(initial));
  const value = cleanInterests([...picked]);
  const { status } = useAutosave(value, async (v) => {
    const r = await fetch("/api/account/interests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interests: v }) });
    return r.ok;
  });
  const toggle = (id: Interest) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id); else n.add(id);
    setPicked(n);
    onChange?.(cleanInterests([...n]));
  };
  return (
    <div className="interest-settings">
      <div className="interest-settings__head">
        {/* The Settings section already shows this as its heading; screen readers still get the group's name. */}
        <p id="interest-settings-title" className="sr-only">What you&apos;re here for</p>
        <SaveStatus status={status} />
      </div>
      <Tiles picked={picked} onToggle={toggle} labelledBy="interest-settings-title" />
    </div>
  );
}

/** Settings ▸ General's section: loads the account's picks (or what to preselect), then the tiles. */
export function InterestSettingsLoader() {
  const [state, setState] = useState<{ ready: boolean; initial: Interest[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/account/interests", { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((j: { ok?: boolean; interests?: Interest[] | null; suggested?: Interest[] } | null) => {
      if (!live) return;
      if (!j?.ok) { setFailed(true); return; }
      setState({ ready: true, initial: j.interests ?? j.suggested ?? [] });
    });
    return () => { live = false; };
  }, []);
  if (failed) return <p className="interest-settings__note">Your interests couldn&apos;t be loaded. Try again in a moment.</p>;
  if (!state) return <p className="interest-settings__note" role="status">Loading…</p>;
  return <InterestSettings initial={state.initial} />;
}
