"use client";

/**
 * GameShuffle Competitive's servers (picks 2026-10-30): each with the channel its posts go to (lounge rank-ups,
 * and the war and time trial posts as they move over), Remove, and Add it to a server. Free accounts: 1 server,
 * GS Pro: 5, counted apart from GameShuffle's own.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { AdminSection } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";

interface Server { guildId: string; name: string | null; removedAt: string | null; settings: { channel?: string | null } }
interface Data { live: boolean; ready: boolean; limit: number; servers: Server[] }

const INSTALL = "/api/discord/bot/install/start?app=comp";
const ERRORS: Record<string, string> = {
  server_taken: "Another GameShuffle account already has GameShuffle Competitive in that server.",
  server_limit: "You're at your plan's server limit for GameShuffle Competitive. Remove one, or upgrade to GS Pro for up to 5.",
  not_ready: "This needs a quick update on our side first. Try again later.",
  access_denied: "Discord didn't finish adding it. Try again when you're ready.",
};

function ServerRow({ s, onRemoved }: { s: Server; onRemoved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [channel, setChannel] = useState(s.settings.channel ?? "");

  useEffect(() => {
    let gone = false;
    void fetch(`/api/discord/apps/comp/servers?guild=${encodeURIComponent(s.guildId)}`).then((r) => r.json()).then((d: { channels?: { id: string; name: string }[] | null }) => { if (!gone) setChannels(d.channels ?? []); }).catch(() => { if (!gone) setChannels([]); });
    return () => { gone = true; };
  }, [s.guildId]);

  const save = async (v: string) => {
    setChannel(v);
    const res = await fetch("/api/discord/apps/comp/servers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ guild: s.guildId, settings: { channel: v || null } }) });
    if (res.ok) toast.success("Saved"); else toast.error("Couldn't save that. Try again?");
  };
  const remove = async () => {
    const ok = await confirm({ title: `Forget ${s.name ?? "this server"}?`, body: "GameShuffle stops posting there. To take the bot out of the server too, remove it in Discord's server settings.", confirmLabel: "Forget server" });
    if (!ok) return;
    const res = await fetch(`/api/discord/apps/comp/servers?guild=${encodeURIComponent(s.guildId)}`, { method: "DELETE" });
    if (res.ok) { toast.success("Server forgotten."); onRemoved(); } else toast.error("Couldn't do that. Try again?");
  };

  return (
    <li className="discord-apps__server">
      <div className="discord-apps__server-head">
        <strong>{s.name ?? "A server"}</strong>
        {s.removedAt && <span className="discord-apps__note">The bot was removed from this server</span>}
      </div>
      <div className="discord-apps__server-row">
        <Select id={`comp-ch-${s.guildId}`} floatingLabel="Posts go to" fullWidth value={channel}
          disabled={!channels}
          onChange={(v) => void save(String(v))}
          options={[{ value: "", label: channels ? "Pick a channel" : "Loading channels…" }, ...(channels ?? []).map((c) => ({ value: c.id, label: `#${c.name}` }))]} />
        <Button variant="ghost" size="small" iconBefore={IconTrash} onClick={() => void remove()} aria-label={`Forget ${s.name ?? "this server"}`}>Forget</Button>
      </div>
    </li>
  );
}

export function DiscordCompServers() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/discord/apps/comp/servers", { cache: "no-store" }).catch(() => null);
    setData(res?.ok ? ((await res.json()) as Data) : { live: false, ready: false, limit: 1, servers: [] });
  }, []);
  useEffect(() => {
    void load();
    // Back from Discord's install screen.
    const q = new URLSearchParams(window.location.search);
    if (q.get("discord_installed")) toast.success(q.get("discord_installed") === "again" ? "GameShuffle Competitive is already in that server." : "GameShuffle Competitive is in your server. Pick the channel for its posts.");
    const err = q.get("discord_install_error");
    if (err) toast.error(ERRORS[err] ?? "Couldn't add GameShuffle Competitive. Try again?");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <p className="admin-field__help">Loading…</p>;
  if (!data.ready) return <p className="admin-field__help">GameShuffle Competitive needs a quick update on our side before it can be added. Check back soon.</p>;
  const active = data.servers.filter((s) => !s.removedAt);
  return (
    <AdminSection title="GameShuffle Competitive">
      <p className="admin-field__help">Wars, time trials, MMR and lounge rank-ups, with short commands: /tt, /mmr, /room. Its servers count apart from GameShuffle&apos;s: {data.limit === 1 ? "1 server" : `up to ${data.limit} servers`} on your plan.</p>
      {data.servers.length ? (
        <ul className="discord-apps__servers">
          {data.servers.map((s) => <ServerRow key={s.guildId} s={s} onRemoved={() => void load()} />)}
        </ul>
      ) : <p className="admin-field__help">It isn&apos;t in any of your servers yet.</p>}
      <div>
        {active.length < data.limit
          ? <Button variant={data.servers.length ? "secondary" : "primary"} iconBefore={IconPlus} onClick={() => window.location.assign(INSTALL)}>{data.servers.length ? "Add it to another server" : "Add it to a server"}</Button>
          : <p className="admin-field__help">That&apos;s your plan&apos;s limit. GS Pro adds it to up to 5 servers.</p>}
      </div>
    </AdminSection>
  );
}
