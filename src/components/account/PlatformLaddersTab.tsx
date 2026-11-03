"use client";

/**
 * Platform ▸ Community ▸ GS Ranked (history import picks 2026-11-01, https://claude.ai/artifact/8DkgY7VZgHqRH1HkiQf9Un,
 * pick 10A: GameShuffle staff run imports for the first lounges). Every ladder with its numbers, every import with
 * Undo, and bringing in a lounge's history: choose the files, read them here in the browser (nothing large is
 * uploaded), check what's in them, then write them in pieces (/api/admin/ladders/import).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, Progress, Radio, RadioGroup, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconAlertTriangle, IconCheck, IconFileImport, IconMinus } from "@tabler/icons-react";
import { AdminScreen, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { isLoungeBotDump, readLoungeBotDump, readTemplate, seasonFromName, type SeasonSource } from "@/lib/ladders/importRead";
import { planImport, type ExistingPlayer, type ImportPlan } from "@/lib/ladders/importPlan";
import type { ImportRow } from "@/lib/ladders/importStore";
import { ladderPath } from "@/lib/ladders/types";

type LadderRow = { id: string; slug: string; name: string; mode: string; rules: string; season: number; status: string; tables: number; players: number };
type Loaded = { ok: true; importReady: boolean; ladders: LadderRow[]; imports: ImportRow[] } | { ok: false; error: string };

const n = (v: number) => v.toLocaleString("en-US");
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : "");
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function PlatformLaddersTab() {
  const [data, setData] = useState<Loaded | null>(null);
  const [target, setTarget] = useState("");
  const toast = useToast();
  const confirm = useConfirm();
  const importRef = useRef<HTMLDivElement>(null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/ladders", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ ok: false, error: "failed" })).then((r) => { if (alive) setData(r as Loaded); });
    return () => { alive = false; };
  }, [version]);

  const undo = async (imp: ImportRow, ladder: string) => {
    const yes = await confirm({ title: `Undo this import into ${ladder}?`, body: `It removes Seasons ${imp.seasons.join(", ")} as imported: ${n(imp.counts.tables ?? 0)} tables and their changes, penalties, standings, and players who have nothing else on the lounge. The lounge's season and settings go back to how they were.`, confirmLabel: "Undo the import" });
    if (!yes) return;
    const r = await fetch("/api/admin/ladders/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo", importId: imp.id }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (r.ok) { toast.success("Import undone"); load(); }
    else toast.error(r.error === "own_tables" ? "Tables have been played on GameShuffle in those seasons since, so the import can't be undone." : "Couldn't undo the import.");
  };

  if (!data) return <AdminScreen title="GS Ranked" intro="Lounges on GS Ranked and their history."><p>Loading…</p></AdminScreen>;
  if (!data.ok) return <AdminScreen title="GS Ranked" intro="Lounges on GS Ranked and their history."><Alert variant="warning">{data.error === "not_ready" ? "The GS Ranked tables aren't in this database yet (ladders-m1.sql)." : "Couldn't load the ladders."}</Alert></AdminScreen>;
  const names = new Map(data.ladders.map((l) => [l.id, l.name]));

  return (
    <AdminScreen title="GS Ranked" intro="Lounges on GS Ranked, and bringing a lounge's history in.">
      <AdminSection title="Lounges">
        {data.ladders.length ? (
          <AdminTable label="Lounges">
            <Table>
              <TableHeader><TableRow><TableHead>Lounge</TableHead><TableHead>Mode</TableHead><TableHead>Rules</TableHead><TableHead align="right">Season</TableHead><TableHead align="right">Tables</TableHead><TableHead align="right">Players</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.ladders.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell><Link href={ladderPath(l.slug)}>{l.name}</Link></TableCell>
                    <TableCell>{l.mode}</TableCell>
                    <TableCell>{l.rules}</TableCell>
                    <TableCell align="right">{l.season}</TableCell>
                    <TableCell align="right">{n(l.tables)}</TableCell>
                    <TableCell align="right">{n(l.players)}</TableCell>
                    <TableCell><Button size="small" variant="ghost" onClick={() => { setTarget(l.id); importRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Import history</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        ) : <p>No lounges yet. A lounge sets up with <code>/ranked setup</code> in its Discord server.</p>}
      </AdminSection>

      {data.imports.length > 0 && (
        <AdminSection title="Imports">
          <AdminTable label="Imports">
            <Table>
              <TableHeader><TableRow><TableHead>Lounge</TableHead><TableHead>Seasons</TableHead><TableHead align="right">Tables</TableHead><TableHead align="right">Players</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.imports.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{names.get(i.ladderId) ?? "A lounge"}</TableCell>
                    <TableCell>{i.seasons.join(", ")}</TableCell>
                    <TableCell align="right">{n(i.counts.tables ?? 0)}</TableCell>
                    <TableCell align="right">{n(i.counts.players ?? 0)}</TableCell>
                    <TableCell>{{ writing: "Writing", done: "Imported", undone: "Undone", failed: "Failed, removed" }[i.status]}</TableCell>
                    <TableCell>{when(i.createdAt)}{i.createdByName ? ` by ${i.createdByName}` : ""}</TableCell>
                    <TableCell>{i.status === "done" && <Button size="small" variant="ghost" onClick={() => void undo(i, names.get(i.ladderId) ?? "the lounge")}>Undo</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        </AdminSection>
      )}

      <div ref={importRef}>
        <AdminSection title="Bring in a lounge's history" icon={<IconFileImport size={20} stroke={2} />}
          intro="The 200cc Lounge bot's season exports (.sql) as they are, or our CSV template for any other lounge. Files are read here in your browser; nothing is saved until you press Import.">
          {data.importReady
            ? <ImportFlow ladders={data.ladders} target={target} onTarget={setTarget} onDone={load} />
            : <Alert variant="warning">Imports need ladders-m2.sql in this database first.</Alert>}
        </AdminSection>
      </div>
    </AdminScreen>
  );
}

type FileEntry = { name: string; text: string; season: string; kind: "dump" | "csv" };
type Step = "pick" | "checked" | "writing" | "done";

function ImportFlow({ ladders, target, onTarget, onDone }: { ladders: LadderRow[]; target: string; onTarget: (id: string) => void; onDone: () => void }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [own, setOwn] = useState<number[]>([]);
  const [carry, setCarry] = useState("next");
  const [step, setStep] = useState<Step>("pick");
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const ladder = ladders.find((l) => l.id === target) ?? null;

  const reset = () => { setPlan(null); setStep("pick"); setProblem(null); setProgress(0); };

  const addFiles = async (list: FileList) => {
    const read = await Promise.all([...list].slice(0, 12).map(async (f) => {
      const text = await f.text();
      const kind: FileEntry["kind"] = /\.csv$/i.test(f.name) ? "csv" : "dump";
      return { name: f.name, text, season: kind === "dump" ? String(seasonFromName(f.name) ?? "") : "", kind };
    }));
    setFiles((cur) => [...cur.filter((c) => !read.some((r) => r.name === c.name)), ...read]);
    reset();
  };

  const sources = (): SeasonSource[] | string => {
    const dumps = files.filter((f) => f.kind === "dump");
    const csvs = files.filter((f) => f.kind === "csv");
    const out: SeasonSource[] = [];
    for (const f of dumps) {
      if (!isLoungeBotDump(f.text)) return `${f.name} isn't the 200cc Lounge bot's export (no mogi or player_mogi tables in it).`;
      const s = readLoungeBotDump(f.text, f.name);
      const season = Number(f.season);
      out.push({ ...s, season: Number.isInteger(season) && season > 0 ? season : s.season });
    }
    if (csvs.length) {
      const pick = (word: string) => csvs.find((c) => c.name.toLowerCase().includes(word));
      const p = pick("player"), t = pick("table"), r = pick("result");
      if (!p || !t || !r) return "The CSV template needs three files: players, tables and results (their names should say which).";
      out.push(...readTemplate({ players: p.text, tables: t.text, results: r.text }, { players: p.name, tables: t.name, results: r.name }));
    }
    return out;
  };

  const check = async () => {
    if (!ladder) return;
    setBusy(true); setProblem(null);
    try {
      const src = sources();
      if (typeof src === "string") { setProblem(src); return; }
      if (!src.length) { setProblem("Choose a file first."); return; }
      const r = await fetch(`/api/admin/ladders?players=${ladder.id}`, { cache: "no-store" }).then((x) => x.json());
      if (!r.ok) { setProblem("Couldn't read the lounge's players."); return; }
      const p = planImport(src, r.players as ExistingPlayer[]);
      setOwn((r.ownSeasons as number[]) ?? []);
      setPlan(p);
      setCarry("next");
      setStep("checked");
    } catch (e) {
      console.error(e);
      setProblem("Couldn't read those files.");
    } finally { setBusy(false); }
  };

  const blocked = plan ? plan.seasons.filter((s) => own.includes(s.season)).map((s) => s.season) : [];

  const run = async () => {
    if (!plan || !ladder) return;
    const yes = await confirm({ title: `Import ${plan.seasons.length === 1 ? `Season ${plan.seasons[0].season}` : `${plan.seasons.length} seasons`} into ${ladder.name}?`, body: `${n(plan.counts.tables)} tables, ${n(plan.counts.players)} players. You can undo it from the Imports list.`, confirmLabel: "Import" });
    if (!yes) return;
    setStep("writing"); setProgress(0); setProblem(null);
    const post = (body: Record<string, unknown>) => fetch("/api/admin/ladders/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ladderId: ladder.id, ...body }) }).then(async (x) => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    let importId: string | null = null;
    try {
      const start = await post({ action: "start", seasons: plan.seasons.map((s) => s.season), files: files.map((f) => f.name), counts: plan.counts, tables: plan.tables.length, players: plan.players });
      if (!start.ok) throw new Error(start.error === "own_tables" ? `Seasons ${(start.seasons ?? []).join(", ")} have tables played on GameShuffle.` : start.message || "Couldn't start the import.");
      importId = start.importId as string;
      const ids = start.playerIds as string[];
      const first = start.firstNumber as number;
      const total = plan.tables.length + Math.ceil((plan.adjustments.length + plan.ratings.length) / 4000);
      let done = 0;
      for (let k = 0; k < plan.tables.length; k += 300) {
        const tables = plan.tables.slice(k, k + 300).map((t, j) => ({
          number: first + k + j, season: t.season, ref: t.ref, at: t.at, format: t.format, tier: t.tier, body: t.body, teamsKnown: t.teamsKnown,
          results: t.results.map((r) => ({ playerId: ids[r.p], team: r.team, place: r.place, score: r.score, before: r.before, delta: r.delta, after: r.after })),
        }));
        const r = await post({ action: "tables", importId, tables });
        if (!r.ok) throw new Error(`Tables: ${r.error ?? "failed"}`);
        done += tables.length; setProgress(Math.round((done / total) * 100));
      }
      const adj = plan.adjustments.map((a) => ({ season: a.season, playerId: ids[a.p], at: a.at, before: a.before, delta: a.delta, after: a.after, kind: a.kind }));
      const rat = plan.ratings.map((r) => ({ season: r.season, playerId: ids[r.p], mmr: r.mmr, peak: r.peak, events: r.events, wins: r.wins, last: r.last }));
      for (let k = 0; k < Math.max(adj.length, rat.length); k += 2000) {
        const r = await post({ action: "extras", importId, adjustments: adj.slice(k, k + 2000), ratings: rat.slice(k, k + 2000) });
        if (!r.ok) throw new Error(`Penalties and standings: ${r.error ?? "failed"}`);
        done += 1; setProgress(Math.min(99, Math.round((done / total) * 100)));
      }
      const fin = await post({ action: "finish", importId, seasons: plan.seasons.map((s) => ({ season: s.season, from: s.from, to: s.to })), carryOn: carry === "carry", rules: plan.rules, divisions: plan.divisions });
      if (!fin.ok) throw new Error(`Finishing: ${fin.error ?? "failed"}`);
      setProgress(100); setStep("done");
      toast.success(`Imported into ${ladder.name}`);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The import failed.";
      if (importId) await post({ action: "fail", importId }).catch(() => null);
      setProblem(`${msg} Nothing from this import was kept.`);
      setStep("checked");
    }
  };

  const newest = plan ? Math.max(...plan.seasons.map((s) => s.season)) : 0;
  const ladderOptions = useMemo(() => [{ value: "", label: "Choose a lounge" }, ...ladders.map((l) => ({ value: l.id, label: `${l.name} · ${l.mode}` }))], [ladders]);

  return (
    <div className="ladder-import">
      <div className="ladder-import__pick">
        <Select floatingLabel="Into lounge" options={ladderOptions} value={target} onChange={(v) => { onTarget(String(v)); reset(); }} />
        <div>
          <input ref={fileRef} type="file" accept=".sql,.csv,.txt" multiple hidden onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Choose files</Button>
        </div>
      </div>

      {files.length > 0 && (
        <ul className="ladder-import__files">
          {files.map((f) => (
            <li key={f.name}>
              <span className="ladder-import__file">{f.name} <small>{(f.text.length / 1e6).toFixed(1)} MB</small></span>
              {f.kind === "dump" && (
                <span className="ladder-import__season"><Input floatingLabel="Season" type="number" size="small" value={f.season} onChange={(e) => { const v = e.target.value; setFiles((cur) => cur.map((c) => (c.name === f.name ? { ...c, season: v } : c))); reset(); }} /></span>
              )}
              <Button size="small" variant="ghost" onClick={() => { setFiles((cur) => cur.filter((c) => c.name !== f.name)); reset(); }}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <p className="ladder-import__help">CSV template: <a href="/templates/ladder-import/players.csv">players</a>, <a href="/templates/ladder-import/tables.csv">tables</a>, <a href="/templates/ladder-import/results.csv">results</a>.</p>

      {problem && <Alert variant="error">{problem}</Alert>}

      {step === "pick" && <div><Button variant="primary" disabled={!ladder || !files.length} loading={busy} onClick={() => void check()}>Check the files</Button></div>}

      {plan && step !== "pick" && (
        <div className="ladder-import__check">
          <AdminStats columns={4} label="What's in the files">
            <StatCard label="Seasons" value={plan.seasons.length > 1 ? `${plan.seasons[0].season} to ${newest}` : String(plan.seasons[0]?.season ?? "")} />
            <StatCard label="Tables" value={n(plan.counts.tables)} />
            <StatCard label="Players" value={n(plan.counts.players)} />
            <StatCard label="Results" value={n(plan.counts.results)} />
          </AdminStats>

          <AdminTable label="Seasons">
            <Table>
              <TableHeader><TableRow><TableHead>Season</TableHead><TableHead>Dates</TableHead><TableHead align="right">Tables</TableHead><TableHead align="right">Players</TableHead><TableHead>Formula check</TableHead></TableRow></TableHeader>
              <TableBody>
                {plan.seasons.map((s) => (
                  <TableRow key={s.season}>
                    <TableCell>{s.season}</TableCell>
                    <TableCell>{day(s.from)} to {day(s.to)}</TableCell>
                    <TableCell align="right">{n(s.tables)}</TableCell>
                    <TableCell align="right">{n(s.players)}</TableCell>
                    <TableCell>{formulaLine(s.check, plan.rules)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>

          <ul className="ladder-import__checks">
            {plan.divisions.length > 0 && <Check ok>Divisions: {plan.divisions.map((d) => `${d.name} ${n(d.at)}`).join(", ")}.</Check>}
            {plan.rules === "lounge200" && <Check ok>New tables will use the 200 Lounge rules, and new players are placed by their first table&apos;s score.</Check>}
            <Check ok>Teams: {n(plan.counts.teamsFromPlaces)} tables read from places{plan.counts.tiesSorted ? `; ${n(plan.counts.tiesSorted)} tied places sorted out by the shared change` : ""}.</Check>
            {plan.counts.teamsUnclear > 0 && <Check>{n(plan.counts.teamsUnclear)} tables where teams can&apos;t be told apart: they show tied teams together.</Check>}
            {plan.counts.gaps + plan.counts.seasonEnds > 0 && <Check>{n(plan.counts.gaps + plan.counts.seasonEnds)} moves outside tables become Penalty or Bonus lines.</Check>}
            {plan.counts.nameClashes > 0 && <Check>{n(plan.counts.nameClashes)} names used by two players: whoever played most recently keeps it, the other gets a number added.</Check>}
            {plan.counts.matchedPlayers > 0 && <Check ok>{n(plan.counts.matchedPlayers)} players are already on this lounge (matched by Discord).</Check>}
            {plan.counts.skippedTables > 0 && <Check>{n(plan.counts.skippedTables)} tables in the files have no results (taken back by staff) and are left out.</Check>}
            {plan.counts.bodiesOff > 0 && <Check>{n(plan.counts.bodiesOff)} tables whose names don&apos;t read back cleanly; their pages may show a name without its change.</Check>}
            {plan.problems.map((p) => <Check key={p}>{p}</Check>)}
            <Check out>Left out: friend codes and MKCentral ids.</Check>
          </ul>

          {blocked.length > 0 ? (
            <Alert variant="error">Season{blocked.length > 1 ? "s" : ""} {blocked.join(", ")} already {blocked.length > 1 ? "have" : "has"} tables played on GameShuffle, so the import can&apos;t fill {blocked.length > 1 ? "them" : "it"}. Leave {blocked.length > 1 ? "those files" : "that file"} out, or give it another season number.</Alert>
          ) : (
            <>
              <RadioGroup name="ladder-import-after" label="After the import" value={carry} onChange={setCarry}>
                <Radio value="next" label={`Start Season ${newest + 1} on GameShuffle`} helperText={plan.rules === "lounge200" ? "Everyone is placed again on their first table, as on the lounge's bot." : "Everyone starts the new season fresh."} />
                <Radio value="carry" label={`Carry on Season ${newest}`} helperText={`Everyone keeps their Season ${newest} number.`} />
              </RadioGroup>
              {step === "writing" ? (
                <Progress value={progress} label="Importing" showLabel />
              ) : step === "done" ? (
                <Alert variant="success">Imported. <Link href={ladderPath(ladder?.slug ?? "")}>See the lounge</Link>.</Alert>
              ) : (
                <div className="ladder-import__acts">
                  <Button variant="primary" onClick={() => void run()}>Import {plan.seasons.length === 1 ? "1 season" : `${plan.seasons.length} seasons`}</Button>
                  <Button variant="secondary" onClick={reset}>Cancel</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formulaLine(c: { checked: number; matched: number; maxOff: number }, rules: ImportPlan["rules"]): string {
  if (rules !== "lounge200") return "Numbers as recorded";
  if (!c.checked) return "Nothing to check: numbers as recorded";
  if (c.matched === c.checked) return `All ${n(c.checked)} checked match`;
  if (c.matched / c.checked < 0.9) return "An older formula: numbers as recorded";
  return `${n(c.matched)} of ${n(c.checked)} checked match`;
}

function Check({ ok, out, children }: { ok?: boolean; out?: boolean; children: React.ReactNode }) {
  const Icon = out ? IconMinus : ok ? IconCheck : IconAlertTriangle;
  return <li className={out ? "is-out" : ok ? "is-ok" : "is-warn"}><Icon size={20} stroke={2} aria-hidden="true" /><span>{children}</span></li>;
}
