"use client";

/**
 * "You" on a lounge's page (name, web and docs pick 7A): what a player does in Discord, on the web too. Claim your name
 * (it gets your Discord), submit a table with a screenshot or typed (the same checks as Discord), ask for a new name,
 * and appeal a penalty. Staff get a link to the staff page. Signed out, one line points to sign in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Textarea } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { Select } from "@/components/ui/Select";
import { FORMATS, formatLabel, type LadderKind } from "@/lib/ladders/types";
import type { RoomIssue } from "@/lib/ladders/rules";
import type { OwnPenalty } from "@/lib/ladders/staffStore";
import type { RankedRole } from "@/lib/ladders/access";
import { fitPicture } from "@/lib/images/shrink";

interface Me {
  you: { name: string; role: RankedRole; staff: boolean; why: string | null; canSubmit: boolean; discord: boolean };
  player: { id: string; name: string; mmr: number | null; events: number; division: string | null; strikes: number; breakUntil: string | null; nameAsked: string | null } | null;
  penalties?: OwnPenalty[];
  waiting?: { id: string; title: string; createdAt: string }[];
}

interface Outcome { table: { id: string; number: number; title: string; autoAt: string | null; body: string }; issues: RoomIssue[]; notes: string[]; sent: boolean; postError: string | null; blocked: boolean }

const ERRORS: Record<string, string> = {
  empty: "Attach the results screenshot, or type the players and scores.",
  cap: "That's all the screenshots this lounge can read today. Type the table instead.",
  not_results: "That screenshot doesn't look like a results screen. Try another, or type the table.",
  read_failed: "The screenshot couldn't be read. Try again, or type the table.",
  too_big: "That picture is over 8 MB.",
  not_image: "Use a PNG, JPEG or WebP picture.",
  slow_down: "That's a lot of tables at once. Try again in a few minutes.",
  not_reporter: "Only reporters and updaters can submit tables on this lounge.",
  unknown: "Nobody on this lounge has that name. Check the spelling on the standings.",
  taken: "That name already has someone's Discord. Ask the lounge's staff if it's yours.",
  has_other: "Your Discord is already on another name here.",
  already: "You've already appealed that one.",
  sent: "That table was already sent; an updater can send it back.",
  not_pending: "That table isn't waiting any more.",
};
const errorText = (e?: string) => (e && ERRORS[e]) || "That didn't work. Try again in a moment.";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
const num = (n: number) => n.toLocaleString("en-US");

export function RankedYou({ ladderId, ladderName, kind, staffPath, signInPath }: { ladderId: string; ladderName: string; kind: LadderKind; staffPath: string; signInPath: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState<null | "submit" | "name" | { appeal: OwnPenalty }>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/ranked/${ladderId}/me`, { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401) { setSignedOut(true); return; }
        if (r.ok) setMe(await r.json());
      })
      .catch(() => null);
    return () => { alive = false; };
  }, [ladderId, version]);

  if (signedOut) {
    return (
      <section className="lounge-sec lounge-sec--flat ranked-you" aria-label="You on this lounge">
        <p className="ladder-note">Play on {ladderName}? Sign in with Discord to submit tables, see your penalties and change your name here.</p>
        <ArrowLink href={signInPath}>Sign in</ArrowLink>
      </section>
    );
  }
  if (!me) return null;
  const { you, player } = me;

  return (
    <section className="lounge-sec lounge-sec--flat ranked-you" aria-labelledby="ranked-you">
      <h2 id="ranked-you">You</h2>
      {!you.discord ? (
        <>
          <p className="ladder-note">Connect Discord to your account and we&apos;ll find your name on {ladderName}.</p>
          <div className="ranked-you__acts">
            <ArrowLink href="/account?tab=security">Connect Discord</ArrowLink>
            {you.staff && <ArrowLink href={staffPath}>Staff page</ArrowLink>}
          </div>
        </>
      ) : you.why === "not_member" ? (
        <p className="ladder-note">We couldn&apos;t find you in {ladderName}&apos;s Discord server. Join it to play and submit tables.</p>
      ) : (
        <>
          {player ? (
            <p className="ranked-you__line">
              <b>{player.name}</b>
              {player.mmr != null ? ` · ${num(player.mmr)} MMR · ${player.division}` : " · no tables this season yet"}
              {player.strikes > 0 && ` · ${player.strikes} ${player.strikes === 1 ? "strike" : "strikes"}`}
              {player.breakUntil && ` · on a break until ${day(player.breakUntil)}`}
            </p>
          ) : (
            <ClaimName ladderId={ladderId} onDone={reload} />
          )}
          <div className="ranked-you__acts">
            {you.canSubmit && <Button onClick={() => setModal("submit")}>Submit a table</Button>}
            {player && !player.nameAsked && <Button variant="secondary" onClick={() => setModal("name")}>Change my name</Button>}
            {you.staff && <ArrowLink href={staffPath}>Staff page</ArrowLink>}
          </div>
          {player?.nameAsked && <p className="ladder-muted">You asked to be {player.nameAsked}. The staff will get to it.</p>}
          {!!me.waiting?.length && <WaitingTables ladderId={ladderId} tables={me.waiting} onDone={reload} />}
          {!!me.penalties?.length && (
            <div className="ranked-you__pens">
              <h3>Your penalties</h3>
              <ul className="ranked-staff__list">
                {me.penalties.map((p) => (
                  <li key={p.logId} className="ranked-staff__row">
                    <div className="ranked-staff__row-main">
                      <span className="ranked-staff__row-title">
                        {[p.mmr ? `−${num(p.mmr)} MMR` : null, p.strikes ? `${p.strikes} ${p.strikes === 1 ? "strike" : "strikes"}` : null].filter(Boolean).join(", ") || "A warning"}
                        {p.undone ? " (taken back)" : ""}
                      </span>
                      {p.reason && <span className="ladder-muted">{p.reason}</span>}
                      <span className="ladder-muted">{day(p.at)}</span>
                    </div>
                    {!p.undone && (p.appealed ? <span className="ladder-muted">Appeal waiting</span> : <Button size="small" variant="ghost" onClick={() => setModal({ appeal: p })}>Appeal</Button>)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {modal === "submit" && <SubmitTable ladderId={ladderId} kind={kind} onClose={(changed) => { setModal(null); if (changed) reload(); }} />}
      {modal === "name" && player && <NameChange ladderId={ladderId} current={player.name} onClose={(changed) => { setModal(null); if (changed) reload(); }} />}
      {modal && typeof modal === "object" && <Appeal ladderId={ladderId} penalty={modal.appeal} onClose={(changed) => { setModal(null); if (changed) reload(); }} />}
    </section>
  );
}

async function post(ladderId: string, body: Record<string, unknown> | FormData) {
  const res = await fetch(`/api/ranked/${ladderId}/me`, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return { ok: !!res?.ok, ...(((await res?.json().catch(() => ({}))) ?? {}) as Record<string, unknown>) } as { ok: boolean; error?: string; text?: string } & Partial<Outcome> & Record<string, unknown>;
}

function Buttons({ label, onClick, busy, disabled, onCancel }: { label: string; onClick: () => void; busy: boolean; disabled?: boolean; onCancel: () => void }) {
  return (
    <div className="ranked-review__actions">
      <Button loading={busy} disabled={disabled} onClick={onClick}>{label}</Button>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function ClaimName({ ladderId, onDone }: { ladderId: string; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const claim = async () => {
    setBusy(true);
    const res = await post(ladderId, { action: "link", name });
    setBusy(false);
    if (res.ok) { toast.success(typeof res.line === "string" ? `That's you. ${res.line}` : "That's you. Your Discord is on your name now."); onDone(); return; }
    if (res.error === "unknown") { setUnknown(name.trim()); return; }
    toast.error(errorText(res.error));
  };
  const join = async () => {
    setBusy(true);
    const res = await post(ladderId, { action: "join", name: unknown ?? name });
    setBusy(false);
    if (!res.ok) { toast.error(res.text ?? errorText(res.error)); return; }
    toast.success(res.joined ? (typeof res.line === "string" ? `You're on the lounge. ${res.line}` : "You're on the lounge.") : String(res.why ?? "Asked. The staff will get to it."));
    onDone();
  };
  return (
    <div className="ranked-you__claim">
      <p className="ladder-note">Type the name you play under. If you&apos;ve played here, we put your Discord on it; if you&apos;re new, you can ask to join under it.</p>
      <div className="ranked-you__claim-row">
        <Input floatingLabel="Your name" value={name} maxLength={32} onChange={(e) => { setName(e.target.value); setUnknown(null); }} />
        <Button variant="secondary" loading={busy && !unknown} disabled={!name.trim()} onClick={claim}>That&apos;s me</Button>
      </div>
      {unknown && (
        <div className="ranked-you__acts">
          <span className="ladder-note">Nobody plays as {unknown} here yet.</span>
          <Button loading={busy} onClick={join}>Ask to join as {unknown}</Button>
        </div>
      )}
    </div>
  );
}

function WaitingTables({ ladderId, tables, onDone }: { ladderId: string; tables: { id: string; title: string; createdAt: string }[]; onDone: () => void }) {
  const toast = useToast();
  const act = async (tableId: string, action: "send" | "cancel") => {
    const res = await post(ladderId, { action, tableId });
    if (!res.ok) { toast.error(errorText(res.error)); return; }
    toast.success(action === "cancel" ? "Table canceled." : res.sent ? "Sent to the updaters." : "Sent.");
    onDone();
  };
  return (
    <div className="ranked-you__pens">
      <h3>Your tables waiting</h3>
      <ul className="ranked-staff__list">
        {tables.map((t) => (
          <li key={t.id} className="ranked-staff__row">
            <div className="ranked-staff__row-main"><span className="ranked-staff__row-title">{t.title}</span><span className="ladder-muted">Submitted {day(t.createdAt)}</span></div>
            <div className="ranked-staff__row-acts">
              <Button size="small" variant="secondary" onClick={() => act(t.id, "send")}>Send it</Button>
              <Button size="small" variant="ghost" onClick={() => act(t.id, "cancel")}>Cancel it</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The submit form (also opened from a queue room, filled with its teams). */
export function SubmitTable({ ladderId, kind, onClose, prefill }: { ladderId: string; kind: LadderKind; onClose: (changed: boolean) => void; prefill?: { body: string; format: number; roomId: string; title: string } }) {
  const toast = useToast();
  const knockout = kind === "knockout";
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState(String(prefill?.format ?? 1));
  const [tier, setTier] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [body, setBody] = useState(prefill?.body ?? "");
  const [missed, setMissed] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const [fix, setFix] = useState("");

  const finish = (o: Outcome) => {
    if (o.sent) {
      toast.success(o.table.autoAt ? `Table ${num(o.table.number)} is with the updaters. It verifies on its own soon unless someone asks for a change.` : `Table ${num(o.table.number)} is with the updaters.`);
      onClose(true);
      return;
    }
    if (o.postError) toast.error(o.postError === "no_access" ? "The table is saved, but the bot can't post in the results channel. Tell the lounge's staff." : "The table is saved, but it couldn't be posted. Try Send it again.");
    setResult(o);
    setFix(o.table.body);
  };

  const submit = async () => {
    setBusy(true);
    const form = new FormData();
    form.set("format", knockout ? "1" : format);
    form.set("tier", tier);
    form.set("body", body);
    form.set("missed", missed);
    // Vercel turns away requests over 4.5 MB: a phone photo of the table is made smaller first.
    if (file) form.set("shot", await fitPicture(file));
    if (prefill) form.set("room", prefill.roomId);
    const res = await post(ladderId, form);
    setBusy(false);
    if (res.ok) finish(res as unknown as Outcome); else toast.error(errorText(res.error));
  };
  const again = async (action: "send" | "fix" | "cancel") => {
    if (!result) return;
    setBusy(true);
    const res = await post(ladderId, { action, tableId: result.table.id, body: fix });
    setBusy(false);
    if (!res.ok) { toast.error(errorText(res.error)); return; }
    if (action === "cancel") { toast.success("Table canceled."); onClose(true); return; }
    finish(res as unknown as Outcome);
  };

  if (result) {
    const lines = [...result.notes, ...result.issues.map((i) => i.text)];
    return (
      <Modal isOpen size="large" onClose={() => onClose(true)} title={result.table.title} footer={
        <div className="ranked-review__actions">
          {!result.blocked && <Button loading={busy} onClick={() => again("send")}>Send it anyway</Button>}
          <Button variant={result.blocked ? "primary" : "secondary"} loading={busy} disabled={fix.trim() === result.table.body.trim()} onClick={() => again("fix")}>Save the fix</Button>
          <Button variant="ghost" onClick={() => again("cancel")}>Cancel the table</Button>
        </div>
      }>
        <div className="ranked-form">
          <p className="ladder-note">{result.blocked ? "This table can't be sent yet:" : "Check this before it goes to the updaters:"}</p>
          <ul className="ranked-review__reasons">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <Textarea floatingLabel={knockout ? "Finishing order" : "Players and scores"} value={fix} rows={12} maxLength={4000} onChange={(e) => setFix(e.target.value)} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen size="large" onClose={() => onClose(false)} title={prefill?.title ?? "Submit a table"} footer={<Buttons label="Submit" onClick={submit} busy={busy} disabled={!file && !body.trim()} onCancel={() => onClose(false)} />}>
      <div className="ranked-form">
        <div className="ranked-you__file">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>{file ? "Choose another screenshot" : "Choose the results screenshot"}</Button>
          <span className="ladder-muted">{file ? file.name : knockout ? "Optional. Every name is read in finishing order; you check before it's sent." : "Optional. Every name and score is read from it; you check before it's sent."}</span>
          {file && <Button size="small" variant="ghost" onClick={() => setFile(null)}>Remove</Button>}
        </div>
        {!knockout && (
          <div className="ranked-form__pair">
            <Select floatingLabel="Format" value={format} onChange={(v) => setFormat(String(v))} options={FORMATS.map((f) => ({ value: String(f), label: formatLabel(f) }))} />
            <Input floatingLabel="Tier (optional, like 3 or A)" value={tier} maxLength={12} onChange={(e) => setTier(e.target.value)} />
          </div>
        )}
        {knockout && <Input floatingLabel="Tier (optional, like 3 or A)" value={tier} maxLength={12} onChange={(e) => setTier(e.target.value)} />}
        <Textarea
          floatingLabel={knockout ? "Finishing order" : "Players and scores"}
          value={body}
          rows={8}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="ladder-muted">{knockout ? "One name per line, 1st first. Leave it empty to use the screenshot." : "Juno 82 on each line, teams in order. Leave it empty to use the screenshot."}</p>
        {!knockout && <Input floatingLabel="Missed races (optional, like Vex 5)" value={missed} maxLength={200} onChange={(e) => setMissed(e.target.value)} />}
        {!knockout && <p className="ladder-muted">Their teammates lose less, by the lounge&apos;s rule.</p>}
      </div>
    </Modal>
  );
}

function NameChange({ ladderId, current, onClose }: { ladderId: string; current: string; onClose: (changed: boolean) => void }) {
  const toast = useToast();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    const res = await post(ladderId, { action: "name", name });
    setBusy(false);
    if (!res.ok) { toast.error(res.text ?? errorText(res.error)); return; }
    toast.success(res.approved ? `You're ${name.trim()} now.` : `Asked. ${String(res.why ?? "The staff will get to it.")}`);
    onClose(true);
  };
  return (
    <Modal isOpen onClose={() => onClose(false)} title="Change my name" footer={<Buttons label="Ask for this name" onClick={ask} busy={busy} disabled={!name.trim() || name.trim() === current} onCancel={() => onClose(false)} />}>
      <div className="ranked-form">
        <Input floatingLabel="New name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
        <p className="ladder-muted">Use the name you play under. Your old name stays on your page with your earlier names.</p>
      </div>
    </Modal>
  );
}

function Appeal({ ladderId, penalty, onClose }: { ladderId: string; penalty: OwnPenalty; onClose: (changed: boolean) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const res = await post(ladderId, { action: "appeal", logId: penalty.logId, text });
    setBusy(false);
    if (res.ok) { toast.success("Appeal sent to the lounge's staff."); onClose(true); } else toast.error(errorText(res.error));
  };
  return (
    <Modal isOpen onClose={() => onClose(false)} title="Appeal a penalty" footer={<Buttons label="Send the appeal" onClick={send} busy={busy} disabled={!text.trim()} onCancel={() => onClose(false)} />}>
      <div className="ranked-form">
        <p className="ladder-note">{[penalty.mmr ? `−${num(penalty.mmr)} MMR` : null, penalty.strikes ? `${penalty.strikes} ${penalty.strikes === 1 ? "strike" : "strikes"}` : null].filter(Boolean).join(", ")}{penalty.reason ? `: ${penalty.reason}` : ""} ({day(penalty.at)})</p>
        <Textarea floatingLabel="Why it should be taken back" value={text} rows={5} maxLength={600} onChange={(e) => setText(e.target.value)} />
        <p className="ladder-muted">If the staff agree, you get the MMR back and its strikes stop counting.</p>
      </div>
    </Modal>
  );
}
