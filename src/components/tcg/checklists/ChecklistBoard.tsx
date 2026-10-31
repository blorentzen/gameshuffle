"use client";

/**
 * A checklist you tick off as you pull cards. Ticks live in this browser only
 * (localStorage, one key per checklist), so it works signed out and nothing is
 * sent anywhere. "Only what I still need" hides the ticked ones, and "Copy
 * what I need" puts the missing list on the clipboard for trading.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Button, Checkbox, Progress, Switch } from "@empac/cascadeds";
import { IconCopy } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import type { ChecklistSection } from "@/data/tcg-checklists";

const keyFor = (slug: string) => `gs-checklist-${slug}`;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("gs-checklist-")) fn(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
};
const read = (slug: string): string => { try { return localStorage.getItem(keyFor(slug)) ?? "{}"; } catch { return "{}"; } };

export function ChecklistBoard({ slug, setName, sections }: { slug: string; setName: string; sections: ChecklistSection[] }) {
  const toast = useToast();
  // The raw stored string keeps the snapshot stable between renders.
  const raw = useSyncExternalStore(subscribe, () => read(slug), () => "{}");
  const state = useMemo(() => {
    try { return JSON.parse(raw) as { got?: string[]; missingOnly?: boolean }; } catch { return {}; }
  }, [raw]);
  const got = useMemo(() => new Set(state.got ?? []), [state]);
  const missingOnly = !!state.missingOnly;

  const write = useCallback((next: { got: string[]; missingOnly: boolean }) => {
    try { localStorage.setItem(keyFor(slug), JSON.stringify(next)); } catch { /* private window: ticks just won't stick */ }
    listeners.forEach((fn) => fn());
  }, [slug]);

  const all = sections.flatMap((s) => s.items);
  const total = all.length;
  const have = all.filter((i) => got.has(i.no)).length;

  const toggle = (no: string) => {
    const next = new Set(got);
    if (next.has(no)) next.delete(no); else next.add(no);
    write({ got: [...next], missingOnly });
  };

  const copyMissing = async () => {
    const missing = all.filter((i) => !got.has(i.no));
    const text = `${setName}, still need (${missing.length}):\n${missing.map((i) => `${i.no} ${i.name}${i.label ? ` ${i.label}` : ""}${i.alt ? ` [${i.alt}]` : ""}${i.artist ? ` (${i.artist})` : ""}`).join("\n")}`;
    try { await navigator.clipboard.writeText(text); toast.success("Copied what you still need."); }
    catch { toast.error("Couldn't copy here. Try again from your browser."); }
  };

  return (
    <div className="checklist">
      <div className="checklist__bar">
        <div className="checklist__progress">
          <p className="checklist__count"><b>{have}</b> of {total}</p>
          <Progress value={have} max={total} size="small" variant={have === total ? "success" : "primary"} label={`${have} of ${total} collected`} className="admin-progress-quiet" />
        </div>
        <div className="checklist__tools">
          <Switch size="small" label="Only what I still need" checked={missingOnly} onChange={(e) => write({ got: [...got], missingOnly: e.target.checked })} />
          <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={() => void copyMissing()} disabled={have === total}>Copy what I need</Button>
        </div>
      </div>
      {sections.map((s) => {
        const items = missingOnly ? s.items.filter((i) => !got.has(i.no)) : s.items;
        return (
          <section key={s.id} className="checklist__section" aria-labelledby={`cl-${s.id}`}>
            <h2 id={`cl-${s.id}`} className="tcg-h2">{s.title}</h2>
            {s.blurb && <p className="checklist__blurb">{s.blurb}</p>}
            {items.length === 0 ? (
              <p className="checklist__done">All of these are ticked.</p>
            ) : (
              <ul className="checklist__items">
                {items.map((i) => (
                  <li key={i.no} className={got.has(i.no) ? "is-got" : ""}>
                    <Checkbox
                      checked={got.has(i.no)}
                      onChange={() => toggle(i.no)}
                      aria-label={`${i.name} ${i.no}${i.artist ? `, by ${i.artist}` : ""}`}
                    />
                    <span className="checklist__no">{i.no}</span>
                    <span className="checklist__name">{i.name}{i.label && <small> {i.label}</small>}{i.rarity && <small className="checklist__rarity"> {i.rarity}</small>}{i.alt && <small className="checklist__alt">{i.alt}</small>}</span>
                    {i.artist && <span className="checklist__artist">{i.artist}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
