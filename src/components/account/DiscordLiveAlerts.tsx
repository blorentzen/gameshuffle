"use client";

/**
 * Discord bot ▸ Channels & posts ▸ Go-live alerts (GS Pro). Pick creators for
 * this server (someone you follow on GameShuffle, or any Twitch channel) and
 * the bot posts in the channel you choose when one goes live, with an optional
 * role ping and your own message. Up to 25 per server; settings per server
 * like the rest of the bot. API: /api/discord/bot/live-alerts?guild=.
 */

import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Input, Modal, Select, Switch, Textarea } from "@empac/cascadeds";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { IconAction, RowActions } from "@/components/actions/IconAction";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";

interface Alert {
  id: string;
  broadcasterId: string;
  login: string;
  name: string;
  gsUserId: string | null;
  gsUsername: string | null;
  message: string | null;
  enabled: boolean;
  lastPostedAt: string | null;
}
interface Followed { userId: string; username: string | null; name: string; twitchLogin: string }

/** CDS Select treats "" as no choice, so "none" needs its own value. */
const NONE = "none";
const PICK = "pick";

const ERRORS: Record<string, string> = {
  limit: "That's 25 creators on this server, the most it can have.",
  not_found: "There's no Twitch channel with that name.",
  bad_name: "That doesn't look like a Twitch channel name.",
  no_twitch: "They haven't linked Twitch to GameShuffle yet.",
  not_following: "You need to follow them on GameShuffle first.",
  exists: "They're already on this server's list.",
  too_long: "Keep the message to 300 characters.",
  blocked: "That message has a word we don't post.",
  pro_required: "Go-live alerts are part of GS Pro.",
};

const sample = (msg: string | null, name: string) => {
  const link = "twitch.tv/…";
  if (!msg) return `${name} is live with Mario Kart World! ${link}`;
  const text = msg.replaceAll("{name}", name).replaceAll("{game}", "Mario Kart World").replaceAll("{title}", "Rainbow Road or bust").replaceAll("{link}", link);
  return msg.includes("{link}") ? text : `${text} ${link}`;
};

export function DiscordLiveAlerts({ withGuild, channels, roles }: {
  withGuild: (url: string) => string;
  channels: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string }>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [followed, setFollowed] = useState<Followed[]>([]);
  const [limit, setLimit] = useState(25);
  const [routing, setRoutingState] = useState<{ channelId: string | null; roleId: string | null }>({ channelId: null, roleId: null });
  const [pickFollowed, setPickFollowed] = useState(PICK);
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; message: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(withGuild("/api/discord/bot/live-alerts"), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { setAlerts([]); return; }
    setAlerts(d.alerts);
    setFollowed(d.followed ?? []);
    setLimit(d.limit ?? 25);
    setRoutingState(d.routing ?? { channelId: null, roleId: null });
  }, [withGuild]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function saveRouting(next: { channelId: string | null; roleId: string | null }) {
    const prev = routing;
    setRoutingState(next);
    const d = await fetch(withGuild("/api/discord/bot/live-alerts"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) })
      .then((r) => r.json()).catch(() => null);
    if (d?.ok) toast.success("Saved");
    else { setRoutingState(prev); toast.error(ERRORS[d?.error] ?? "Couldn't save that. Try again."); }
  }

  async function add(body: { login?: string; gsUserId?: string }) {
    setBusy(true);
    const d = await fetch(withGuild("/api/discord/bot/live-alerts"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      toast.success(`${d.alert.name} added`);
      setLogin("");
      setPickFollowed(PICK);
      await load();
    } else toast.error(ERRORS[d?.error] ?? "Couldn't add them. Try again.");
  }

  async function patch(id: string, body: { message?: string | null; enabled?: boolean }, done: string) {
    const d = await fetch(withGuild("/api/discord/bot/live-alerts"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) })
      .then((r) => r.json()).catch(() => null);
    if (d?.ok) { toast.success(done); await load(); return true; }
    toast.error(ERRORS[d?.error] ?? "Couldn't save that. Try again.");
    return false;
  }

  async function remove(a: Alert) {
    if (!(await confirm({ title: `Stop alerts for ${a.name}?`, body: "The bot stops posting when they go live on this server.", confirmLabel: "Remove" }))) return;
    const d = await fetch(withGuild(`/api/discord/bot/live-alerts?id=${a.id}`), { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { toast.success(`${a.name} removed`); setAlerts(d.alerts); await load(); }
    else toast.error("Couldn't remove them. Try again.");
  }

  const full = (alerts?.length ?? 0) >= limit;

  return (
    <div className="account-card">
      <h2 className="account-card__title">Go-live alerts</h2>
      <p className="dbot-muted">
        Post when creators you choose go live on Twitch: someone you follow on GameShuffle, or any Twitch channel.
        Your own channel already posts with your going-live setting above.
      </p>

      <div className="dbot-alerts__routing">
        <Select
          floatingLabel="Post in"
          value={routing.channelId ?? PICK}
          onChange={(v) => void saveRouting({ ...routing, channelId: v === PICK ? null : String(v) })}
          options={[{ value: PICK, label: "Pick a channel" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
        />
        <Select
          floatingLabel="Ping"
          value={routing.roleId ?? NONE}
          onChange={(v) => void saveRouting({ ...routing, roleId: v === NONE ? null : String(v) })}
          options={[{ value: NONE, label: "No ping" }, ...roles.map((r) => ({ value: r.id, label: `@${r.name}` }))]}
        />
      </div>
      {!routing.channelId && (alerts?.length ?? 0) > 0 && <p className="dbot-warn">Pick a channel so these alerts have somewhere to post.</p>}

      <div className="dbot-alerts__add">
        <div className="dbot-alerts__add-part">
          <Select
            floatingLabel="Someone you follow"
            value={pickFollowed}
            onChange={(v) => setPickFollowed(String(v))}
            disabled={!followed.length || full}
            options={[{ value: PICK, label: followed.length ? "Pick someone" : "No one you follow has Twitch linked" }, ...followed.map((f) => ({ value: f.userId, label: `${f.name} (twitch.tv/${f.twitchLogin})` }))]}
          />
          <Button variant="secondary" disabled={busy || full || pickFollowed === PICK} onClick={() => void add({ gsUserId: pickFollowed })}>Add</Button>
        </div>
        <form className="dbot-alerts__add-part" onSubmit={(e) => { e.preventDefault(); if (login.trim()) void add({ login }); }}>
          <Input fullWidth floatingLabel="Or any Twitch channel" placeholder="twitch.tv/name" value={login} maxLength={60} disabled={full} onChange={(e) => setLogin(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={busy || full || !login.trim()}>Add</Button>
        </form>
      </div>

      {alerts === null ? null : alerts.length === 0 ? (
        <p className="dbot-muted">No creators yet. Add one above and the bot posts the next time they go live.</p>
      ) : (
        <ul className="dbot-alerts__list">
          {alerts.map((a) => (
            <li key={a.id} className={`dbot-alerts__item${a.enabled ? "" : " is-off"}`}>
              <Avatar initials={a.name.slice(0, 2).toUpperCase()} alt="" size="medium" />
              <div className="dbot-alerts__text">
                <span className="dbot-alerts__name">{a.name}</span>
                <span className="dbot-alerts__meta">
                  <span>{a.gsUsername ? `@${a.gsUsername} on GameShuffle` : "Twitch channel"}</span>
                  <span>twitch.tv/{a.login}</span>
                  {a.message && <span>Own message</span>}
                </span>
              </div>
              <Switch aria-label={`Alerts for ${a.name}`} checked={a.enabled} onChange={(e) => void patch(a.id, { enabled: e.target.checked }, e.target.checked ? "Alerts on" : "Alerts paused")} />
              <RowActions>
                <IconAction label={`Message for ${a.name}`} icon={IconPencil} onClick={() => setEditing({ id: a.id, name: a.name, message: a.message ?? "" })} />
                <IconAction label={`Remove ${a.name}`} icon={IconTrash} variant="danger" onClick={() => void remove(a)} />
              </RowActions>
            </li>
          ))}
        </ul>
      )}
      <p className="dbot-muted">{alerts?.length ?? 0} of {limit} creators on this server.</p>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Message for ${editing.name}` : "Message"}
        size="small"
        primaryAction={{ label: "Save", onClick: () => { if (editing) void patch(editing.id, { message: editing.message || null }, "Message saved").then((ok) => ok && setEditing(null)); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setEditing(null) }}
      >
        {editing && (
          <div className="dbot-alerts__edit">
            <Textarea floatingLabel="Message (leave empty for ours)" rows={3} maxLength={300} value={editing.message} onChange={(e) => setEditing({ ...editing, message: e.target.value })} />
            <p className="dbot-muted">Use {"{name}"}, {"{game}"}, {"{title}"} and {"{link}"}. The link is added at the end if you leave it out.</p>
            <p className="dbot-alerts__preview"><span className="dbot-muted">Preview:</span> {sample(editing.message || null, editing.name)}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
