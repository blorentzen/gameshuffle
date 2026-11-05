"use client";

/**
 * A time's window over the board (round 3 pick 1A): the proof, the laps, the player, where it stands, its history and
 * what you can do with it. The board stays underneath; `?time=<id>` in the address opens it, so the window has its
 * own link to share.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, Button, Modal } from "@empac/cascadeds";
import { IconArrowsLeftRight, IconCamera, IconCircleCheck, IconClock, IconExternalLink, IconFlag, IconLink, IconShieldCheck, IconTable, IconThumbUp, IconTrophy, IconUsersGroup, IconVideo } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { flagUrl } from "@/lib/lounge/flags";
import { countryName } from "@/lib/lounge/countries";
import { COMMUNITY_VOUCHES, formatGap, formatLap, formatTime, ordinal } from "@/lib/timeTrials/rules";
import type { TimeStatus, TtTimeDetail } from "@/lib/timeTrials/detail";
import { TtAddShot } from "./TtAddShot";

export function StatusChip({ status }: { status: TimeStatus }) {
  switch (status) {
    case "verified": return <span className="tt-chip tt-chip--ok"><IconCircleCheck size={14} aria-hidden="true" /> Verified</span>;
    case "sheet": return <span className="tt-chip tt-chip--sheet"><IconTable size={14} aria-hidden="true" /> Top 10 sheet</span>;
    case "community": return <span className="tt-chip tt-chip--community"><IconUsersGroup size={14} aria-hidden="true" /> Community verified</span>;
    case "trusted": return <span className="tt-chip tt-chip--trust"><IconShieldCheck size={14} aria-hidden="true" /> Trusted</span>;
    case "review": return <span className="tt-chip tt-chip--review">Under review</span>;
    case "waiting": return <span className="tt-chip tt-chip--wait"><IconClock size={14} aria-hidden="true" /> Clip in review</span>;
    case "rejected": return <span className="tt-chip tt-chip--bad">Clip didn&apos;t match</span>;
    case "unverified": return <span className="tt-chip">Unverified</span>;
    default: return null;
  }
}

const VOUCH_ERRORS: Record<string, string> = {
  own: "That's your own time.",
  gone: "That time isn't on the board any more.",
  slow_down: "That's a lot of vouches. Try again later.",
};

export function TtTimeWindow({ timeId, signedIn, onClose, onReport }: {
  timeId: string | null; signedIn: boolean; onClose: () => void;
  /** Opens the board's report form for this time. */
  onReport: (t: { timeId: string; name: string; timeMs: number }) => void;
}) {
  const [time, setTime] = useState<TtTimeDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Bumped after a screenshot is added, to read the time again.
  const [tick, setTick] = useState(0);
  const toast = useToast();

  useEffect(() => {
    if (!timeId) return;
    let live = true;
    setTime(null); setMissing(false); setCopied(false);
    fetch(`/api/time-trials/${timeId}`).then((r) => r.json()).then((j: { ok?: boolean; time?: TtTimeDetail }) => {
      if (!live) return;
      if (j.ok && j.time) setTime(j.time); else setMissing(true);
    }).catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [timeId, tick]);

  async function vouch(on: boolean) {
    if (!time) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/time-trials/${time.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: on ? "vouch" : "unvouch" }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { toast.error(VOUCH_ERRORS[j.error ?? ""] ?? "That didn't go through. Try again."); return; }
      setTime({ ...time, youVouched: on, canVouch: !on, vouches: Math.max(0, time.vouches + (on ? 1 : -1)) });
      toast.success(on ? "Vouched. Updaters see it when they check this time." : "Vouch taken back.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!time) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${time.boardPath}`); setCopied(true); } catch { toast.error("Couldn't copy the link."); }
  }

  const flag = time?.player.country ? flagUrl(time.player.country) : null;
  const vsSlug = time?.player.page.split("/").pop();
  return (
    <Modal isOpen={!!timeId} onClose={onClose} title={time ? formatTime(time.timeMs) : "Time"} size="medium">
      {!time ? (
        <p className="tt-note">{missing ? "That time isn't on the board any more." : "Loading…"}</p>
      ) : (
        <div className="tt-win">
          <p className="tt-win__what">
            {time.trackName} · {time.category}{time.place ? ` · ${ordinal(time.place)} of ${time.total}` : ""}
          </p>
          <div className="tt-win__grid">
            <div className="tt-win__col">
              <section className="tt-win__sec" aria-labelledby="tt-win-proof">
                <h3 id="tt-win-proof">Proof</h3>
                <div className="tt-win__btns">
                  {time.proofUrl ? <a className="empac-button empac-button--secondary empac-button--small" href={time.proofUrl} target="_blank" rel="noopener noreferrer"><IconCamera size={16} aria-hidden="true" /> Open the picture</a>
                    : time.sheet ? (
                      <>
                        {time.sheet.link && <a className="empac-button empac-button--secondary empac-button--small" href={time.sheet.link} target="_blank" rel="noopener noreferrer nofollow"><IconExternalLink size={16} aria-hidden="true" /> The sheet&apos;s proof</a>}
                        {time.sheet.page && <a className="empac-button empac-button--secondary empac-button--small" href={time.sheet.page} target="_blank" rel="noopener noreferrer"><IconTable size={16} aria-hidden="true" /> {time.sheet.label} sheet</a>}
                      </>
                    )
                    : time.you ? <TtAddShot timeId={time.id} game={time.game} timeMs={time.timeMs} onDone={() => setTick((t) => t + 1)} />
                    : <span className="tt-muted">No screenshot (imported)</span>}
                  {time.videoUrl && <a className="empac-button empac-button--secondary empac-button--small" href={time.videoUrl} target="_blank" rel="noopener noreferrer"><IconVideo size={16} aria-hidden="true" /> Watch the clip</a>}
                </div>
              </section>
              <section className="tt-win__sec" aria-labelledby="tt-win-laps">
                <h3 id="tt-win-laps">Laps</h3>
                {time.laps?.length ? (
                  <>
                    {time.splits && (
                      <p className="tt-win__splits">
                        Beside <Link href={time.splits.page}>{time.splits.name}</Link>&apos;s {formatTime(time.splits.timeMs)}{time.splits.record ? ", the record" : ", the fastest time here with laps"}
                      </p>
                    )}
                    <ol className="tt-win__laps">
                      {time.laps.map((l, i) => {
                        const other = time.splits?.laps[i];
                        const gap = other == null ? null : l - other;
                        return (
                          <li key={i}>
                            <span>Lap {i + 1}</span><b>{formatLap(l)}</b>
                            {gap != null && <span className={`tt-win__gap${gap < 0 ? " tt-win__gap--ahead" : gap > 0 ? " tt-win__gap--behind" : ""}`}>{gap === 0 ? "Even" : `${gap < 0 ? "−" : "+"}${formatGap(Math.abs(gap))}`}<span className="sr-only">{gap < 0 ? " faster" : gap > 0 ? " slower" : ""} than {time.splits!.name}&apos;s lap {i + 1}, {formatLap(other!)}</span></span>}
                            {time.bestLap === i && <span className="tt-chip tt-chip--ok"><IconTrophy size={12} aria-hidden="true" /> Best lap</span>}
                          </li>
                        );
                      })}
                    </ol>
                    {!time.lapsAddUp && <p className="tt-note">These laps don&apos;t add up to the time; an updater is looking.</p>}
                  </>
                ) : <p className="tt-muted">Not recorded for this time.</p>}
              </section>
              {time.parts && (
                <section className="tt-win__sec" aria-labelledby="tt-win-combo">
                  <h3 id="tt-win-combo">Combo</h3>
                  <p className="tt-win__combo">{[time.parts.body, time.parts.wheels, time.parts.glider].filter(Boolean).join(" · ")}</p>
                </section>
              )}
            </div>
            <div className="tt-win__col">
              <section className="tt-win__sec" aria-labelledby="tt-win-player">
                <h3 id="tt-win-player" className="sr-only">Player</h3>
                <div className="tt-win__who">
                  <Avatar size="medium" src={time.player.avatar ?? undefined} initials={time.player.name.slice(0, 1).toUpperCase()} alt="" />
                  <div>
                    <Link href={time.player.page} className="tt-win__name">{time.player.name}</Link>
                    <p className="tt-win__meta">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a small flag from public/ */}
                      {flag && <img src={flag} alt="" className="tt-flag" />}
                      {[time.player.country ? countryName(time.player.country) : null, `${time.player.records} ${time.player.records === 1 ? "record" : "records"}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="tt-win__status">
                  <StatusChip status={time.status} />
                  {time.verifiedIn.length > 0 && <span className="tt-win__line"><IconCircleCheck size={14} aria-hidden="true" /> Vouched for in {time.verifiedIn.join(", ")}</span>}
                  {time.vouches > 0 && <span className="tt-win__line"><IconThumbUp size={14} aria-hidden="true" /> {time.vouches} {time.vouches === 1 ? "vouch" : "vouches"}{time.vouches < COMMUNITY_VOUCHES ? ` (${COMMUNITY_VOUCHES} make it Community verified)` : ""}</span>}
                </div>
              </section>
              <section className="tt-win__sec" aria-labelledby="tt-win-history">
                <h3 id="tt-win-history">History</h3>
                <ul className="tt-win__history">
                  {time.history.map((h, i) => <li key={i}>{h.at && <span>{h.at}</span>}{h.text}</li>)}
                </ul>
              </section>
            </div>
          </div>
          <div className="tt-win__actions">
            <Link href={time.player.page} className="empac-button empac-button--secondary empac-button--small">{time.you ? "Your times" : `${time.player.name}'s times`}</Link>
            {signedIn && !time.you && vsSlug && <Link href={`/time-trials/players/me?vs=${encodeURIComponent(vsSlug)}`} className="empac-button empac-button--secondary empac-button--small"><IconArrowsLeftRight size={16} aria-hidden="true" /> Compare with mine</Link>}
            {time.canVouch && <Button variant="secondary" size="small" iconBefore={IconThumbUp} loading={busy} onClick={() => void vouch(true)}>Vouch for this time</Button>}
            {time.youVouched && <Button variant="ghost" size="small" loading={busy} onClick={() => void vouch(false)}>Take back your vouch</Button>}
            {signedIn && !time.you && <Button variant="ghost" size="small" iconBefore={IconFlag} onClick={() => onReport({ timeId: time.id, name: time.player.name, timeMs: time.timeMs })}>Report this time</Button>}
            <Button variant="ghost" size="small" iconBefore={IconLink} onClick={() => void copyLink()}>{copied ? "Link copied" : "Copy link"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
