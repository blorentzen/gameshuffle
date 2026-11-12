"use client";

/**
 * Account ▸ Profile ▸ Gamertags & socials: your Super Mario Maker 2 maker ID (curation picks 9A), shown on the levels
 * you share and on your profile's Levels. Checked as it's typed with the code's own check bits, so a course ID or a
 * typo is caught before it's saved. Hidden until the curation tables exist.
 */

import { useEffect, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { AdminSection } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { decodeSmm2, formatSmm2, readSmm2 } from "@/lib/levels/codes";
import "@/styles/levels.css";

function lineFor(input: string): { ok: boolean; line: string } {
  if (!input.trim()) return { ok: true, line: "It's on your profile in the game: 9 letters and numbers, XXX-XXX-XXX." };
  const nine = readSmm2(input);
  const d = nine ? decodeSmm2(nine) : null;
  if (!nine || !d) return { ok: false, line: "That doesn't look like a maker ID. It's 9 letters and numbers: XXX-XXX-XXX." };
  if (!d.valid) return { ok: false, line: "That maker ID has a typo somewhere. Check it on your profile in the game." };
  if (d.kind !== "maker") return { ok: false, line: "That's a course ID. Your maker ID is on your profile in the game." };
  return { ok: true, line: `${formatSmm2(nine)} looks right.` };
}

export function MakerIdSection() {
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/levels/maker", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const v = d as { ready?: boolean; makerId?: string | null } | null;
      if (!live || !v?.ready) return;
      setReady(true);
      setSaved(v.makerId ?? null);
      setValue(v.makerId ?? "");
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!ready) return null;
  const check = lineFor(value);
  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/levels/maker", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ makerId: value.trim() || null }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { makerId?: string | null; line?: string } | null;
    setBusy(false);
    if (!r?.ok) { toast.error(d?.line ?? "That didn't go through. Try again."); return; }
    setSaved(d?.makerId ?? null);
    setValue(d?.makerId ?? "");
    if (d?.makerId) track(EVENTS.makerIdSaved, {});
    toast.success(d?.makerId ? "Maker ID saved" : "Maker ID taken off");
  };
  const changed = (value.trim() || null) !== saved;
  return (
    <AdminSection title="Super Mario Maker 2" intro="Your maker ID shows on the courses you share and on your profile, so players can find the rest of your courses in the game.">
      <div className="admin-form lvl-maker">
        <div>
          <Input id="lvl-maker-id" floatingLabel="Maker ID" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false}
            variant={value.trim() ? (check.ok ? "success" : "error") : "default"} aria-describedby="lvl-maker-note" />
          <p id="lvl-maker-note" className={`lvl-share__check${check.ok ? "" : " lvl-share__check--bad"}`} aria-live="polite">{check.line}</p>
        </div>
        <div><Button variant="primary" size="small" onClick={() => void save()} disabled={busy || !changed || !check.ok}>{value.trim() ? "Save the maker ID" : "Take it off"}</Button></div>
      </div>
    </AdminSection>
  );
}
