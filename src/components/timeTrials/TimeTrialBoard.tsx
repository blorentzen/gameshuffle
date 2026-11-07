"use client";

/**
 * A track's board for one category: every player's best, by everyone, your friends, your crew or one
 * of your Discord servers. Only the top ten need a clip (players' note, 2026-10-30): those show
 * Verified once a reviewer checks it, Clip in review, or Unverified; below tenth there's no label, and
 * a dashed line marks the cut. Names open the players page. Your own top-ten row can take a clip or be
 * removed; anyone signed in can report someone else's time, which opens a ticket. `filters` is the
 * page's filter row, so the board's own controls (whose times, country, the count) sit on the same line. Round 3:
 * a time opens its window (`?time=<id>` too), rows say Under review and Trusted, a flag shows the player's
 * country, and a country filter narrows the board. On a
 * phone the table scrolls sideways with place and player pinned, and names never wrap (Britton,
 * 2026-10-30: scrolling tables are fine, long lounge names mustn't break the rows).
 */

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Avatar, Button, FormField, Input, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@empac/cascadeds";
import { IconBrandDiscord, IconCamera, IconCircleCheck, IconClock, IconExternalLink, IconFlag, IconTrash, IconVideo } from "@tabler/icons-react";
import { IconAction, IconLinkAction } from "@/components/actions/IconAction";
import { Select } from "@/components/ui/Select";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { formatTime, timeStatus, type TimeStatus } from "@/lib/timeTrials/rules";
import { flagUrl } from "@/lib/lounge/flags";
import { countryName } from "@/lib/lounge/countries";
import { StatusChip, TtTimeWindow } from "./TtTimeWindow";
import { videoProof } from "@/lib/timeTrials/rules";
import { vehicleLabel, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import type { TtBoard, TtBoardRow } from "@/lib/timeTrials/store";
import type { TtClass, TtGame } from "@/lib/timeTrials/tracks";

type Scope = { id: string; label: string; scope: "everyone" | "friends" | "crew" | "server"; guild?: string };

const TZ = "America/Los_Angeles";
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ });
const fullFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ });
const yearFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: TZ });
/** "Oct 30", with the year only when it isn't this year (Pacific). */
function setOn(at: string): string {
  const d = new Date(at);
  return yearFmt.format(d) === yearFmt.format(new Date()) ? dayFmt.format(d) : fullFmt.format(d);
}

const REPORT_ERRORS: Record<string, string> = {
  reason_needed: "Say what's wrong with the time.",
  bad_link: "Use a full link starting with https://.",
  own_time: "That's your own time.",
  gone: "That time isn't on the board any more.",
  slow_down: "That's a lot of reports. Try again later.",
};

/** Verified, Unverified, a clip in review, or a clip that didn't match. Shown for top-ten times only. */
export function VideoChip({ row }: { row: Pick<TtBoardRow, "video" | "videoUrl" | "you"> }) {
  if (row.video === "checked") return <span className="tt-chip tt-chip--ok"><IconCircleCheck size={14} aria-hidden="true" /> Verified</span>;
  if (row.video === "waiting" && row.videoUrl) return <span className="tt-chip tt-chip--wait"><IconClock size={14} aria-hidden="true" /> Clip in review</span>;
  if (row.video === "rejected" && row.you) return <span className="tt-chip tt-chip--bad">Clip didn&apos;t match</span>;
  return <span className="tt-chip">Unverified</span>;
}

/** A row's label: the same rule as the time's window (timeStatus in rules.ts). */
const rowStatus = (r: TtBoardRow): TimeStatus => timeStatus(r);

/** Your own top-ten time still needs a clip (none yet, or one that didn't match), unless you're Trusted. */
const wantsClip = (r: TtBoardRow) => r.you && r.top && !r.sheet && !r.trusted && r.video !== "checked" && !(r.video === "waiting" && r.videoUrl);
type Reporting = { timeId: string; name: string; timeMs: number };

export function TimeTrialBoard({ initial, game, track, cc, items, vehicle, signedIn, servers, countries = [], filters }: {
  initial: TtBoard; game: TtGame; track: string; cc: TtClass; items: TtItems; vehicle: TtVehicle; signedIn: boolean; servers: { guildId: string; name: string }[];
  /** Countries with players (the country filter's choices). */
  countries?: { country: string; players: number }[];
  filters?: ReactNode;
}) {
  const [board, setBoard] = useState(initial);
  const [scopeId, setScopeId] = useState("everyone");
  const [country, setCountry] = useState(initial.country ?? "");
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Reporting | null>(null);
  const [reason, setReason] = useState("");
  const [link, setLink] = useState("");
  const [videoFor, setVideoFor] = useState<TtBoardRow | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const scopes: Scope[] = [
    { id: "everyone", label: "Everyone", scope: "everyone" },
    ...(signedIn ? [{ id: "friends", label: "Friends", scope: "friends" as const }, { id: "crew", label: "My crew", scope: "crew" as const }] : []),
    ...servers.map((s) => ({ id: `server:${s.guildId}`, label: s.name, scope: "server" as const, guild: s.guildId })),
  ];

  // A shared link opens its time's window (read after hydration, so the server and browser agree).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("time");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    const t = setTimeout(() => setOpenId(id), 0);
    return () => clearTimeout(t);
  }, []);
  function openTime(id: string | null) {
    setOpenId(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("time", id); else u.searchParams.delete("time");
    window.history.replaceState(window.history.state, "", u.toString());
  }

  async function load(nextScope: string, nextCountry = country) {
    const s = scopes.find((x) => x.id === nextScope) ?? scopes[0];
    setLoading(true);
    try {
      const qs = new URLSearchParams({ game, track, cc: String(cc), items, vehicle, scope: s.scope });
      if (s.guild) qs.set("guild", s.guild);
      if (nextCountry) qs.set("country", nextCountry);
      const res = await fetch(`/api/time-trials?${qs}`);
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; board?: TtBoard };
      if (j.ok && j.board) setBoard(j.board);
    } finally {
      setLoading(false);
    }
  }

  async function remove(row: TtBoardRow) {
    if (!(await confirm({ title: "Remove your time?", body: `${formatTime(row.timeMs)} comes off every board. Your next best time takes its place.`, confirmLabel: "Remove time" }))) return;
    const res = await fetch(`/api/time-trials/${row.timeId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Time removed"); void load(scopeId); }
    else toast.error("That time couldn't be removed.");
  }

  async function sendReport() {
    if (!reporting) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/time-trials/${reporting.timeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "report", reason, link: link.trim() || null }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!j.ok || !j.id) { setError(REPORT_ERRORS[j.error ?? ""] ?? "That report didn't go through. Try again."); return; }
      setReporting(null); setReason(""); setLink("");
      toast.success("Reported. A reviewer will look at it, and you'll hear what they decide.");
    } finally {
      setBusy(false);
    }
  }

  async function sendVideo() {
    if (!videoFor) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/time-trials/${videoFor.timeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "video", url: videoUrl }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { setError(j.error === "bad_video" ? "Use a link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram." : "That clip couldn't be added. Try again."); return; }
      setVideoFor(null); setVideoUrl("");
      toast.success("Clip added. A reviewer will check it.");
      void load(scopeId);
    } finally {
      setBusy(false);
    }
  }

  const rows = board.mine ? [...board.rows, board.mine] : board.rows;
  const openReport = (r: Reporting) => { setError(null); setReporting(r); };
  const openClip = (r: TtBoardRow) => { setError(null); setVideoFor(r); };
  const count = `${board.total} ${board.total === 1 ? "player" : "players"}`;
  return (
    <div className="tt-board" aria-busy={loading}>
      <div className="tt-filters">
        {filters}
        <div className="tt-filters__end">
          <span className="tt-board__count">{count}</span>
          {countries.length > 0 && (
            <div className="tt-filter-select tt-filters__country">
              <label htmlFor="tt-country" className="sr-only">Country</label>
              <Select
                id="tt-country"
                value={country}
                options={[{ value: "", label: "Every country" }, ...countries.map((c) => ({ value: c.country, label: countryName(c.country) }))]}
                onChange={(v) => { const c = String(v); setCountry(c); void load(scopeId, c); }}
                fullWidth
              />
            </div>
          )}
          {scopes.length > 1 && (
            <div className="tt-filter-select tt-filters__scope">
              <label htmlFor="tt-scope" className="sr-only">Whose times</label>
              <Select
                id="tt-scope"
                value={scopeId}
                options={scopes.map((s) => ({ value: s.id, label: s.scope === "server" ? `${s.label} (Discord)` : s.label }))}
                onChange={(v) => { const id = String(v); setScopeId(id); void load(id); }}
                fullWidth
              />
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="tt-board__empty">{country ? `No times from ${countryName(country)} on this board yet.` : scopeId === "everyone" ? "No times on this board yet. Add the first one." : "No times from these players yet."}</p>
      ) : (
        <TableScroll label="Times on this board">
          <Table className="tt-board__table">
            <TableHeader>
              <TableRow>
                {/* Only ever a number: the column sizes to it (Britton, 2026-11-05). */}
                <TableHead className="tt-board__placehead"><span aria-hidden="true">#</span><span className="sr-only">Place</span></TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead>Set</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const mineRow = !!board.mine && i === rows.length - 1;
                const cut = !mineRow && i > 0 && rows[i - 1].top && !r.top;
                const proofHref = r.proofUrl && r.proof !== "none" ? r.proofUrl : null;
                const clipHref = r.videoUrl && r.video === "checked" ? r.videoUrl : null;
                const status = rowStatus(r);
                const flag = r.country ? flagUrl(r.country) : null;
                return (
                  <Fragment key={r.player}>
                    {cut && (
                      <TableRow className="tt-board__cut">
                        <TableCell colSpan={6}><span>Below the top ten, no clip needed</span></TableCell>
                      </TableRow>
                    )}
                    <TableRow className={`${r.you ? "tt-board__you" : ""}${mineRow ? " tt-board__gap" : ""}`}>
                      <TableCell className="tt-board__place">{r.rank}</TableCell>
                      <TableCell>
                        <span className="tt-board__who">
                          <Avatar size="small" src={r.avatar ?? undefined} initials={r.name.slice(0, 1).toUpperCase()} alt="" />
                          <span className="tt-board__name">
                            <span className="tt-board__line">
                              {/* eslint-disable-next-line @next/next/no-img-element -- a small flag from public/ */}
                              {flag && <img src={flag} alt={countryName(r.country!)} title={countryName(r.country!)} className="tt-flag" />}
                              <Link href={r.page} title={r.name} className="tt-board__player">{r.name}</Link>
                              {r.discord && <IconBrandDiscord size={16} className="tt-board__discord" aria-label="(played in Discord)" />}
                              {r.you && <span className="tt-board__tag">You</span>}
                            </span>
                            {vehicle === "any" && r.vehicle !== "any" && <span className="tt-board__sub">{vehicleLabel(r.vehicle)}</span>}
                            {r.verifiedIn.length > 0 && <span className="tt-board__sub tt-board__verified"><IconCircleCheck size={14} aria-hidden="true" /> Vouched for in {r.verifiedIn.join(", ")}</span>}
                            {r.vouches > 0 && <span className="tt-board__sub">{r.vouches} {r.vouches === 1 ? "vouch" : "vouches"}</span>}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="tt-board__timecell">
                          <button type="button" className="tt-board__time tt-board__timebtn" onClick={() => openTime(r.timeId)} aria-label={`${formatTime(r.timeMs)} by ${r.name}: open its details`}>{formatTime(r.timeMs)}</button>
                          <StatusChip status={status} />
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="tt-board__proof">
                          {proofHref ? (
                            <IconLinkAction label={`${r.name}'s ${r.proof === "video" ? "video" : "screenshot"}`} icon={r.proof === "video" ? IconVideo : IconCamera} href={proofHref} />
                          ) : r.sheetLink ? (
                            <IconLinkAction label={`${r.name}'s proof`} icon={videoProof(r.sheetLink) ? IconVideo : IconExternalLink} href={r.sheetLink} />
                          ) : <span className="tt-board__none">{r.sheet && status !== "sheet" ? "Legacy" : r.imported ? "Imported" : "None"}</span>}
                          {clipHref && <IconLinkAction label={`${r.name}'s clip`} icon={IconVideo} href={clipHref} />}
                        </span>
                      </TableCell>
                      <TableCell className="tt-board__date">{r.sheet ? `Before ${setOn(r.at)}` : setOn(r.at)}</TableCell>
                      <TableCell>
                        <span className="tt-board__acts">
                          {wantsClip(r) && <Button variant="secondary" size="small" iconBefore={IconVideo} onClick={() => openClip(r)}>Add clip</Button>}
                          {r.you ? <IconAction label="Remove your time" icon={IconTrash} variant="danger" onClick={() => void remove(r)} />
                            : signedIn ? <IconAction label={`Report ${r.name}'s time`} icon={IconFlag} onClick={() => openReport({ timeId: r.timeId, name: r.name, timeMs: r.timeMs })} /> : null}
                        </span>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableScroll>
      )}
      {rows.length > 0 && <p className="tt-board__note">Top-ten times show Verified once an updater checks a clip of the run&apos;s last 30 seconds. Players with ten checked clips are Trusted.{rows.some((r) => r.sheet) && <> Legacy times were recorded before they came to GameShuffle.</>} Press a time for its details.</p>}

      <TtTimeWindow timeId={openId} signedIn={signedIn} onClose={() => openTime(null)} onReport={(t) => { openTime(null); openReport(t); }} />

      <Modal isOpen={!!reporting} onClose={() => setReporting(null)} title="Report this time" size="small">
        {reporting && (
          <form className="tt-form" onSubmit={(e) => { e.preventDefault(); void sendReport(); }}>
            <p className="tt-note">{reporting.name} · {formatTime(reporting.timeMs)}. A reviewer looks at it, {reporting.name} can answer with proof, and you&apos;ll hear what they decide.</p>
            <FormField label="What's wrong with it?" htmlFor="tt-report-reason" required>
              <Textarea id="tt-report-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} fullWidth />
            </FormField>
            <FormField label="A link that shows it (optional)" htmlFor="tt-report-link" helperText="A clip or post, starting with https://">
              <Input id="tt-report-link" value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" autoComplete="off" fullWidth />
            </FormField>
            {error && <p className="tt-form__error" role="alert">{error}</p>}
            <div className="tt-add__actions"><Button type="submit" variant="primary" loading={busy} disabled={!reason.trim()}>Send report</Button></div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!videoFor} onClose={() => setVideoFor(null)} title="Add your clip" size="small">
        {videoFor && (
          <form className="tt-form" onSubmit={(e) => { e.preventDefault(); void sendVideo(); }}>
            <p className="tt-note">A clip of the last 30 seconds of your {formatTime(videoFor.timeMs)} run. Top-ten times need one: a reviewer checks it and your time shows as Verified.</p>
            <FormField label="Video link" htmlFor="tt-video-url" helperText="YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram">
              <Input id="tt-video-url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} inputMode="url" autoComplete="off" fullWidth />
            </FormField>
            {error && <p className="tt-form__error" role="alert">{error}</p>}
            <div className="tt-add__actions"><Button type="submit" variant="primary" loading={busy} disabled={!videoUrl.trim()}>Add clip</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
