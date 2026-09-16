"use client";

import { Fragment, useState } from "react";
import { Button, IconButton, Input } from "@empac/cascadeds";
import { useLocalState } from "@/lib/board-game-nights/companion/useLocalState";
import { useRoster } from "@/lib/board-game-nights/companion/roster";
import { RosterEmpty } from "@/components/board-game-nights/companion/RosterEmpty";

/**
 * Clue-style deduction notepad — the little pad from the box, digital. Tap a
 * cell to cycle its mark for that player: blank → ✗ (ruled out) → ✓ (has it) →
 * ? (maybe). Sections + items default to the classic set; Edit board lets you
 * rename, add, or remove them for other deduction games or house rules. Players
 * come from the shared roster; marks keyed by player id, saved on the device.
 */

type Mark = "" | "no" | "yes" | "maybe";
const NEXT: Record<Mark, Mark> = { "": "no", no: "yes", yes: "maybe", maybe: "" };
const GLYPH: Record<Mark, string> = { "": " ", no: "✗", yes: "✓", maybe: "?" };
const MARK_COLOR: Record<Mark, string | undefined> = {
  "": undefined,
  no: "var(--error-600, #c11a10)",
  yes: "var(--success-700, #0f7a0a)",
  maybe: "var(--warning-700, #a15c00)",
};

interface Item { id: string; label: string }
interface Section { id: string; title: string; items: Item[] }

const DEFAULT_SECTIONS: Section[] = [
  {
    id: "suspects", title: "Suspects",
    items: ["Scarlet", "Mustard", "White", "Green", "Peacock", "Plum"].map((l, i) => ({ id: `sus-${i}`, label: l })),
  },
  {
    id: "weapons", title: "Weapons",
    items: ["Candlestick", "Knife", "Lead Pipe", "Revolver", "Rope", "Wrench"].map((l, i) => ({ id: `wpn-${i}`, label: l })),
  },
  {
    id: "rooms", title: "Rooms",
    items: ["Kitchen", "Ballroom", "Conservatory", "Dining Room", "Billiard Room", "Library", "Lounge", "Hall", "Study"].map((l, i) => ({ id: `rm-${i}`, label: l })),
  },
];

interface DState {
  sections: Section[];
  marks: Record<string, Record<string, Mark>>; // marks[itemId][playerId]
}
const INITIAL: DState = { sections: DEFAULT_SECTIONS, marks: {} };

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

export function DeductionNotes() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<DState>("gs-bgn-deduction", INITIAL);
  const [editing, setEditing] = useState(false);
  // Migrate any pre-upgrade save that lacks sections.
  const sections = state.sections ?? DEFAULT_SECTIONS;
  const marks = state.marks ?? {};
  const itemCount = sections.reduce((t, s) => t + s.items.length, 0);

  // Old saves stored marks as an index array; a string-id lookup on it is
  // undefined, so those simply read back blank (graceful, no crash).
  const markFor = (itemId: string, id: string): Mark => {
    const row = marks[itemId];
    return (row && !Array.isArray(row) ? row[id] : undefined) ?? "";
  };

  const cycle = (itemId: string, id: string) =>
    setState((s) => {
      const prev = s.marks?.[itemId];
      const row = prev && !Array.isArray(prev) ? prev : {};
      return { ...s, marks: { ...(s.marks ?? {}), [itemId]: { ...row, [id]: NEXT[row[id] ?? ""] } } };
    });

  const renameSection = (sid: string, title: string) =>
    setState((s) => ({ ...s, sections: (s.sections ?? DEFAULT_SECTIONS).map((sec) => (sec.id === sid ? { ...sec, title } : sec)) }));
  const addSection = () =>
    setState((s) => ({ ...s, sections: [...(s.sections ?? DEFAULT_SECTIONS), { id: uid(), title: "New section", items: [] }] }));
  const removeSection = (sid: string) =>
    setState((s) => {
      const secs = s.sections ?? DEFAULT_SECTIONS;
      const target = secs.find((sec) => sec.id === sid);
      if (!target) return s;
      const marksNext = { ...s.marks };
      for (const it of target.items) delete marksNext[it.id];
      return { ...s, sections: secs.filter((sec) => sec.id !== sid), marks: marksNext };
    });
  const renameItem = (sid: string, itemId: string, label: string) =>
    setState((s) => ({
      ...s,
      sections: (s.sections ?? DEFAULT_SECTIONS).map((sec) =>
        sec.id === sid ? { ...sec, items: sec.items.map((it) => (it.id === itemId ? { ...it, label } : it)) } : sec,
      ),
    }));
  const addItem = (sid: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setState((s) => ({
      ...s,
      sections: (s.sections ?? DEFAULT_SECTIONS).map((sec) =>
        sec.id === sid ? { ...sec, items: [...sec.items, { id: uid(), label: trimmed }] } : sec,
      ),
    }));
  };
  const removeItem = (sid: string, itemId: string) =>
    setState((s) => {
      const marksNext = { ...s.marks };
      delete marksNext[itemId];
      return {
        ...s,
        sections: (s.sections ?? DEFAULT_SECTIONS).map((sec) =>
          sec.id === sid ? { ...sec, items: sec.items.filter((it) => it.id !== itemId) } : sec,
        ),
        marks: marksNext,
      };
    });

  const reset = () => { if (window.confirm("Reset to the classic Clue board and clear marks?")) setState({ sections: DEFAULT_SECTIONS, marks: {} }); };
  const clearMarks = () => { if (window.confirm("Clear the marks but keep the board?")) setState((s) => ({ ...s, marks: {} })); };

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant={editing ? "primary" : "secondary"} size="small" onClick={() => setEditing((e) => !e)}>
            {editing ? "Done editing" : "Edit board"}
          </Button>
          <Button variant="ghost" size="small" onClick={clearMarks}>Clear marks</Button>
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>
      <p className="bgn-tools__hint">
        {editing ? "Rename anything, add or remove cards and sections. Tap Done editing to play." : "Tap a cell to cycle: blank → ✗ ruled out → ✓ has it → ? maybe."}
      </p>

      <div className="bgn-sheet__scroll">
        <table className="bgn-sheet bgn-sheet--deduction">
          <thead>
            <tr>
              <th className="bgn-sheet__rowlabel">Card</th>
              {players.map((pl) => (
                <th key={pl.id}>{pl.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.id}>
                <tr className="bgn-sheet__section">
                  <td colSpan={players.length + 1}>
                    {editing ? (
                      <div className="bgn-deduction__sectionedit">
                        <input className="bgn-deduction__titleinput" value={section.title} onChange={(e) => renameSection(section.id, e.target.value)} aria-label="Section name" />
                        <IconButton variant="tertiary" size="small" className="bgn-sheet__x" aria-label={`Remove ${section.title} section`} onClick={() => removeSection(section.id)}>×</IconButton>
                      </div>
                    ) : section.title}
                  </td>
                </tr>
                {section.items.map((item) => (
                  <tr key={item.id}>
                    <td className="bgn-sheet__rowlabel">
                      {editing ? (
                        <div className="bgn-deduction__itemedit">
                          <input className="bgn-deduction__iteminput" value={item.label} onChange={(e) => renameItem(section.id, item.id, e.target.value)} aria-label="Card name" />
                          <IconButton variant="tertiary" size="small" className="bgn-sheet__x" aria-label={`Remove ${item.label}`} onClick={() => removeItem(section.id, item.id)}>×</IconButton>
                        </div>
                      ) : item.label}
                    </td>
                    {players.map((pl) => {
                      const m = markFor(item.id, pl.id);
                      return (
                        <td key={pl.id} className="bgn-deduction__cell">
                          <Button
                            variant="ghost"
                            size="small"
                            className="bgn-deduction__mark"
                            onClick={() => cycle(item.id, pl.id)}
                            aria-label={`${item.label}, ${pl.name}: ${m || "unknown"}`}
                          >
                            <span style={{ color: MARK_COLOR[m], fontWeight: 800 }}>{GLYPH[m]}</span>
                          </Button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {editing && (
                  <tr>
                    <td colSpan={players.length + 1}>
                      <AddItemRow onAdd={(label) => addItem(section.id, label)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? (
        <div style={{ marginTop: "var(--spacing-16)" }}>
          <Button variant="secondary" size="small" onClick={addSection}>Add section</Button>
        </div>
      ) : (
        <p className="bgn-tools__hint" style={{ marginTop: "var(--spacing-12)" }}>
          {itemCount} cards across {sections.length} section{sections.length === 1 ? "" : "s"}. Mark what each player reveals to close in on the solution.
        </p>
      )}
    </div>
  );
}

function AddItemRow({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => { onAdd(value); setValue(""); };
  return (
    <div className="bgn-deduction__additem">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder="Add a card"
        aria-label="Add a card"
      />
      <Button variant="ghost" size="small" onClick={submit} disabled={!value.trim()}>Add</Button>
    </div>
  );
}
