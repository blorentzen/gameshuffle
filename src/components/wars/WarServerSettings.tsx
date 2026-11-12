"use client";

/**
 * Two small server settings on the Teams page (overrides picks 2026-11-09): how typed races read where the other war
 * bots disagree (saves itself), and the server's own names for tracks ("bazaar" for SGB), read wherever a track code is.
 */

import { useState } from "react";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { AdminField, AdminSection, AdminTable, SaveStatus } from "@/components/account/admin/AdminKit";
import { IconAction } from "@/components/actions/IconAction";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { READS_LIKE, type ReadsLike } from "@/lib/wars/legacy";
import type { WarGame } from "@/lib/wars/rules";
import { GAME_LABELS, type TeamsView, type TrackNickView } from "@/lib/wars/teamView";
import { errorText, teamsApi } from "./teamsApi";

const NICK_ERRORS: Record<string, string> = {
  bad_nick: "Type a nickname.",
  is_code: "That's already a track code, so it would never be read as a nickname.",
  no_track: "No track has that code.",
};

export function WarServerSettings({ guild, view }: { guild: string; view: TeamsView }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [readsLike, setReadsLike] = useState<ReadsLike>(view.readsLike);
  const [nicks, setNicks] = useState<TrackNickView[]>(view.nicks);
  const [game, setGame] = useState<WarGame>(view.games[0] ?? "mk8dx");
  const [nick, setNick] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { status } = useAutosave(readsLike, async (v) => (await teamsApi("/api/war/teams/settings", "PATCH", { guild, readsLike: v })).ok);
  const reads = READS_LIKE.find((r) => r.id === readsLike) ?? READS_LIKE[0];

  // What the typed code and nickname will do, before anything is sent (the server decides).
  const tracks = view.tracks[game];
  const byCode = (text: string) => {
    const t = text.trim();
    if (!t) return null;
    const codes = (o: (typeof tracks)[number]) => [o.code, ...(o.also ?? [])];
    const exact = tracks.filter((o) => codes(o).includes(t));
    if (exact.length) return exact[0];
    const any = tracks.filter((o) => codes(o).some((c) => c.toLowerCase() === t.toLowerCase()));
    return any.length === 1 ? any[0] : null;
  };
  const match = byCode(code);
  const nickIsCode = !!byCode(nick);
  const codeNote = !code.trim() ? "A track code, like SSC or rMMM." : match ? match.name : NICK_ERRORS.no_track;

  const add = async () => {
    setError(null);
    if (!nick.trim()) { setError(NICK_ERRORS.bad_nick); return; }
    setBusy(true);
    const res = await teamsApi<{ nicks: TrackNickView[] }>("/api/war/teams/settings", "POST", { guild, nick, track: code, game });
    setBusy(false);
    if (!res.ok) { setError(errorText(res.error, NICK_ERRORS)); return; }
    setNicks(res.data.nicks);
    toast.success(`${nick.trim()} now reads as ${match?.code ?? code.trim()}`);
    setNick(""); setCode("");
  };

  const remove = async (n: TrackNickView) => {
    if (!(await confirm({ title: `Remove ${n.nick}?`, body: "Typed races stop reading it as a track.", confirmLabel: "Remove nickname" }))) return;
    const res = await teamsApi<{ nicks: TrackNickView[] }>(`/api/war/teams/settings?guild=${encodeURIComponent(guild)}&nick=${encodeURIComponent(n.nick)}`, "DELETE");
    if (!res.ok) { toast.error(errorText(res.error)); return; }
    setNicks(res.data.nicks);
    toast.success(`${n.nick} removed`);
  };

  return (
    <AdminSection title="War channel settings" intro="How this server's war channels read what people type.">
      <div className="wt-setting">
        <div className="wt-setting__head">
          <h3 className="wt-setting__title">How typed races read</h3>
          <SaveStatus status={status} />
        </div>
        <AdminField label="Read them like" helper={<>The war bots read a few lines differently; pick the one your server is used to. {reads.label}: {reads.line}.</>}>
          {(id) => <Select id={id} value={readsLike} fullWidth onChange={(v) => setReadsLike(String(Array.isArray(v) ? v[0] : v) as ReadsLike)} options={READS_LIKE.map((r) => ({ value: r.id, label: r.label, description: r.line }))} />}
        </AdminField>
      </div>

      <div className="wt-setting">
        <h3 className="wt-setting__title">Track nicknames</h3>
        <p className="admin-section__intro">Your server&apos;s own names for tracks. Typed races read them wherever a track code goes, like bazaar for SGB.</p>
        {nicks.length > 0 && (
          <AdminTable label="Track nicknames">
            <Table dense>
              <TableHeader>
                <TableRow>
                  <TableHead>Nickname</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead align="right"><span className="sr-only">Remove</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nicks.map((n) => (
                  <TableRow key={n.nick}>
                    <TableCell><strong>{n.nick}</strong></TableCell>
                    <TableCell>{n.label}</TableCell>
                    <TableCell align="right"><IconAction label={`Remove the nickname ${n.nick}`} icon={IconTrash} variant="danger" onClick={() => void remove(n)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
        <form className="wt-nick" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <AdminField label="Nickname" error={nickIsCode ? NICK_ERRORS.is_code : null}>
            {(id, d) => <Input id={id} aria-describedby={d} value={nick} onChange={(e) => { setNick(e.target.value); setError(null); }} maxLength={24} placeholder="bazaar" variant={nickIsCode ? "error" : "default"} aria-invalid={nickIsCode || undefined} fullWidth autoComplete="off" />}
          </AdminField>
          <AdminField label="Track code" helper={code.trim() && !match ? undefined : codeNote} error={code.trim() && !match ? NICK_ERRORS.no_track : null}>
            {(id, d) => <Input id={id} aria-describedby={d} value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} maxLength={8} placeholder="SGB" variant={code.trim() && !match ? "error" : "default"} aria-invalid={(!!code.trim() && !match) || undefined} fullWidth autoComplete="off" />}
          </AdminField>
          {view.games.length > 1 && (
            <AdminField label="Game">
              {(id) => <Select id={id} value={game} fullWidth onChange={(v) => setGame(String(Array.isArray(v) ? v[0] : v) as WarGame)} options={view.games.map((g) => ({ value: g, label: GAME_LABELS[g] }))} />}
            </AdminField>
          )}
          <div className="wt-nick__go">
            <Button type="submit" variant="secondary" iconBefore={IconPlus} loading={busy} disabled={busy || !nick.trim() || !match || nickIsCode}>Add nickname</Button>
          </div>
        </form>
        {error && <p className="admin-field__error" role="alert">{error}</p>}
      </div>
    </AdminSection>
  );
}
