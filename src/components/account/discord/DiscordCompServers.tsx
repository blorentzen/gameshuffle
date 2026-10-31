"use client";

/**
 * GameShuffle Competitive's servers (picks 2026-10-30): each with the channel its posts go to (lounge rank-ups,
 * and the war and time trial posts as they move over), its time trial panels (post, move or take down; picks
 * Nn8Qv4EVRDL6zojwHVCcdN), Remove, and Add it to a server. Free accounts: 1 server, GS Pro: 5, counted apart
 * from GameShuffle's own.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { AdminSection } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";

type PanelGame = "mk8dx" | "mkworld" | "both";
interface Server { guildId: string; name: string | null; removedAt: string | null; settings: { channel?: string | null; ttPanels?: Partial<Record<PanelGame, { channel: string; message: string }>> } }
interface Data { live: boolean; ready: boolean; limit: number; servers: Server[] }

const INSTALL = "/api/discord/bot/install/start?app=comp";
const ERRORS: Record<string, string> = {
  server_taken: "Another GameShuffle account already has GameShuffle Competitive in that server.",
  server_limit: "You're at your plan's server limit for GameShuffle Competitive. Remove one, or upgrade to GS Pro for up to 5.",
  not_ready: "This needs a quick update on our side first. Try again later.",
  access_denied: "Discord didn't finish adding it. Try again when you're ready.",
};
const PANEL_GAMES: { value: PanelGame; label: string }[] = [
  { value: "mk8dx", label: "Mario Kart 8 Deluxe" },
  { value: "mkworld", label: "Mario Kart World" },
  { value: "both", label: "Both games" },
];
const PANEL_ERRORS: Record<string, string> = {
  no_access: "GameShuffle Competitive can't post in that channel. Give it Send Messages there and try again.",
  no_channel: "That channel isn't there any more.",
  failed: "The panel couldn't be posted. Try again?",
};

function ServerRow({ s, onChanged }: { s: Server; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [channel, setChannel] = useState(s.settings.channel ?? "");
  const [panelGame, setPanelGame] = useState<PanelGame>("mk8dx");
  const [panelChannel, setPanelChannel] = useState("");
  const [posting, setPosting] = useState(false);
  const panels = (Object.entries(s.settings.ttPanels ?? {}) as [PanelGame, { channel: string }][]);
  const channelName = (id: string) => channels?.find((c) => c.id === id)?.name ?? null;

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
    if (res.ok) { toast.success("Server forgotten."); onChanged(); } else toast.error("Couldn't do that. Try again?");
  };
  const postPanel = async () => {
    if (!panelChannel) return;
    setPosting(true);
    const res = await fetch("/api/discord/apps/comp/servers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "panel", guild: s.guildId, channel: panelChannel, game: panelGame }) }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { ok?: boolean; pinned?: boolean; error?: string } | undefined;
    setPosting(false);
    if (!data?.ok) { toast.error(PANEL_ERRORS[data?.error ?? ""] ?? PANEL_ERRORS.failed); return; }
    toast.success(data.pinned ? "Panel posted and pinned." : "Panel posted. Pin it in Discord so it stays at the top.");
    onChanged();
  };
  const takeDown = async (game: PanelGame) => {
    const label = PANEL_GAMES.find((g) => g.value === game)?.label ?? "this";
    const ok = await confirm({ title: `Take down the ${game === "both" ? "time trial" : label} panel?`, body: "Its message is deleted from the channel. Times stay on the boards.", confirmLabel: "Take it down" });
    if (!ok) return;
    const res = await fetch("/api/discord/apps/comp/servers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "panel_remove", guild: s.guildId, game }) }).catch(() => null);
    if (res?.ok) { toast.success("Panel taken down."); onChanged(); } else toast.error("Couldn't do that. Try again?");
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
      {!s.removedAt && (
        <div className="discord-apps__panel">
          <strong>Time trial panel</strong>
          {panels.length ? (
            <ul className="discord-apps__panels">
              {panels.map(([g, p]) => (
                <li key={g}>
                  <span>{PANEL_GAMES.find((x) => x.value === g)?.label} · {channelName(p.channel) ? `#${channelName(p.channel)}` : "a channel"}</span>
                  <Button variant="ghost" size="small" onClick={() => void takeDown(g)} aria-label={`Take down the ${PANEL_GAMES.find((x) => x.value === g)?.label} panel`}>Take it down</Button>
                </li>
              ))}
            </ul>
          ) : <p className="discord-apps__help">A message with Add a time, Top ten and My times, kept up to date as times come in.</p>}
          <div className="discord-apps__panel-row">
            <Select id={`comp-panel-game-${s.guildId}`} floatingLabel="Game" fullWidth value={panelGame}
              onChange={(v) => setPanelGame(String(v) as PanelGame)} options={PANEL_GAMES} />
            <Select id={`comp-panel-ch-${s.guildId}`} floatingLabel="Channel" fullWidth value={panelChannel} disabled={!channels}
              onChange={(v) => setPanelChannel(String(v))}
              options={[{ value: "", label: channels ? "Pick a channel" : "Loading channels…" }, ...(channels ?? []).map((c) => ({ value: c.id, label: `#${c.name}` }))]} />
            <Button variant="secondary" disabled={!panelChannel || posting} onClick={() => void postPanel()}>
              {s.settings.ttPanels?.[panelGame] ? "Move the panel" : "Post the panel"}
            </Button>
          </div>
          <p className="discord-apps__help">Or type /tt panel in the channel. Posting again moves it.</p>
        </div>
      )}
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

  if (!data) return <p className="discord-apps__help">Loading…</p>;
  if (!data.ready) return <p className="discord-apps__help">GameShuffle Competitive needs a quick update on our side before it can be added. Check back soon.</p>;
  const active = data.servers.filter((s) => !s.removedAt);
  return (
    <AdminSection title="GameShuffle Competitive">
      <p className="discord-apps__help">Wars, time trials, MMR and lounge rank-ups, with short commands: /tt, /mmr, /room. Its servers count apart from GameShuffle&apos;s: {data.limit === 1 ? "1 server" : `up to ${data.limit} servers`} on your plan.</p>
      {data.servers.length ? (
        <ul className="discord-apps__servers">
          {data.servers.map((s) => <ServerRow key={s.guildId} s={s} onChanged={() => void load()} />)}
        </ul>
      ) : <p className="discord-apps__help">It isn&apos;t in any of your servers yet.</p>}
      <div>
        {active.length < data.limit
          ? <Button variant={data.servers.length ? "secondary" : "primary"} iconBefore={IconPlus} onClick={() => window.location.assign(INSTALL)}>{data.servers.length ? "Add it to another server" : "Add it to a server"}</Button>
          : <p className="discord-apps__help">That&apos;s your plan&apos;s limit. GS Pro adds it to up to 5 servers.</p>}
      </div>
    </AdminSection>
  );
}
