"use client";

/**
 * CommandPoolModal — streamer editor for a pool command's response list
 * (8ball, quote, hype, …). The engine draws a weighted pick blending the
 * platform canon with this community's entries; this modal is the window
 * into that blend, scoped to the streamer.
 *
 *   - Platform responses — read-only (the shipped canon).
 *   - Your responses     — add / edit / remove (community-scoped).
 *
 * Talks to /api/account/command-pool/[commandId](/[responseId]).
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Switch } from "@empac/cascadeds";

interface CommunityEntry {
  id: string;
  response: string;
  weight: number;
  enabled: boolean;
  sort_order: number;
}

interface Props {
  commandId: string;
  trigger: string;
  isOpen: boolean;
  onClose: () => void;
  /** Fired after any add/edit/delete so the parent can refresh counts. */
  onChanged?: () => void;
}

export function CommandPoolModal({
  commandId,
  trigger,
  isOpen,
  onClose,
  onChanged,
}: Props) {
  const [platform, setPlatform] = useState<{ response: string }[]>([]);
  const [community, setCommunity] = useState<CommunityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newResponse, setNewResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/command-pool/${encodeURIComponent(commandId)}`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Load failed (${res.status}).`);
        return;
      }
      setPlatform(body.platform ?? []);
      setCommunity(body.community ?? []);
    } catch {
      setError("Network error while loading.");
    } finally {
      setLoading(false);
    }
  }, [commandId]);

  useEffect(() => {
    if (isOpen) {
      setEditingId(null);
      setNewResponse("");
      void load();
    }
  }, [isOpen, load]);

  const handleAdd = async () => {
    const response = newResponse.trim();
    if (!response) return setError("Response text is required.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/command-pool/${encodeURIComponent(commandId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Save failed (${res.status}).`);
        return;
      }
      setNewResponse("");
      await load();
      onChanged?.();
    } catch {
      setError("Network error while saving.");
    } finally {
      setBusy(false);
    }
  };

  const handleEditSave = async (id: string) => {
    const response = editText.trim();
    if (!response) return setError("Response text is required.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/command-pool/${encodeURIComponent(commandId)}/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Save failed (${res.status}).`);
        return;
      }
      setEditingId(null);
      await load();
      onChanged?.();
    } catch {
      setError("Network error while saving.");
    } finally {
      setBusy(false);
    }
  };

  /** Enable/disable one of your responses. A disabled entry stays in the
   *  list but drops out of the pick rotation — a softer alternative to
   *  removing it outright. */
  const handleToggle = async (id: string, next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/command-pool/${encodeURIComponent(commandId)}/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Save failed (${res.status}).`);
        return;
      }
      await load();
      onChanged?.();
    } catch {
      setError("Network error while saving.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/command-pool/${encodeURIComponent(commandId)}/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Delete failed (${res.status}).`);
        return;
      }
      await load();
      onChanged?.();
    } catch {
      setError("Network error while deleting.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Responses for !${trigger}`}
      size="medium"
      primaryAction={{ label: "Done", onClick: onClose }}
    >
      <div className="cmd-pool">
        <p className="cmd-pool__intro">
          When <code>!{trigger}</code> fires, it picks at random from the
          platform responses <strong>plus</strong> the ones you add here.
        </p>

        {error && (
          <div style={{ marginBottom: "var(--spacing-12)" }}>
            <Alert variant="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}

        <h4 className="cmd-pool__heading">
          Your responses{" "}
          <span className="cmd-pool__count">({community.length})</span>
        </h4>

        <div className="cmd-pool__add">
          <Input
            type="text"
            value={newResponse}
            onChange={(e) => setNewResponse(e.target.value)}
            placeholder="Add your own response…"
            fullWidth
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void handleAdd();
            }}
          />
          <Button
            variant="primary"
            size="small"
            onClick={handleAdd}
            loading={busy && editingId === null}
            disabled={busy}
          >
            Add
          </Button>
        </div>

        {community.length === 0 ? (
          <p className="cmd-pool__empty">
            No responses of your own yet — add one above to layer it into the
            pool.
          </p>
        ) : (
          <ul className="cmd-pool__list">
            {community.map((c) => (
              <li key={c.id} className="cmd-pool__row">
                {editingId === c.id ? (
                  <>
                    <Input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      fullWidth
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !busy) void handleEditSave(c.id);
                      }}
                    />
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => void handleEditSave(c.id)}
                      loading={busy}
                      disabled={busy}
                    >
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Switch
                      checked={c.enabled}
                      onChange={() => void handleToggle(c.id, !c.enabled)}
                      disabled={busy}
                      aria-label={`Enable response "${c.response.slice(0, 40)}"`}
                    />
                    <span
                      className={`cmd-pool__text${c.enabled ? "" : " cmd-pool__text--off"}`}
                    >
                      {c.response}
                    </span>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => {
                        setError(null);
                        setEditingId(c.id);
                        setEditText(c.response);
                      }}
                      disabled={busy}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => void handleDelete(c.id)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <h4 className="cmd-pool__heading cmd-pool__heading--platform">
          Platform responses{" "}
          <span className="cmd-pool__count">({platform.length})</span>
        </h4>
        {loading ? (
          <p className="cmd-pool__empty">Loading…</p>
        ) : platform.length === 0 ? (
          <p className="cmd-pool__empty">
            No platform responses — this pool is entirely yours to fill.
          </p>
        ) : (
          <ul className="cmd-pool__list cmd-pool__list--readonly">
            {platform.map((p, i) => (
              <li key={i} className="cmd-pool__row cmd-pool__row--readonly">
                <span className="cmd-pool__text">{p.response}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
