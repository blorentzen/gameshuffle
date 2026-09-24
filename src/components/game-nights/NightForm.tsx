"use client";

import { useEffect, useRef, useState } from "react";
import { TagCombobox } from "@/components/ui/TagCombobox";
import { useRouter } from "next/navigation";
import { Button, Chip, Input, Select, Textarea } from "@empac/cascadeds";
import { BOARD_GAME_GENRE_SUGGESTIONS, BOARD_GAME_LEVELS } from "@/data/board-games";
import { CADENCES } from "@/lib/game-nights/seriesSchedule";
import { GamesBroughtInput } from "./GamesBroughtInput";
import { PlaceAutocompleteInput } from "@/components/maps/PlaceAutocompleteInput";
import { useToast } from "@/components/toast/ToastProvider";
import { NIGHT_KINDS, type GameNight, type NightGame, type NightKind } from "@/lib/game-nights/types";

/** ISO → a `datetime-local` value in the viewer's local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Create OR edit a game night. Pass `nightId` + `initial` to edit; omit
 * both to create. Same form either way.
 */
export function NightForm({
  nightId,
  initial,
}: {
  nightId?: string;
  initial?: GameNight;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = !!nightId;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [place, setPlace] = useState(initial?.place ?? "");
  // Coords captured from Places autocomplete (skip a server geocode when set).
  // Cleared when the host edits the text so we don't ship a stale pin.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : "");
  const [visibility, setVisibility] = useState(initial?.visibility ?? "public");
  const [genres, setGenres] = useState<string[]>(initial?.genres ?? []);
  const [level, setLevel] = useState(initial?.level ?? "");
  const [kind, setKind] = useState<NightKind>(initial?.kind ?? "board");
  const [games, setGames] = useState<NightGame[]>(initial?.games ?? []);
  const [repeat, setRepeat] = useState<string>("none"); // create-only: recurring cadence
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Edit mode autosaves (debounced) like the tournament editor; create keeps an
  // explicit "Create night" button (no night id to patch yet).
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Cover image. `coverFile` is a freshly chosen file; `coverUrl` is the preview.
  // In edit mode the cover applies immediately (autosave); in create it rides
  // along with the "Create night" submit (there's no id to attach it to yet).
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.cover_image_url ?? null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const onCoverChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverFile(file);
    setCoverRemoved(false);
    setCoverUrl(URL.createObjectURL(file));
    if (editing && nightId) {
      setCoverBusy(true);
      setSaveState("saving");
      try {
        const fd = new FormData();
        fd.append("file", file);
        const cr = await fetch(`/api/game-nights/${nightId}/cover`, { method: "POST", body: fd });
        setSaveState(cr.ok ? "saved" : "error");
        if (!cr.ok) toast.error("Couldn't upload the cover.");
      } catch { setSaveState("error"); toast.error("Network error uploading the cover."); }
      setCoverBusy(false);
    }
  };
  const removeCover = async () => {
    setCoverFile(null);
    setCoverUrl(null);
    setCoverRemoved(true);
    if (editing && nightId) {
      setCoverBusy(true);
      try { await fetch(`/api/game-nights/${nightId}/cover`, { method: "DELETE" }); setSaveState("saved"); }
      catch { /* best effort */ }
      setCoverBusy(false);
    }
  };

  // Datetime is timezone-sensitive — set it client-side to avoid an SSR mismatch.
  useEffect(() => {
    if (initial?.starts_at) setStartsAt(toLocalInput(initial.starts_at));
  }, [initial?.starts_at]);

  const addGenre = (g: string) => {
    const t = g.trim();
    if (t && !genres.includes(t)) setGenres([...genres, t]);
  };

  // ── Autosave (edit mode) ──────────────────────────────────────────────────
  const buildPayload = () => ({
    title,
    description,
    place,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    starts_at: startsAt ? new Date(startsAt).toISOString() : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    capacity: capacity ? Number(capacity) : null,
    visibility,
    genres,
    level: level || null,
    kind,
    games,
    status: "scheduled" as const,
  });

  // Arm autosave a tick after mount so the initial values + the client-side
  // datetime hydration don't fire a spurious save on load.
  const armed = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => { armed.current = true; }, 60);
    return () => window.clearTimeout(t);
  }, []);

  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!editing || !armed.current) return;
    if (!title.trim()) return; // never autosave an empty title away
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/game-nights/${nightId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload()),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch { setSaveState("error"); }
    }, 800);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, title, description, place, coords, startsAt, capacity, visibility, genres, level, kind, games]);

  async function submit() {
    if (!title.trim()) {
      setError("Give your night a title.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title,
      description,
      place,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      capacity: capacity ? Number(capacity) : null,
      visibility,
      genres,
      level: level || null,
      kind,
      games,
      status: "scheduled" as const,
      ...(editing ? {} : { repeat }),
    };
    try {
      const res = await fetch(
        editing ? `/api/game-nights/${nightId}` : "/api/game-nights",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok) {
        setError(data?.error || "Couldn't save the night. Try again.");
        setSaving(false);
        return;
      }
      const savedId = editing ? nightId! : data?.id;

      // Apply the cover to the (now-existing) night. The cover route is guarded
      // (migration_pending / R2), so a cover hiccup never blocks the save.
      if (savedId && coverFile) {
        try {
          const fd = new FormData();
          fd.append("file", coverFile);
          const cr = await fetch(`/api/game-nights/${savedId}/cover`, { method: "POST", body: fd });
          if (!cr.ok) toast.info("Night saved. The cover image couldn't be uploaded.");
        } catch { toast.info("Night saved. The cover image couldn't be uploaded."); }
      } else if (savedId && editing && coverRemoved) {
        try { await fetch(`/api/game-nights/${savedId}/cover`, { method: "DELETE" }); } catch { /* best effort */ }
      }

      toast.success(editing ? "Night updated" : "Night created");
      router.push(`/game-nights/${savedId}`);
    } catch {
      setError("Couldn't save the night. Try again.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!nightId || !window.confirm("Delete this night? This can't be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/game-nights/${nightId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Night deleted");
        router.push("/game-nights");
      } else {
        setError("Couldn't delete the night.");
        setDeleting(false);
      }
    } catch {
      setError("Couldn't delete the night.");
      setDeleting(false);
    }
  }

  return (
    <div className="bgn-form">
      <div className="account-card bgn-cover-uploader">
        <h2 className="bgn-event-h2">Cover image</h2>
        <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", margin: "0 0 var(--spacing-16)" }}>
          Optional. Shown on the night&rsquo;s page and its card. Without one, a branded gradient is used.
        </p>
        <div className="bgn-cover-uploader__preview">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="Night cover" className="bgn-cover-uploader__img" />
          ) : (
            <div className="bgn-cover-uploader__placeholder">No cover yet</div>
          )}
        </div>
        <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onCoverChosen} />
        <div className="bgn-cover-uploader__actions">
          <Button variant="secondary" size="small" onClick={() => coverInputRef.current?.click()} disabled={saving || coverBusy}>
            {coverBusy ? "Uploading…" : coverUrl ? "Replace cover" : "Upload cover"}
          </Button>
          {coverUrl && <Button variant="ghost" size="small" onClick={removeCover} disabled={saving || coverBusy}>Remove</Button>}
        </div>
      </div>

      <div className="account-card">
        <div className="bgn-field">
          <label className="account-card__label">Title</label>
          <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday game night" />
        </div>
        <div className="bgn-field">
          <label className="account-card__label">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's the vibe? Snacks, BYO games, newcomers welcome…" rows={3} fullWidth />
        </div>
        <div className="bgn-field-row">
          <div className="bgn-field">
            <label className="account-card__label">Where</label>
            <PlaceAutocompleteInput
              value={place}
              onChange={(text) => { setPlace(text); setCoords(null); }}
              onPick={(p) => { setPlace(p.address); setCoords(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null); }}
              placeholder="Venue or address"
            />
          </div>
          <div className="bgn-field">
            <label className="account-card__label">When</label>
            <input className="save-setup-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
        </div>
        <div className="bgn-field-row">
          <div className="bgn-field">
            <label className="account-card__label">Capacity (optional)</label>
            <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="No limit" />
          </div>
          <div className="bgn-field">
            <label className="account-card__label">Visibility</label>
            <Select
              value={visibility}
              onChange={(v) => setVisibility((typeof v === "string" ? v : v[0] ?? "public") as "public" | "unlisted")}
              options={[
                { value: "public", label: "Public — listed for anyone to find" },
                { value: "unlisted", label: "Unlisted — only people with the link" },
              ]}
            />
          </div>
        </div>
        {!editing && (
          <div className="bgn-field">
            <label className="account-card__label">Repeat</label>
            <Select
              value={repeat}
              onChange={(v) => setRepeat(typeof v === "string" ? v : v[0] ?? "none")}
              options={[{ value: "none", label: "One-time night" }, ...CADENCES.map((c) => ({ value: c.value, label: c.label }))]}
            />
            {repeat !== "none" && (
              <p style={{ marginTop: "var(--spacing-6)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                This night recurs {CADENCES.find((c) => c.value === repeat)?.label.toLowerCase()}. We&apos;ll keep the next one scheduled automatically. Set a date above to start the series.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="account-card">
        <h2>Who it&apos;s for</h2>
        <div className="bgn-field">
          <label className="account-card__label">Game types</label>
          <div className="game-select">
            <TagCombobox
              options={BOARD_GAME_GENRE_SUGGESTIONS.filter((g) => !genres.includes(g)).map((g) => ({ value: g, label: g }))}
              onAdd={addGenre}
              placeholder="Add a type — or type your own…"
              size="medium"
              allowCreate
              createLabel="Add"
            />
            {genres.length > 0 && (
              <div className="game-chips">
                {genres.map((g) => (
                  <Chip key={g} label={g} removable onRemove={() => setGenres(genres.filter((x) => x !== g))} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="bgn-field">
          <label className="account-card__label">What are you playing?</label>
          <Select
            value={kind}
            onChange={(v) => setKind((typeof v === "string" ? v : v[0] ?? "board") as NightKind)}
            options={NIGHT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          />
        </div>
        <div className="bgn-field">
          <label className="account-card__label">Skill level</label>
          <Select
            value={level}
            onChange={(v) => setLevel((typeof v === "string" ? v : v[0] ?? "") as typeof level)}
            options={[{ value: "", label: "Any / mixed" }, ...BOARD_GAME_LEVELS.map((l) => ({ value: l.value, label: l.label }))]}
          />
        </div>
      </div>

      <div className="account-card">
        <h2>Games being brought</h2>
        <p style={{ marginBottom: "var(--spacing-16)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
          Type any game, set a length, and tap the image slot to attach a photo so it&apos;s easy
          to recognize.
        </p>
        <GamesBroughtInput games={games} onChange={setGames} kind={kind} />
      </div>

      {error && <p className="bgn-error">{error}</p>}

      <div className="bgn-actions">
        {editing ? (
          <>
            <span style={{ marginRight: "auto" }}>
              <Button variant="ghost" onClick={remove} disabled={deleting || coverBusy}>
                {deleting ? "Deleting…" : "Delete night"}
              </Button>
            </span>
            <span style={{ fontSize: "var(--font-size-14)", color: saveState === "error" ? "var(--error-600, #c11a10)" : "var(--text-tertiary)" }}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : saveState === "error" ? "Couldn't save — check your connection" : "Changes save automatically"}
            </span>
          </>
        ) : (
          <Button variant="primary" size="large" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create night"}
          </Button>
        )}
      </div>
    </div>
  );
}
