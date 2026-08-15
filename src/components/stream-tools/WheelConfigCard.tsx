"use client";

/**
 * WheelConfigCard — build/edit a wheel on the fly from the Hub (Pro). Pick an
 * existing wheel or start a new one, edit its name + segment labels, and save
 * via the shared wheels API. Colors, theme, and viewer-entry rules live in
 * Account → Wheels (deeper config); this is the quick on-stream builder. The Hub
 * pairs it with the live WheelControl (spin). Self-hides for non-Pro.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { Wheel, WheelSegment } from "@/lib/wheels/types";

const MAX_SEGMENTS = 60;
const MAX_LABEL = 60;

export function WheelConfigCard({ live }: { live?: ReactNode }) {
  const [wheels, setWheels] = useState<Wheel[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(""); // "" = new wheel
  const [isDefault, setIsDefault] = useState(false);
  const [name, setName] = useState("");
  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [newSeg, setNewSeg] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const applyWheel = useCallback((w: Wheel | null) => {
    setSelectedId(w?.id ?? "");
    setName(w?.name ?? "");
    setSegments(w ? w.segments.map((s) => ({ ...s })) : []);
    setIsDefault(w?.isDefault ?? false);
  }, []);

  const load = useCallback(async (): Promise<Wheel[] | null> => {
    try {
      const res = await fetch("/api/account/wheels", { cache: "no-store" });
      if (res.status === 403) {
        setHidden(true);
        return null;
      }
      if (!res.ok) return [];
      const body = (await res.json()) as { wheels: Wheel[] };
      setWheels(body.wheels);
      return body.wheels;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const ws = await load();
      if (ws && ws.length) applyWheel(ws.find((w) => w.isDefault) ?? ws[0]);
    })();
  }, [load, applyWheel]);

  if (hidden) return null;

  const onSelect = (id: string) => {
    if (id === "") applyWheel(null);
    else applyWheel(wheels?.find((w) => w.id === id) ?? null);
  };

  const addSeg = () => {
    const label = newSeg.trim().slice(0, MAX_LABEL);
    setNewSeg("");
    if (!label || segments.length >= MAX_SEGMENTS) return;
    setSegments((s) => [...s, { label }]);
  };
  const updateSeg = (i: number, label: string) =>
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, label: label.slice(0, MAX_LABEL) } : seg)));
  const removeSeg = (i: number) => setSegments((s) => s.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) {
      toast.error("Give your wheel a name.");
      return;
    }
    const clean = segments.filter((s) => s.label.trim());
    if (clean.length < 2) {
      toast.error("Add at least two segments.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/wheels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId || undefined,
          name: name.trim(),
          segments: clean,
          isDefault,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; wheel?: Wheel; error?: string };
      if (!res.ok || !body.ok) {
        toast.error(body.error === "name_taken" ? "You already have a wheel with that name." : "Couldn't save the wheel. Try again.");
        return;
      }
      toast.success("Your changes are live.", { title: "Wheel saved" });
      const ws = await load();
      if (ws && body.wheel) applyWheel(ws.find((w) => w.id === body.wheel!.id) ?? body.wheel);
    } finally {
      setSaving(false);
    }
  };

  if (wheels === null) return null; // loading

  return (
    <section className="stream-tools__section">
      <h3 className="stream-tools__heading">🎡 Wheel</h3>

      <div className="stream-tools__row">
        <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
          Editing
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            style={{ height: 34, borderRadius: 8, border: "1px solid var(--border-default)", padding: "0 var(--spacing-8)", background: "var(--surface-default)", color: "var(--text-primary)" }}
          >
            <option value="">New wheel…</option>
            {wheels.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Wheel name" />
      </div>

      <div className="stream-tools__field">
        <div className="stream-tools__field-head">
          <strong>Segments</strong>
          <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
            {segments.length} / {MAX_SEGMENTS} · need at least 2
          </span>
        </div>
        <div className="stream-tools__additem">
          <input
            type="text"
            value={newSeg}
            onChange={(e) => setNewSeg(e.target.value.slice(0, MAX_LABEL))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSeg();
              }
            }}
            placeholder="Add a segment and press Enter"
            disabled={segments.length >= MAX_SEGMENTS}
          />
          <Button variant="secondary" size="small" onClick={addSeg} disabled={!newSeg.trim() || segments.length >= MAX_SEGMENTS}>
            Add
          </Button>
        </div>
        {segments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "var(--spacing-8)", maxWidth: 420 }}>
            {segments.map((seg, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
                <input
                  type="text"
                  value={seg.label}
                  onChange={(e) => updateSeg(i, e.target.value)}
                  aria-label={`Segment ${i + 1}`}
                  style={{ flex: "1 1 auto", height: 30, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 8px", background: "var(--surface-default)", color: "var(--text-primary)" }}
                />
                {seg.color ? (
                  <span title={`Color ${seg.color}`} style={{ width: 20, height: 20, borderRadius: 4, background: seg.color, border: "1px solid var(--border-default)", flex: "0 0 auto" }} />
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove segment ${i + 1}`}
                  onClick={() => removeSeg(i)}
                  style={{ flex: "0 0 auto", width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-secondary)", cursor: "pointer", lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <Button variant="secondary" size="small" loading={saving} onClick={save}>
          Save wheel
        </Button>
        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
          Colors, theme &amp; viewer entries in{" "}
          <Link href="/account?tab=wheels">Account → Wheels</Link>.
        </span>
      </div>

      {live ? <div className="stream-tools__live">{live}</div> : null}
    </section>
  );
}
