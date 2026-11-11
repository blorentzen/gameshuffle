"use client";

/**
 * Your splits (speedrun templates picks 2026-11-10, all as recommended): three ways in on the setup page.
 *   Start from a template: the game's ready-made lists (Mario Kart cups as LiveSplit groups, Kirby Air Riders, Fire Red
 *     Any%) with the speed and items that make the category, or the number builder for any game ("Kingdom 1 to 12").
 *   Type them: one per line, as before ("-Name" and "{Group} Name" group them the way LiveSplit does).
 *   Bring a LiveSplit file: the runner's .lss, read in the browser, with its PB, best splits and attempts.
 * Every list can be downloaded as a LiveSplit file. The timer's own splits take over whenever it connects.
 */

import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Accordion, Button, Card, Chip, Input, Tabs, Textarea } from "@empac/cascadeds";
import { IconDownload, IconFileUpload } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { SPLITS_MAX, cleanSplitNames } from "@/lib/speedrun/rules";
import { buildTemplate, numberedSplits, type GameTemplates } from "@/lib/speedrun/templates";
import { namesToGroups, shownName } from "@/lib/speedrun/splitGroups";
import { LSS_MAX_BYTES, lssFileName, readLss, writeLss, type LssRun } from "@/lib/speedrun/lss";
import { fmtClock } from "@/lib/speedrun/time";
import type { SpeedrunSetupView } from "@/lib/speedrun/types";

type Way = "template" | "type" | "file";

interface Props {
  view: SpeedrunSetupView;
  /** The game and category as the form has them now. */
  game: string;
  category: string;
  /** A save went through: the page takes the new setup (game, category and attempts may have changed too). */
  onSaved: (view: SpeedrunSetupView) => void;
}

/** The list as it will look: groups with their names, the first few open. */
function Preview({ names }: { names: string[] }) {
  const groups = useMemo(() => namesToGroups(names), [names]);
  const shown = groups.slice(0, 3);
  const rest = groups.slice(3);
  // Where each group's numbering starts.
  const starts = shown.map((_, gi) => shown.slice(0, gi).reduce((a, g) => a + g.names.length, 0) + 1);
  return (
    <div className="sr-tpl-list">
      {shown.map((g, gi) => {
        const start = starts[gi];
        return (
          <div className="sr-tpl-list__g" key={gi}>
            {g.group && <div className="sr-tpl-list__h"><b>{g.group}</b><span>{g.names.length} split{g.names.length === 1 ? "" : "s"}</span></div>}
            <ol start={start}>{g.names.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </div>
        );
      })}
      {rest.length > 0 && (
        <p className="sr-tpl-list__more">
          {rest.some((g) => g.group)
            ? `${rest.length} more ${rest.every((g) => g.group?.endsWith(" Cup")) ? "cups" : "groups"}: ${rest.map((g) => g.group ?? g.names[0]).join(", ")}`
            : `${rest.reduce((a, g) => a + g.names.length, 0)} more splits`}
        </p>
      )}
    </div>
  );
}

function download(game: string, category: string, names: string[]) {
  const blob = new Blob([writeLss({ game: game || "My run", category, names })], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = lssFileName(game, category);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SpeedrunSplits({ view, game, category, onSaved }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [way, setWay] = useState<Way>("template");
  const [saving, setSaving] = useState(false);

  // Templates for the game (fetched when the game changes; the data stays off this page's bundle).
  const [tpls, setTpls] = useState<{ game: string; data: GameTemplates | null } | null>(null);
  useEffect(() => {
    const g = game.trim();
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/speedrun/templates?game=${encodeURIComponent(g)}`).then((r) => r.json())
        .then((d: { templates: GameTemplates | null }) => { if (alive) setTpls({ game: g, data: d.templates }); })
        .catch(() => { if (alive) setTpls({ game: g, data: null }); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [game]);
  const gt = tpls?.game === game.trim() ? tpls.data : null;

  const [tplId, setTplId] = useState<string | null>(null);
  const [byCup, setByCup] = useState(false);
  const [cup, setCup] = useState(0);
  const [speed, setSpeed] = useState<string | null>(null);
  const [items, setItems] = useState<boolean | null>(null);
  const tpl = gt ? gt.templates.find((t) => t.id === tplId) ?? gt.templates[0] : null;
  const built = tpl ? buildTemplate(tpl, { byCup, cup, speed, items }) : null;

  // The number builder (any game).
  const [nb, setNb] = useState({ name: "", from: "1", to: "8", last: "" });
  const numbered = numberedSplits({ name: nb.name, from: Number(nb.from), to: Number(nb.to), last: nb.last });

  // Typed.
  const [text, setText] = useState(view.splits.join("\n"));
  // A save (from any way in) shows up in the box: adjusted while rendering, not in an effect.
  const splitsKey = view.splits.join("\n");
  const [seenKey, setSeenKey] = useState(splitsKey);
  if (seenKey !== splitsKey) { setSeenKey(splitsKey); setText(splitsKey); }
  const typed = cleanSplitNames(text);

  // A LiveSplit file.
  const [file, setFile] = useState<{ name: string; run: LssRun } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  async function readFile(f: File | undefined) {
    if (!f) return;
    setFileError(null);
    if (f.size > LSS_MAX_BYTES) { setFile(null); setFileError("That file is too big for a splits file."); return; }
    const run = readLss(await f.text().catch(() => ""));
    if (!run) { setFile(null); setFileError("That isn't a LiveSplit splits file (.lss), or it has no splits."); return; }
    setFile({ name: f.name, run });
  }

  /** Replacing splits with times asks first: the PB and best times stay with the old splits. */
  async function okToReplace(names: string[]): Promise<boolean> {
    const same = names.length === view.splits.length && names.every((n, i) => n === view.splits[i]);
    if (same || !view.splitsTimed) return true;
    return confirm({ title: "Replace your splits?", body: "Your PB and best times stay with the old splits. The new ones start fresh, and your timer's splits take over again whenever it connects.", confirmLabel: "Replace my splits" });
  }

  async function patch(body: Record<string, unknown>, ok: string): Promise<boolean> {
    setSaving(true);
    const res = await fetch("/api/speedrun/setup", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) { toast.error("Couldn't save your splits. Try again."); return false; }
    const d = (await res.json()) as { setup: SpeedrunSetupView };
    onSaved(d.setup);
    toast.success(ok);
    return true;
  }

  async function saveNames(names: string[] | null, cat: string | null, from: string) {
    if (!names) return;
    if (names.length > SPLITS_MAX) { toast.error(`${SPLITS_MAX} splits at most.`); return; }
    if (!(await okToReplace(names))) return;
    const saved = await patch({ splitNames: names, ...(cat ? { category: cat } : {}) }, `${names.length} split${names.length === 1 ? "" : "s"} saved.`);
    if (saved) track(EVENTS.speedrunSplitsSet, { from, game: gt?.game ?? "other" });
  }

  async function saveFile() {
    if (!file) return;
    if (!(await okToReplace(file.run.segments.map((s) => s.name)))) return;
    const saved = await patch({ importRun: file.run }, `${file.run.segments.length} splits saved from ${file.name}.`);
    if (saved) { track(EVENTS.speedrunSplitsSet, { from: "file", game: "file" }); setFile(null); }
  }

  const dl = (names: string[] | null, cat: string, from: string) => {
    if (!names?.length) return;
    download(game, cat, names);
    track(EVENTS.speedrunSplitsDownloaded, { from });
  };

  const builder = (
    <div className="sr-nb">
      <div className="sr-nb__row">
        <Input id="sr-nb-name" floatingLabel="Name" value={nb.name} maxLength={100} autoComplete="off" placeholder="Kingdom" onChange={(e) => setNb((s) => ({ ...s, name: e.target.value }))} />
        <Input id="sr-nb-from" floatingLabel="From" inputMode="numeric" value={nb.from} maxLength={3} autoComplete="off" onChange={(e) => setNb((s) => ({ ...s, from: e.target.value.replace(/[^0-9]/g, "") }))} />
        <Input id="sr-nb-to" floatingLabel="To" inputMode="numeric" value={nb.to} maxLength={3} autoComplete="off" onChange={(e) => setNb((s) => ({ ...s, to: e.target.value.replace(/[^0-9]/g, "") }))} />
      </div>
      <Input id="sr-nb-last" floatingLabel="Last split (optional)" value={nb.last} maxLength={120} autoComplete="off" fullWidth onChange={(e) => setNb((s) => ({ ...s, last: e.target.value }))} />
      {numbered ? <Preview names={numbered} /> : <p className="sr-sub">Give the splits a name, like World or Chapter, and the numbers to count from and to.</p>}
      <div className="sr-tpl-acts">
        <Button variant="primary" size="small" disabled={!numbered || saving} onClick={() => void saveNames(numbered, null, "numbers")}>Use these splits</Button>
        <Button variant="secondary" size="small" iconBefore={IconDownload} disabled={!numbered} onClick={() => dl(numbered, category, "numbers")}>Download for LiveSplit</Button>
      </div>
      <p className="sr-sub">Then rename any of them under Type them.</p>
    </div>
  );

  const templateTab = (
    <div className="sr-tpl">
      {!game.trim() ? (
        <p className="sr-sub">Pick your game under Your run to see its ready-made lists, or number your splits here.</p>
      ) : gt ? null : tpls?.game === game.trim() ? (
        <p className="sr-sub">No ready-made list for {game} yet. Number your splits, type them, or bring your LiveSplit file.</p>
      ) : null}
      {gt && tpl && built ? (
        <>
          <div className="sr-tpl-grid" role="group" aria-label="Templates">
            {gt.templates.map((t) => (
              <Card key={t.id} variant="outlined" padding="none" interactive selected={t.id === tpl.id} onClick={() => setTplId(t.id)} className="sr-tpl-card" aria-pressed={t.id === tpl.id}>
                <span className="sr-tpl-card__in"><b>{t.name}</b><small>{t.note}</small></span>
              </Card>
            ))}
          </div>
          {tpl.pickCup && (
            <Select id="sr-tpl-cup" floatingLabel="Cup" fullWidth value={String(cup)} onChange={(v) => setCup(Number(Array.isArray(v) ? v[0] : v))}
              options={tpl.groups.map((g, i) => ({ value: String(i), label: g.group ?? `Group ${i + 1}` }))} />
          )}
          {tpl.byCup && (
            <div className="sr-tpl-row" role="group" aria-labelledby="sr-tpl-on">
              <span className="sr-field-label" id="sr-tpl-on">Split on</span>
              <div className="sr-tpl-chips">
                <Chip clickable selected={!byCup} onClick={() => setByCup(false)} label="Every track" />
                <Chip clickable selected={byCup} onClick={() => setByCup(true)} label="Every cup" />
              </div>
            </div>
          )}
          {(gt.speeds.length > 0 || gt.items) && (
            <div className="sr-tpl-row" role="group" aria-labelledby="sr-tpl-cat">
              <span className="sr-field-label" id="sr-tpl-cat">{gt.items ? "Speed and items" : "Speed"}</span>
              <div className="sr-tpl-chips">
                {gt.speeds.map((s) => <Chip key={s} clickable selected={speed === s} onClick={() => setSpeed(speed === s ? null : s)} label={s} />)}
                {gt.items && <>
                  <Chip clickable selected={items === true} onClick={() => setItems(items === true ? null : true)} label="Items" />
                  <Chip clickable selected={items === false} onClick={() => setItems(items === false ? null : false)} label="No items" />
                </>}
              </div>
            </div>
          )}
          <p className="sr-tpl-cat">Category: <b>{built.category}</b>{category && category !== built.category ? <span className="sr-sub"> (now {category})</span> : null}</p>
          <Preview names={built.names} />
          <div className="sr-tpl-acts">
            <Button variant="primary" size="small" disabled={saving} onClick={() => void saveNames(built.names, built.category, `template:${tpl.id}`)}>Use these splits</Button>
            <Button variant="secondary" size="small" iconBefore={IconDownload} onClick={() => dl(built.names, built.category, "template")}>Download for LiveSplit</Button>
          </div>
          <p className="sr-sub">{built.count} splits. Rename or remove any of them under Type them after you save. Repeated track names get their console, the way the game shows them.</p>
          <Accordion variant="flush" className="sr-acc" items={[{ id: "numbers", title: "Number them instead", content: builder }]} />
        </>
      ) : builder}
    </div>
  );

  const typeTab = (
    <div className="sr-splits">
      <Textarea id="sr-splits" floatingLabel="One split per line" value={text} rows={8} fullWidth onChange={(e) => setText(e.target.value)} aria-describedby="sr-splits-help" />
      <p className="sr-sub" id="sr-splits-help">Times start fresh when the names change. To group splits the way LiveSplit does, start a line with - and name the group&apos;s last split {"{Group} Name"}.</p>
      <div className="sr-tpl-acts">
        <Button variant="primary" size="small" disabled={!typed || saving} onClick={() => void saveNames(typed, null, "typed")}>Save splits</Button>
        <Button variant="secondary" size="small" iconBefore={IconDownload} disabled={!typed} onClick={() => dl(typed, category, "typed")}>Download for LiveSplit</Button>
      </div>
    </div>
  );

  const pick = (e: ChangeEvent<HTMLInputElement>) => { void readFile(e.target.files?.[0]); e.target.value = ""; };
  const drop = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files?.[0]); };
  const r = file?.run;
  const pb = r?.segments.at(-1)?.pbMs ?? null;
  const sob = r?.segments.at(-1)?.bestMs ?? null;
  const fileTab = (
    <div className="sr-file">
      {/* A drop area for one file: CascadeDS has none (the Logos page's shape). */}
      <label className={`sr-drop${dragging ? " is-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <IconFileUpload size={28} aria-hidden="true" />
        <b>Drop your splits file (.lss)</b>
        <span>or choose it. LiveSplit and LiveSplit One both save one.</span>
        <input type="file" accept=".lss,application/xml,text/xml" className="sr-drop__input" onChange={pick} />
      </label>
      {fileError && <p className="sr-sub sr-file__err" role="alert">{fileError}</p>}
      {r && file && (
        <div className="sr-file__read">
          <b>{[r.game, r.category].filter(Boolean).join(" · ") || "Your splits file"}</b>
          <span className="sr-sub">from {file.name}</span>
          <dl>
            <div><dt>Splits</dt><dd>{r.segments.length}</dd></div>
            <div><dt>PB</dt><dd>{pb != null ? fmtClock(pb) : "None yet"}</dd></div>
            <div><dt>Sum of best</dt><dd>{sob != null ? fmtClock(sob) : "-"}</dd></div>
            <div><dt>Attempts</dt><dd>{r.attempts.toLocaleString("en-US")}</dd></div>
          </dl>
          <p className="sr-sub">{r.segments.slice(0, 5).map((s) => shownName(s.name)).join(", ")}{r.segments.length > 5 ? "…" : ""}</p>
          <div className="sr-tpl-acts">
            <Button variant="primary" size="small" disabled={saving} onClick={() => void saveFile()}>Use this file</Button>
            <Button variant="ghost" size="small" onClick={() => setFile(null)}>Cancel</Button>
          </div>
          <p className="sr-sub">Your PB and best splits come with it, so ahead and behind show from your first run here. The game and category come along too{r.attempts > view.attempts ? ", and the attempt count" : ""}.</p>
        </div>
      )}
    </div>
  );

  const summary = view.splits.length
    ? `${view.splits.length} split${view.splits.length === 1 ? "" : "s"}${view.splitsTimed ? " from your timer" : ""}: ${view.splits.slice(0, 4).map(shownName).join(", ")}${view.splits.length > 4 ? "…" : "."}`
    : "No splits yet.";

  return (
    <>
      <p className="sr-sub">{summary} The phone remote and the overlay use these until your timer connects; your timer&apos;s own splits take over whenever it does.</p>
      <Tabs variant="pills" size="small" className="sr-ways" activeTab={way} onChange={(id) => setWay(id as Way)}
        tabs={[
          { id: "template", label: "Start from a template", content: templateTab },
          { id: "type", label: "Type them", content: typeTab },
          { id: "file", label: "Bring a LiveSplit file", content: fileTab },
        ]} />
    </>
  );
}

