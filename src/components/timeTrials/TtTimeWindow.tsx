"use client";

/**
 * A time's window over the board (round 3 pick 1A): the proof, the laps, the player, where it stands, its history and
 * what you can do with it. The board stays underneath; `?time=<id>` in the address opens it, so the window has its
 * own link to share. Reviewers, and the updater for its game and items, can verify it here from its proof (picks
 * 2026-11-04): the player's clip, a legacy time's clip or post, or a clip they paste.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, Button, FormField, Input, Modal } from "@empac/cascadeds";
import { IconArrowsLeftRight, IconCamera, IconPencil, IconCircleCheck, IconClock, IconExternalLink, IconFlag, IconLink, IconShieldCheck, IconThumbUp, IconTrophy, IconUsersGroup, IconVideo } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { flagUrl } from "@/lib/lounge/flags";
import { countryName } from "@/lib/lounge/countries";
import { COMMUNITY_VOUCHES, formatGap, formatLap, formatTime, ordinal } from "@/lib/timeTrials/rules";
import type { TimeStatus, TtTimeDetail } from "@/lib/timeTrials/detail";
import { TtAddShot } from "./TtAddShot";
import { TtAskPanel, TtClipForm } from "./TtAskPanel";
import { TtFixTime } from "./TtFixTime";

export function StatusChip({ status }: { status: TimeStatus }) {
  switch (status) {
    case "verified": return <span className="tt-chip tt-chip--ok"><IconCircleCheck size={14} aria-hidden="true" /> Verified</span>;
    // Times brought over from the community's records carry no chip ("Legacy" stopped meaning anything, Britton
    // 2026-11-07); the proof column says what they have.
    case "sheet": return null;
    case "community": return <span className="tt-chip tt-chip--community"><IconUsersGroup size={14} aria-hidden="true" /> Community verified</span>;
    case "trusted": return <span className="tt-chip tt-chip--trust"><IconShieldCheck size={14} aria-hidden="true" /> Trusted</span>;
    case "review": return <span className="tt-chip tt-chip--review">Under review</span>;
    case "waiting": return <span className="tt-chip tt-chip--wait"><IconClock size={14} aria-hidden="true" /> Clip in review</span>;
    case "rejected": return <span className="tt-chip tt-chip--ask"><IconClock size={14} aria-hidden="true" /> Update asked</span>;
    case "unverified": return <span className="tt-chip">Unverified</span>;
    default: return null;
  }
}

const VOUCH_ERRORS: Record<string, string> = {
  own: "That's your own time.",
  gone: "That time isn't on the board any more.",
  slow_down: "That's a lot of vouches. Try again later.",
};

const VERIFY_ERRORS: Record<string, string> = {
  bad_video: "Paste a clip link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram.",
  no_proof: "Paste a clip or add a picture that shows this run first.",
  bad_picture: "That picture didn't upload. Add it again.",
  not_reviewer: "You don't check this game and items.",
  gone: "That time isn't on the board any more.",
};

export function TtTimeWindow({ timeId, signedIn, onClose, onReport }: {
  timeId: string | null; signedIn: boolean; onClose: () => void;
  /** Opens the board's report form for this time. */
  onReport: (t: { timeId: string; name: string; timeMs: number }) => void;
}) {
  const [time, setTime] = useState<TtTimeDetail | null>(null);
  const [reviewer, setReviewer] = useState<{ canVerify: boolean; clip: string | null; canFix?: boolean; hasProof?: boolean } | null>(null);
  // A reviewer fixing the numbers themselves (picks 2026-11-09).
  const [reviewerFixing, setReviewerFixing] = useState(false);
  const [clipLink, setClipLink] = useState("");
  const [verifying, setVerifying] = useState(false);
  // A picture the reviewer adds as proof (Britton, 2026-11-07: proof is a clip or a picture).
  const [picture, setPicture] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const pictureRef = useRef<HTMLInputElement>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Bumped after a screenshot is added, to read the time again.
  const [tick, setTick] = useState(0);
  // The player fixing their own time without an ask (with one, the ask panel has the button).
  const [fixing, setFixing] = useState(false);
  // The player adding the clip a top-ten time needs, from the window (Needs your attention links here).
  const [clipping, setClipping] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!timeId) return;
    let live = true;
    setTime(null); setMissing(false); setCopied(false); setReviewer(null); setClipLink(""); setFixing(false); setClipping(false); setReviewerFixing(false);
    fetch(`/api/time-trials/${timeId}`).then((r) => r.json()).then((j: { ok?: boolean; time?: TtTimeDetail; reviewer?: { canVerify: boolean; clip: string | null; canFix?: boolean; hasProof?: boolean } | null }) => {
      if (!live) return;
      if (j.ok && j.time) { setTime(j.time); setReviewer(j.reviewer ?? null); } else setMissing(true);
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

  async function verify() {
    if (!time) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/time-trials/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", timeId: time.id, link: clipLink.trim() || null, picture }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { toast.error(VERIFY_ERRORS[j.error ?? ""] ?? "That didn't save. Try again."); return; }
      toast.success("Verified");
      setTick((t) => t + 1);
    } finally {
      setVerifying(false);
    }
  }

  async function addPicture(file: File) {
    if (!time) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("game", time.game);
      const res = await fetch("/api/time-trials/read", { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; proofUrl?: string; error?: string };
      if (!res.ok || !j.ok || !j.proofUrl) { toast.error(j.error === "bad_type" ? "Use a PNG, JPEG or WebP picture." : j.error === "too_big" ? "That picture is over 8 MB." : "That picture didn't upload. Try again."); return; }
      setPicture(j.proofUrl);
    } finally {
      setUploading(false);
    }
  }

  async function copyLink() {
    if (!time) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${time.boardPath}`); setCopied(true); } catch { toast.error("Couldn't copy the link."); }
  }

  const flag = time?.player.country ? flagUrl(time.player.country) : null;
  // Your own top-ten time that still needs a clip (none yet, or one a reviewer asked you to replace before asks had a thread).
  // A reviewer's fix leaves a thread the player can answer (state "fixed"): the window's own buttons stay.
  const noAsk = !time?.ask || time.ask.state === "fixed";
  const wantsClip = !!time && time.you && time.top && !time.sheet && noAsk && (time.status === "unverified" || time.status === "rejected");
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
          {/* A reviewer's ask (picks 2026-11-08): first, since it's what this window was opened for. */}
          {time.ask && <TtAskPanel time={time} onChanged={() => setTick((t) => t + 1)} />}
          {fixing && noAsk && <TtFixTime time={time} onCancel={() => setFixing(false)} onDone={() => { setFixing(false); setTick((t) => t + 1); }} />}
          {clipping && noAsk && <TtClipForm timeId={time.id} onCancel={() => setClipping(false)} onDone={() => { setClipping(false); setTick((t) => t + 1); }} />}
          <div className="tt-win__grid">
            <div className="tt-win__col">
              <section className="tt-win__sec" aria-labelledby="tt-win-proof">
                <h3 id="tt-win-proof">Proof</h3>
                <div className="tt-win__btns">
                  {time.proofUrl ? <a className="empac-button empac-button--secondary empac-button--small" href={time.proofUrl} target="_blank" rel="noopener noreferrer"><IconCamera size={16} aria-hidden="true" /> Open the picture</a>
                    : time.sheet ? (
                      time.legacyProof
                        ? <a className="empac-button empac-button--secondary empac-button--small" href={time.legacyProof} target="_blank" rel="noopener noreferrer nofollow"><IconExternalLink size={16} aria-hidden="true" /> Open the proof</a>
                        : <span className="tt-muted">No picture or clip yet</span>
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
          {reviewer && (reviewer.canVerify || reviewer.canFix) && (
            <section className="tt-win__sec tt-win__check" aria-labelledby="tt-win-check">
              <h3 id="tt-win-check">{reviewerFixing ? (time.player.name !== "A player" ? `Fix ${time.player.name}'s time` : "Fix the time") : reviewer.canVerify ? "Verify this time" : "Review this time"}</h3>
              {reviewerFixing ? (
                <TtFixTime
                  bare
                  time={time}
                  reviewer={{ name: time.player.name, canVerify: !!reviewer.hasProof }}
                  onCancel={() => setReviewerFixing(false)}
                  onDone={() => { setReviewerFixing(false); setTick((t) => t + 1); }}
                />
              ) : reviewer.canVerify ? (<>
                <p className="tt-note">
                  {reviewer.clip ? <>Check <a href={reviewer.clip} target="_blank" rel="noopener noreferrer nofollow">their clip</a> shows this run, or add another clip or a picture.</>
                    : time.legacyProof || time.proofUrl ? "Check the proof above shows this run, or add a clip or a picture that does."
                    : "Add a clip (YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram) or a picture that shows this run."}
                </p>
                <form className="tt-win__verify" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
                  <FormField label={reviewer.clip || time.legacyProof || time.proofUrl ? "Another clip (optional)" : "Clip link"} htmlFor="tt-win-clip">
                    <Input id="tt-win-clip" type="url" inputMode="url" value={clipLink} onChange={(e) => setClipLink(e.target.value)} placeholder="https://" autoComplete="off" fullWidth />
                  </FormField>
                  <div className="tt-win__picture">
                    {picture
                      ? <><a href={picture} target="_blank" rel="noopener noreferrer"><IconCamera size={16} aria-hidden="true" /> Picture added</a><Button type="button" variant="ghost" size="small" onClick={() => setPicture(null)}>Remove</Button></>
                      : <Button type="button" variant="secondary" size="small" iconBefore={IconCamera} loading={uploading} onClick={() => pictureRef.current?.click()}>Or add a picture</Button>}
                    <input ref={pictureRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addPicture(f); e.target.value = ""; }} />
                  </div>
                  <Button type="submit" variant="primary" size="small" iconBefore={IconCircleCheck} loading={verifying} disabled={!reviewer.clip && !time.legacyProof && !time.proofUrl && !clipLink.trim() && !picture}>Verify</Button>
                </form>
              </>) : <p className="tt-note">This time is verified. If its numbers are wrong, fix them here.</p>}
              {!reviewerFixing && reviewer.canFix && (
                <div className="tt-win__fixbtn">
                  <Button variant="secondary" size="small" iconBefore={IconPencil} onClick={() => setReviewerFixing(true)}>Fix the time</Button>
                </div>
              )}
            </section>
          )}
          <div className="tt-win__actions">
            <Link href={time.player.page} className="empac-button empac-button--secondary empac-button--small">{time.you ? "Your times" : `${time.player.name}'s times`}</Link>
            {wantsClip && !clipping && <Button variant="primary" size="small" iconBefore={IconVideo} onClick={() => setClipping(true)}>Add a clip</Button>}
            {time.canFix && noAsk && !fixing && <Button variant="secondary" size="small" iconBefore={IconPencil} onClick={() => setFixing(true)}>Fix the time</Button>}
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
