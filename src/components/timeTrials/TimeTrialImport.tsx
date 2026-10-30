"use client";

/**
 * Bring your times (picks 2026-10-29: 5A, and the migration picks 1A-6A). The Discord way first:
 * Save to GameShuffle on Quaxly's reply, with "Add to my apps" so it works in any server. Then
 * screenshots of Quaxly's reply (phones can't copy an embed) or a paste. Every row is checked before
 * anything saves: ticked when it's readable, yours, under the world record and faster than what's
 * saved; the others say why. A list read in Discord opens here with ?d=.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Chip, FormField, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@empac/cascadeds";
import { IconBrandDiscord, IconPhoto } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { TableScroll } from "@/components/ui/TableScroll";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { track as trackEvent, EVENTS } from "@/lib/analytics/events";
import { formatTime } from "@/lib/timeTrials/rules";
import { bestPerTrack } from "@/lib/timeTrials/importText";
import type { CheckRow } from "@/lib/timeTrials/importRows";
import { gamePath, TT_GAMES, TT_GAME_ORDER, ttCups, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtItems } from "@/lib/timeTrials/categories";

const ERRORS: Record<string, string> = {
  empty: "Paste your times or add screenshots first.",
  cap: "We've read all the lists we can for you today. The rows below are what we could read without AI.",
  failed: "We couldn't read that. Try a paste with one time per line, like \"DK Spaceport 1:52.384\".",
  not_configured: "Reading with AI is off right now. Paste the list instead.",
  slow_down: "That's a lot of reading. Wait a few minutes and try again.",
  signin: "Sign in to import your times.",
  not_ready: "Time trials aren't open yet. Try again soon.",
  nothing_read: "We couldn't find times in those screenshots. Make sure they show Quaxly's list.",
  bad_image: "We couldn't open those pictures. Use PNG, JPEG or WebP screenshots.",
  bad_type: "Use PNG, JPEG or WebP screenshots.",
  too_big: "One of those pictures is over 8 MB.",
  gone: "That list from Discord has expired. Use Save to GameShuffle on Quaxly's reply again.",
  not_yours: "That list was read for a different Discord account.",
};

type Got = { ok?: boolean; game?: TtGame; rows?: CheckRow[]; title?: string | null; holders?: boolean; ai?: boolean; items?: TtItems; error?: string };

function noteText(r: CheckRow): string | null {
  switch (r.note) {
    case "others": return r.holder ? `${r.holder}'s time` : "Someone else's time";
    case "record": return "Faster than the world record";
    case "already": return r.savedMs != null ? `You have ${formatTime(r.savedMs)}` : "Already saved";
    case "duplicate": return "A faster time for this track is in the list";
    case "unclear": return r.timeMs ? "Pick the track" : "Couldn't read the time";
    default: return r.holder ? "Yours" : null;
  }
}

export function TimeTrialImport({ discordAppId, draftId }: { discordAppId: string | null; draftId?: string | null }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [game, setGame] = useState<TtGame>("mk8dx");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const [meta, setMeta] = useState<{ title: string | null; holders: boolean; ai: boolean; items: TtItems; from: "paste" | "screenshots" | "discord" } | null>(null);
  const [busy, setBusy] = useState<"read" | "shots" | "save" | "draft" | null>(draftId ? "draft" : null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ saved: number; already: number; refused: number } | null>(null);
  const groups = useMemo(() => ttCups(game).map((c) => ({ label: c.cup, options: c.tracks.map((t) => ({ value: t.id, label: t.name })) })), [game]);
  const classes = TT_GAMES[game].classes;
  const command = game === "mk8dx" ? "/dx display_time" : "/display_time";

  function take(j: Got, from: "paste" | "screenshots" | "discord") {
    if (j.error) setError(ERRORS[j.error] ?? ERRORS.failed);
    if (j.game) setGame(j.game);
    const list = j.rows ?? [];
    setRows(list.length ? list : null);
    setMeta({ title: j.title ?? null, holders: !!j.holders, ai: !!j.ai, items: j.items ?? "shrooms", from });
    if (!list.length && !j.error) setError("We didn't find any times in that. Each time needs its track, like \"MKS: 1:36.990\".");
  }

  // A list read in Discord with Save to GameShuffle.
  useEffect(() => {
    if (!draftId) return;
    let live = true;
    void fetch(`/api/time-trials/import?d=${encodeURIComponent(draftId)}`).then((r) => r.json()).catch(() => ({ error: "failed" })).then((j: Got) => {
      if (!live) return;
      take(j, "discord");
      setBusy(null);
    });
    return () => { live = false; };
  }, [draftId]);

  async function readPaste() {
    setError(null); setSaved(null);
    if (!text.trim()) { setError(ERRORS.empty); return; }
    setBusy("read");
    try {
      const res = await fetch("/api/time-trials/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, game }) });
      take((await res.json().catch(() => ({ error: "failed" }))) as Got, "paste");
    } finally {
      setBusy(null);
    }
  }

  async function readScreenshots(files: FileList) {
    setError(null); setSaved(null);
    const list = [...files].slice(0, 8);
    if (!list.length) return;
    setBusy("shots");
    try {
      const form = new FormData();
      form.set("game", game);
      for (const f of list) form.append("files", f);
      const res = await fetch("/api/time-trials/import", { method: "POST", body: form });
      take((await res.json().catch(() => ({ error: "failed" }))) as Got, "screenshots");
    } finally {
      setBusy(null);
    }
  }

  function update(i: number, patch: Partial<CheckRow>) {
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const ready = (rows ?? []).filter((r) => r.keep && r.trackId && r.timeMs);
  const toSave = bestPerTrack(ready);
  const counts = useMemo(() => {
    const n = (note: CheckRow["note"]) => (rows ?? []).filter((r) => r.note === note).length;
    return { already: n("already"), others: n("others"), record: n("record"), unclear: n("unclear") };
  }, [rows]);

  async function save() {
    setBusy("save"); setError(null);
    try {
      const res = await fetch("/api/time-trials/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, items: meta?.items ?? "shrooms", rows: toSave.map((r) => ({ track: r.trackId, cc: r.cc, time: r.timeMs })) }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; saved?: number; already?: number; refused?: number; error?: string };
      if (!res.ok || !j.ok) { setError(ERRORS[j.error ?? ""] ?? "Those times couldn't be saved. Try again."); return; }
      setSaved({ saved: j.saved ?? 0, already: j.already ?? 0, refused: j.refused ?? 0 });
      trackEvent(EVENTS.ttImported, { game, count: j.saved ?? 0, from: meta?.from ?? "paste" });
      setRows(null); setText(""); setMeta(null);
    } finally {
      setBusy(null);
    }
  }

  const installUrl = discordAppId ? `https://discord.com/oauth2/authorize?client_id=${discordAppId}&integration_type=1&scope=applications.commands` : null;

  return (
    <div className="tt-import">
      <div className="tt-add__field" role="group" aria-labelledby={`${id}-game`}>
        <span id={`${id}-game`} className="tt-add__label">Game</span>
        <div className="tt-add__chips">
          {TT_GAME_ORDER.map((g) => <Chip key={g} label={TT_GAMES[g].label} clickable selected={g === game} onClick={() => { setGame(g); setRows(null); setMeta(null); }} />)}
        </div>
      </div>

      <section className="tt-import__quaxly" aria-labelledby={`${id}-quaxly`}>
        <h2 id={`${id}-quaxly`}>From Quaxly</h2>
        <p className="tt-note">
          In Discord, run <code>{command}</code> with yourself as the player{classes.length > 1 ? " (once for 150cc, once for 200cc)" : ""}. Then press and hold Quaxly&apos;s reply (right-click on a computer), tap Apps, and pick <b>Save to GameShuffle</b>.
        </p>
        {installUrl && (
          <div className="tt-import__install">
            <Button variant="primary" iconBefore={IconBrandDiscord} onClick={() => { trackEvent(EVENTS.discordAddClicked, { from: "time-trials-import" }); window.open(installUrl, "_blank", "noopener"); }}>Add to my apps</Button>
            <span className="tt-note">Adds GameShuffle to your Discord account, so Save to GameShuffle works in any server.</span>
          </div>
        )}
      </section>

      <section className="tt-import__other" aria-labelledby={`${id}-other`}>
        <h2 id={`${id}-other`}>Or bring the list here</h2>
        <p className="tt-note">Add screenshots of Quaxly&apos;s reply (scroll and take a few for a long list), or paste it. A spreadsheet or any list with track names works too.</p>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { if (e.target.files?.length) void readScreenshots(e.target.files); e.target.value = ""; }} />
        <div className="tt-add__actions">
          <Button variant="secondary" iconBefore={IconPhoto} onClick={() => fileRef.current?.click()} loading={busy === "shots"} disabled={!!busy && busy !== "shots"}>Add screenshots</Button>
        </div>
        <FormField label="Or paste it" htmlFor={`${id}-text`}>
          <Textarea id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={12000} fullWidth placeholder={"150cc Shrooms\nMKS: 1:36.990\nWP: 1:40.640"} />
        </FormField>
        <div className="tt-add__actions">
          <Button variant="primary" onClick={() => void readPaste()} loading={busy === "read"} disabled={!!busy && busy !== "read"}>Read my times</Button>
        </div>
      </section>

      {busy === "draft" && <p className="tt-note" role="status">Opening the list you read in Discord…</p>}
      {error && <Alert variant={rows?.length ? "warning" : "error"}>{error}</Alert>}
      {saved && (
        <Alert variant="success" title={saved.saved ? `Saved ${saved.saved} ${saved.saved === 1 ? "time" : "times"}` : "Nothing new to save"}>
          {saved.already ? `${saved.already} ${saved.already === 1 ? "was" : "were"} already there. ` : ""}
          {saved.refused ? `${saved.refused} ${saved.refused === 1 ? "was" : "were"} faster than the world record and stayed out. ` : ""}
          <ArrowLink href={gamePath(game)}>See your times</ArrowLink>
        </Alert>
      )}

      {rows && rows.length > 0 && (
        <section className="tt-import__rows" aria-labelledby={`${id}-check`}>
          <h2 id={`${id}-check`}>Check what we read</h2>
          <p className="tt-note">
            {meta?.title ? <>{meta.title}. </> : null}
            {meta ? <>These go on the {meta.items === "none" ? "no mushrooms" : "mushrooms"} boards. </> : null}
            {meta?.ai ? "We read this with AI, so check each row. " : ""}
            {toSave.length} {toSave.length === 1 ? "time is" : "times are"} ticked to save.
            {counts.already ? ` ${counts.already} you already have.` : ""}
            {meta?.holders && counts.others ? ` ${counts.others} ${counts.others === 1 ? "is" : "are"} under other names.` : ""}
          </p>
          <TableScroll label="Times read from your list">
            <Table className="tt-import__table">
              <TableHeader>
                <TableRow>
                  <TableHead><span className="sr-only">Save</span></TableHead>
                  <TableHead>Track</TableHead>
                  {classes.length > 1 && <TableHead>Class</TableHead>}
                  <TableHead>Time</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const locked = !r.trackId || !r.timeMs || r.note === "record" || r.note === "already";
                  return (
                    <TableRow key={i} className={r.keep ? undefined : "tt-import__row--off"}>
                      <TableCell><Checkbox checked={r.keep} disabled={locked} onChange={(e) => update(i, { keep: e.target.checked })} aria-label={`Save ${r.trackName ?? r.trackText ?? "this row"}`} /></TableCell>
                      <TableCell>
                        {r.trackId ? r.trackName : (
                          <Select value="" onChange={(v) => { const t = String(v); const name = groups.flatMap((g) => g.options).find((o) => o.value === t)?.label ?? null; update(i, { trackId: t || null, trackName: name, keep: !!(t && r.timeMs), note: null }); }} groups={groups} placeholder={r.trackText ? `"${r.trackText.slice(0, 30)}": pick the track` : "Pick the track"} searchable aria-label="Track" />
                        )}
                      </TableCell>
                      {classes.length > 1 && (
                        <TableCell>
                          <Select value={String(r.cc)} onChange={(v) => update(i, { cc: Number(v) as TtClass })} options={classes.map((c) => ({ value: String(c), label: `${c}cc` }))} aria-label="Speed class" />
                        </TableCell>
                      )}
                      <TableCell className="tt-board__time">{r.timeMs ? formatTime(r.timeMs) : <span className="tt-muted">Couldn&apos;t read</span>}</TableCell>
                      <TableCell className="tt-import__note">{noteText(r)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableScroll>
          <div className="tt-add__actions">
            <Button variant="primary" onClick={() => void save()} loading={busy === "save"} disabled={!toSave.length}>
              Save {toSave.length} {toSave.length === 1 ? "time" : "times"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
