"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import type { EventType } from "@/lib/events/calendar";
import type { Attendee } from "@/lib/events/attendees";

/**
 * Organizer check-in from a phone: camera QR scanning where the browser has
 * `BarcodeDetector` (Chrome / Android / recent Safari), a short-code field
 * everywhere, plus a name search over the attendee list as the last resort.
 * No app install, no third-party scanner library.
 */

type Result = { kind: "ok" | "already" | "error"; text: string; name?: string };

export function CheckInScanner({ type, eventId, title, backHref }: { type: EventType; eventId: string; title: string; backHref: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Feature detection reads the window, so it's lazy state (SSR renders "unknown").
  const [supported] = useState<boolean | null>(() => (typeof window === "undefined" ? null : "BarcodeDetector" in window));
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [count, setCount] = useState({ checked: 0, total: 0 });
  const lastRef = useRef<{ token: string; at: number } | null>(null);

  const load = useCallback(() =>
    fetch(`/api/events/${type}/${eventId}/attendees`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ attendees: Attendee[] }>) : null))
      .then((j) => {
        if (!j) return;
        const active = j.attendees.filter((a) => a.status !== "dropped" && a.status !== "declined" && a.status !== "waitlisted");
        setAttendees(active);
        setCount({ checked: active.filter((a) => !!a.checkedInAt || a.status === "checked_in").length, total: active.length });
      })
      .catch(() => {}), [type, eventId]);
  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async (payload: { token?: string; code?: string; attendeeId?: string }) => {
    const r = await fetch(`/api/events/${type}/${eventId}/attendees/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, checked: true }) });
    const j = (await r.json().catch(() => null)) as { attendee?: Attendee; error?: string } | null;
    if (r.ok && j?.attendee) {
      setResult({ kind: "ok", text: "Checked in", name: j.attendee.displayName });
      if (navigator.vibrate) navigator.vibrate(60);
      void load();
    } else {
      const map: Record<string, string> = { invalid_ticket: "That's not a GameShuffle ticket", wrong_event: "Ticket is for a different event", code_not_found: "No attendee with that code", not_active: "Not an active attendee (waitlisted or dropped)", not_found: "Attendee not found" };
      setResult({ kind: "error", text: map[j?.error ?? ""] ?? "Couldn't check in" });
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    }
  }, [type, eventId, load]);

  // Camera loop: BarcodeDetector polls the video ~6x/s; de-dupes the same token for 4s.
  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let raf = 0; let cancelled = false;
    const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    const detector = new Detector({ formats: ["qr_code"] });
    const video = videoRef.current;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream; video.srcObject = stream; await video.play();
        let last = 0;
        const tick = async (ts: number) => {
          if (cancelled) return;
          if (ts - last > 160 && video.readyState >= 2) {
            last = ts;
            try {
              const codes = await detector.detect(video);
              const hit = codes.find((c) => c.rawValue.startsWith("gs1."));
              if (hit && !(lastRef.current && lastRef.current.token === hit.rawValue && Date.now() - lastRef.current.at < 4000)) {
                lastRef.current = { token: hit.rawValue, at: Date.now() };
                void submit({ token: hit.rawValue });
              }
            } catch { /* detector hiccup; keep scanning */ }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setResult({ kind: "error", text: "Camera access was blocked. Use the code field below." });
        setScanning(false);
      }
    })();
    return () => { cancelled = true; cancelAnimationFrame(raf); streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [scanning, submit]);

  const matches = query.trim().length >= 2 ? attendees.filter((a) => a.displayName.toLowerCase().includes(query.trim().toLowerCase()) || (a.username ?? "").toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];

  return (
    <div className="checkin">
      <div className="checkin__head">
        <div>
          <p className="marketing-eyebrow">Check-in</p>
          <h1 className="checkin__title">{title}</h1>
          <p className="checkin__count"><strong>{count.checked}</strong> of {count.total} checked in</p>
        </div>
        <Link href={backHref} style={{ textDecoration: "none" }}><Button variant="ghost" size="small">Back to manage</Button></Link>
      </div>

      {result && (
        <div className={`checkin__result checkin__result--${result.kind}`} role="status">
          <span className="checkin__result-text">{result.kind === "ok" ? "✓" : "✕"} {result.text}</span>
          {result.name && <span className="checkin__result-name">{result.name}</span>}
        </div>
      )}

      <div className="comp-card checkin__camera">
        {supported ? (
          <>
            <div className="checkin__video-wrap">
              <video ref={videoRef} className="checkin__video" muted playsInline />
              {!scanning && <div className="checkin__video-idle">Camera off</div>}
            </div>
            <Button variant={scanning ? "secondary" : "primary"} fullWidth onClick={() => setScanning((s) => !s)}>
              {scanning ? "Stop camera" : "Scan tickets with camera"}
            </Button>
          </>
        ) : supported === false ? (
          <p className="checkin__note">This browser can&apos;t scan QR codes natively (try Chrome on Android or Safari on iOS 17+). Use the code or name below.</p>
        ) : null}
      </div>

      <div className="comp-card">
        <h2 className="event-shell__h2">Enter a ticket code</h2>
        <form className="checkin__code" onSubmit={(e) => { e.preventDefault(); if (code.trim()) { void submit({ code: code.trim() }); setCode(""); } }}>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="6-character code" maxLength={6} fullWidth autoComplete="off" />
          <Button variant="primary" type="submit" disabled={code.trim().length < 6}>Check in</Button>
        </form>
      </div>

      <div className="comp-card">
        <h2 className="event-shell__h2">Find by name</h2>
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing a name" fullWidth />
        {matches.length > 0 && (
          <ul className="checkin__matches">
            {matches.map((a) => {
              const done = !!a.checkedInAt || a.status === "checked_in";
              return (
                <li key={a.id} className="checkin__match">
                  <span>{a.displayName}{a.username ? <span className="checkin__handle"> @{a.username}</span> : null}</span>
                  {done ? <span className="checkin__done">Checked in</span> : <Button size="small" variant="secondary" onClick={() => void submit({ attendeeId: a.id })}>Check in</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
