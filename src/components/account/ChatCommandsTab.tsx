"use client";

/**
 * ChatCommandsTab — streamer-level custom chat command editor.
 *
 * Lives under `/account?tab=chat-commands` (sidebar: Streamer → Chat
 * Commands). Reads + writes rows from `gs_custom_commands` for the
 * authenticated streamer's community via the
 * `/api/account/custom-commands` endpoints.
 *
 * Shape:
 *   - Top card: helper text + template-variable cheat sheet.
 *   - List of existing commands with inline trigger / response /
 *     actor + a Delete button.
 *   - Bottom card: add-command form (trigger, response, actor).
 *
 * Edit-in-place is intentionally deferred — delete + re-add covers
 * the common "fix a typo" case in one flow without the state mgmt
 * cost of inline editing. Easy to layer in later.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Accordion,
  Alert,
  Button,
  Card,
  Input,
  Select,
} from "@empac/cascadeds";
import { DefaultCommandOverridesSection } from "./DefaultCommandOverridesSection";
import { EventOverridesSection } from "./EventOverridesSection";
import { VariableAutocomplete } from "./VariableAutocomplete";

interface CustomCommandRow {
  id: string;
  community_id: string;
  trigger: string;
  response_tmpl: string;
  actor: "everyone" | "crew" | "host";
  cooldown_s: number;
  enabled: boolean;
  use_count: number;
}

const ACTOR_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "crew", label: "Mods + broadcaster" },
  { value: "host", label: "Broadcaster only" },
];

const ACTOR_LABEL: Record<CustomCommandRow["actor"], string> = {
  everyone: "Everyone",
  crew: "Mods + broadcaster",
  host: "Broadcaster only",
};

export function ChatCommandsTab() {
  const [rows, setRows] = useState<CustomCommandRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noCommunity, setNoCommunity] = useState(false);
  const [communitySlug, setCommunitySlug] = useState<string | null>(null);

  // Add-form state
  const [newTrigger, setNewTrigger] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [newActor, setNewActor] = useState<CustomCommandRow["actor"]>(
    "everyone",
  );
  const [newCooldown, setNewCooldown] = useState("5");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/account/custom-commands", {
        cache: "no-store",
      });
      if (res.status === 404) {
        setNoCommunity(true);
        setRows([]);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load (${res.status}).`);
        setRows([]);
        return;
      }
      const body = (await res.json()) as {
        rows: CustomCommandRow[];
        community?: { slug: string; displayName: string | null } | null;
      };
      setRows(body.rows);
      setCommunitySlug(body.community?.slug ?? null);
      setNoCommunity(false);
    } catch {
      setLoadError("Network error while loading commands.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    setAddError(null);
    const trigger = newTrigger.trim();
    const responseTmpl = newResponse.trim();
    if (!trigger) return setAddError("Trigger is required.");
    if (!responseTmpl) return setAddError("Response text is required.");
    const cooldown = parseInt(newCooldown, 10);
    if (Number.isNaN(cooldown) || cooldown < 0) {
      return setAddError("Cooldown must be 0 or higher.");
    }
    setAdding(true);
    try {
      const res = await fetch("/api/account/custom-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger,
          responseTmpl,
          actor: newActor,
          cooldownSeconds: cooldown,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setAddError(body.error || `Save failed (${res.status}).`);
        return;
      }
      setNewTrigger("");
      setNewResponse("");
      setNewActor("everyone");
      setNewCooldown("5");
      void load();
    } catch {
      setAddError("Network error while saving.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/account/custom-commands/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Delete failed (${res.status}).`);
        return;
      }
      void load();
    } catch {
      setLoadError("Network error while deleting.");
    } finally {
      setDeletingId(null);
    }
  };

  if (noCommunity) {
    return (
      <div className="account-card">
        <h2 className="account-tab__heading">Chat Commands</h2>
        <Alert variant="info">
          Connect Twitch on{" "}
          <a href="/account?tab=integrations">
            Account → Integrations
          </a>{" "}
          to start your community. Once it&rsquo;s set up the default
          commands (<code>!socials</code>, <code>!discord</code>,{" "}
          <code>!so</code>, etc.) will seed automatically and this
          editor will surface them.
        </Alert>
      </div>
    );
  }

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Chat Commands</h2>
      <p className="account-tab__intro">
        Static-response commands viewers can run with{" "}
        <code>!trigger</code> in your Twitch chat. Defaults like{" "}
        <code>!socials</code> and <code>!so</code> are seeded when
        your community is created — edit the response below or add new
        ones. Use the template variables for dynamic responses.
      </p>

      {loadError && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      <Accordion
        variant="bordered"
        allowMultiple
        defaultOpenIds={["custom"]}
        items={[
          {
            id: "custom",
            title: "Your custom commands",
            description:
              rows === null
                ? "Loading…"
                : rows.length === 0
                  ? "No custom commands yet — add one below."
                  : `${rows.length} custom command${rows.length === 1 ? "" : "s"} on your channel`,
            content: (
              <div>
                {communitySlug && (
                  <div
                    style={{
                      marginBottom: "var(--spacing-16)",
                      padding:
                        "var(--spacing-12) var(--spacing-16)",
                      background: "var(--background-secondary)",
                      borderRadius: "var(--radius-medium)",
                      fontSize: "var(--font-size-14)",
                      color: "var(--text-secondary)",
                      lineHeight: "var(--line-height-relaxed)",
                    }}
                  >
                    📜 Viewers can browse your{" "}
                    <code>!quote</code> pool at{" "}
                    <a
                      href={`/quotes/${communitySlug}`}
                      style={{
                        color: "var(--text-primary)",
                        fontWeight:
                          "var(--font-weight-semibold)",
                      }}
                    >
                      gameshuffle.co/quotes/{communitySlug}
                    </a>
                    . Mods grow it with{" "}
                    <code>!quote add &lt;text&gt;</code> in chat.
                  </div>
                )}
                {rows === null ? (
                  <p className="account-tab__empty">Loading…</p>
                ) : rows.length === 0 ? (
                  <p className="account-tab__empty">
                    No commands yet. Add one below to get started.
                  </p>
                ) : (
                  <div className="chat-commands__list">
                    {rows.map((row) => (
                      <Card
                        key={row.id}
                        variant="outlined"
                        padding="medium"
                        className="chat-commands__row"
                      >
                        <div className="chat-commands__row-meta">
                          <code className="chat-commands__trigger">
                            {row.trigger}
                          </code>
                          <span className="chat-commands__row-actor">
                            {ACTOR_LABEL[row.actor]} · {row.cooldown_s}s
                            cooldown
                          </span>
                        </div>
                        <p className="chat-commands__response">
                          {row.response_tmpl}
                        </p>
                        <div className="chat-commands__row-actions">
                          <Button
                            variant="danger"
                            size="small"
                            onClick={() => handleDelete(row.id)}
                            loading={deletingId === row.id}
                            disabled={deletingId !== null}
                          >
                            Delete
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <h4
                  style={{
                    fontSize: "var(--font-size-14)",
                    fontWeight:
                      "var(--font-weight-semibold)",
                    color: "var(--text-secondary)",
                    margin:
                      "var(--spacing-24) 0 var(--spacing-8)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Add a command
                </h4>
                <Card variant="outlined" padding="medium">
                  {addError && (
                    <div
                      style={{
                        marginBottom: "var(--spacing-12)",
                      }}
                    >
                      <Alert
                        variant="error"
                        onClose={() => setAddError(null)}
                      >
                        {addError}
                      </Alert>
                    </div>
                  )}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "var(--spacing-16)",
                    }}
                  >
          <div>
            <label
              className="account-card__label"
              style={{
                display: "block",
                marginBottom: "var(--spacing-8)",
              }}
            >
              Trigger
            </label>
            <Input
              type="text"
              value={newTrigger}
              onChange={(e) => setNewTrigger(e.target.value)}
              placeholder="!discord"
              fullWidth
            />
            <p
              style={{
                margin: "var(--spacing-4) 0 0",
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
              }}
            >
              Include the leading <code>!</code>. Single word only.
            </p>
          </div>
          <div>
            <label
              className="account-card__label"
              style={{
                display: "block",
                marginBottom: "var(--spacing-8)",
              }}
            >
              Who can run it
            </label>
            <Select
              options={ACTOR_OPTIONS}
              value={newActor}
              onChange={(v) =>
                setNewActor(
                  (Array.isArray(v) ? v[0] : v) as CustomCommandRow["actor"],
                )
              }
              fullWidth
            />
          </div>
        </div>
        <div style={{ marginTop: "var(--spacing-16)" }}>
          <label
            className="account-card__label"
            style={{
              display: "block",
              marginBottom: "var(--spacing-8)",
            }}
          >
            Response
          </label>
          {/* Both `$name` and `{name}` syntaxes substitute against
              the same variable set. Autocomplete inserts the `{}`
              form (canonical across GameShuffle); legacy `$name` in
              existing commands keeps working. */}
          <VariableAutocomplete
            value={newResponse}
            onChange={setNewResponse}
            placeholder="👋 Welcome to the stream, {user}!"
            rows={2}
            ariaLabel="Custom command response"
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px 1fr",
            gap: "var(--spacing-16)",
            marginTop: "var(--spacing-16)",
            alignItems: "end",
          }}
        >
          <div>
            <label
              className="account-card__label"
              style={{
                display: "block",
                marginBottom: "var(--spacing-8)",
              }}
            >
              Cooldown (seconds)
            </label>
            <Input
              type="number"
              min={0}
              max={3600}
              value={newCooldown}
              onChange={(e) => setNewCooldown(e.target.value)}
              fullWidth
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="primary"
              onClick={handleAdd}
              loading={adding}
              disabled={adding}
            >
              Save command
            </Button>
          </div>
                  </div>
                </Card>
              </div>
            ),
          },
          {
            id: "defaults",
            title: "Platform default commands",
            description:
              "Built-in commands every streamer gets (!hype, !discord, !8ball, !roll…). Pick Off, Default, or Override per command.",
            content: <DefaultCommandOverridesSection hideHeader />,
          },
          {
            id: "events",
            title: "Platform events",
            description:
              "Curated chaos / random / direct-trigger events. Override flavor text or flip the direct-trigger flag per community.",
            content: <EventOverridesSection hideHeader />,
          },
          {
            id: "variables",
            title: "Template variables reference",
            description:
              "Type `{` in any response or flavor field for inline autocomplete — this card is the at-a-glance reference.",
            content: (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "var(--spacing-8) var(--spacing-16)",
                  fontSize: "var(--font-size-14)",
                  color: "var(--text-secondary)",
                }}
              >
                <span>
                  <code>{`{user}`}</code> — caller&rsquo;s display name
                </span>
                <span>
                  <code>{`{touser}`}</code> — first @user arg,
                  defaults to caller
                </span>
                <span>
                  <code>{`{streamer}`}</code> — broadcaster name
                </span>
                <span>
                  <code>{`{game}`}</code> — current game
                </span>
                <span>
                  <code>{`{random}`}</code> — 0–99
                </span>
                <span>
                  <code>{`{count}`}</code> — usage counter
                </span>
                <span>
                  <code>{`{uptime}`}</code> — stream uptime
                </span>
                <span>
                  <code>{`{followage}`}</code> — caller follow
                  duration
                </span>
                <span>
                  <code>{`{discord_invite}`}</code> — Discord invite
                </span>
                <span>
                  <code>{`{discord}`}</code> /{" "}
                  <code>{`{youtube}`}</code> /{" "}
                  <code>{`{twitter}`}</code> — socials
                </span>
                <span>
                  <code>{`{psn}`}</code> / <code>{`{nso}`}</code> /{" "}
                  <code>{`{xbox}`}</code> /{" "}
                  <code>{`{steam}`}</code> — gamertags
                </span>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
