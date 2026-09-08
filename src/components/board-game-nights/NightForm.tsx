"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Combobox, Input, Select, Textarea } from "@empac/cascadeds";
import { BOARD_GAME_GENRE_SUGGESTIONS, BOARD_GAME_LEVELS } from "@/data/board-games";
import { GamesBroughtInput } from "./GamesBroughtInput";
import { useToast } from "@/components/toast/ToastProvider";
import type { BoardGameNight, NightGame } from "@/lib/board-game-nights/types";

/** ISO → a `datetime-local` value in the viewer's local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Create OR edit a board-game night. Pass `nightId` + `initial` to edit; omit
 * both to create. Same form either way.
 */
export function NightForm({
  nightId,
  initial,
}: {
  nightId?: string;
  initial?: BoardGameNight;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = !!nightId;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : "");
  const [visibility, setVisibility] = useState(initial?.visibility ?? "public");
  const [genres, setGenres] = useState<string[]>(initial?.genres ?? []);
  const [genreQuery, setGenreQuery] = useState("");
  const [level, setLevel] = useState(initial?.level ?? "");
  const [games, setGames] = useState<NightGame[]>(initial?.games ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datetime is timezone-sensitive — set it client-side to avoid an SSR mismatch.
  useEffect(() => {
    if (initial?.starts_at) setStartsAt(toLocalInput(initial.starts_at));
  }, [initial?.starts_at]);

  const addGenre = (g: string) => {
    const t = g.trim();
    if (t && !genres.includes(t)) {
      setGenres([...genres, t]);
      setGenreQuery("");
    }
  };

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
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      capacity: capacity ? Number(capacity) : null,
      visibility,
      genres,
      level: level || null,
      games,
      status: "scheduled" as const,
    };
    try {
      const res = await fetch(
        editing ? `/api/board-game-nights/${nightId}` : "/api/board-game-nights",
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
      toast.success(editing ? "Night updated" : "Night created");
      router.push(`/board-game-nights/${editing ? nightId : data?.id}`);
    } catch {
      setError("Couldn't save the night. Try again.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!nightId || !window.confirm("Delete this night? This can't be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/board-game-nights/${nightId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Night deleted");
        router.push("/board-game-nights");
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
      <div className="account-card">
        <div className="bgn-field">
          <label className="account-card__label">Title</label>
          <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday board-game night" />
        </div>
        <div className="bgn-field">
          <label className="account-card__label">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's the vibe? Snacks, BYO games, newcomers welcome…" rows={3} />
        </div>
        <div className="bgn-field-row">
          <div className="bgn-field">
            <label className="account-card__label">Where</label>
            <Input type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Venue or address" />
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
      </div>

      <div className="account-card">
        <h2>Who it&apos;s for</h2>
        <div className="bgn-field">
          <label className="account-card__label">Game types</label>
          <div className="game-select">
            <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <Combobox
                  value={genreQuery}
                  onChange={(v) => {
                    if (BOARD_GAME_GENRE_SUGGESTIONS.includes(v) && !genres.includes(v)) addGenre(v);
                    else setGenreQuery(v);
                  }}
                  options={BOARD_GAME_GENRE_SUGGESTIONS.filter((g) => !genres.includes(g)).map((g) => ({ value: g, label: g }))}
                  placeholder="Add a type — or type your own…"
                  size="medium"
                />
              </div>
              <Button variant="secondary" size="medium" onClick={() => addGenre(genreQuery)}>Add</Button>
            </div>
            {genres.length > 0 && (
              <div className="game-chips">
                {genres.map((g) => (
                  <span key={g} className="game-chip">
                    <span>{g}</span>
                    <button type="button" className="game-chip__remove" aria-label={`Remove ${g}`} onClick={() => setGenres(genres.filter((x) => x !== g))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
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
        <GamesBroughtInput games={games} onChange={setGames} />
      </div>

      {error && <p className="bgn-error">{error}</p>}

      <div className="bgn-actions">
        {editing && (
          <span style={{ marginRight: "auto" }}>
            <Button variant="ghost" onClick={remove} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete night"}
            </Button>
          </span>
        )}
        <Button variant="primary" size="large" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Create night"}
        </Button>
      </div>
    </div>
  );
}
