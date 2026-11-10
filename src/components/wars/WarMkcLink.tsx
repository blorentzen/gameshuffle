"use client";

/**
 * A team card's MKCentral link on the Teams page (logos + MKCentral picks 2026-11-09, all A; Britton: "as long as we
 * have ways to override as needed; we don't want people getting stuck"). Not linked: a Link to MKCentral button that
 * opens a search (as you type, or a pasted MKCentral link). Linked: a chip to the team on MKCentral, Update (read it
 * again) and Unlink, each always on the page.
 */

import { useEffect, useState } from "react";
import { Badge, Button, Chip, Input, List, ListItem, Modal } from "@empac/cascadeds";
import { IconExternalLink, IconLink, IconLinkOff, IconRefresh, IconSearch } from "@tabler/icons-react";
import { AdminField } from "@/components/account/admin/AdminKit";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import type { WarGame } from "@/lib/wars/rules";
import { GAME_LABELS, mkcTeamUrl, type MkcHitView, type TeamView, type TeamsView } from "@/lib/wars/teamView";
import { WarTeamMark } from "./WarPageBits";
import { errorText, teamsApi, type WithView } from "./teamsApi";

const teamLabel = (t: TeamView) => t.name ?? t.tags[0];
const LINK_ERRORS: Record<string, string> = {
  not_ready: "MKCentral links and logo settings arrive with the next update.",
  no_team: "MKCentral didn't answer for that team. Check the link, or try again in a moment.",
  slow_down: "That's a lot of searches at once. Wait a minute and try again.",
};
const players = (n: number | null, game: WarGame) => (n === null ? `No ${GAME_LABELS[game]} roster` : n === 1 ? "1 player" : `${n} players`);
const looksLikeLink = (q: string) => /mkcentral\.com|[?&]id=/i.test(q);

type Search = { state: "idle" | "searching" | "done" | "failed"; hits: MkcHitView[]; byLink: boolean; q: string };

export function WarMkcLinkModal({ guild, team, games, onClose, onView }: {
  guild: string;
  team: TeamView;
  games: WarGame[];
  onClose: () => void;
  onView: (v: TeamsView | null) => void;
}) {
  const toast = useToast();
  const label = teamLabel(team);
  const current = team.links?.mkc?.id ?? null;
  const [q, setQ] = useState(team.tags[0] ?? "");
  const [game, setGame] = useState<WarGame>(team.links?.mkc?.game ?? games[0] ?? "mk8dx");
  const [search, setSearch] = useState<Search>({ state: "idle", hits: [], byLink: false, q: "" });
  const [linking, setLinking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Searches as people type: 300ms after the last key, the older search dropped when a newer one starts.
  useEffect(() => {
    const text = q.trim();
    if (!text) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearch((s) => ({ ...s, state: "searching" }));
      const res = await fetch(`/api/war/teams/mkcentral?guild=${encodeURIComponent(guild)}&game=${game}&q=${encodeURIComponent(text)}`, { signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const body = (await res?.json().catch(() => null)) as { hits?: MkcHitView[]; byLink?: boolean; error?: string } | null;
      if (!res?.ok || !body?.hits) {
        setSearch({ state: "failed", hits: [], byLink: false, q: text });
        setError(errorText(body?.error ?? "network", LINK_ERRORS));
        return;
      }
      setError(null);
      setSearch({ state: "done", hits: body.hits, byLink: !!body.byLink, q: text });
    }, 300);
    return () => { ctl.abort(); window.clearTimeout(timer); };
  }, [q, game, guild]);

  const link = async (h: MkcHitView) => {
    setLinking(h.id);
    setError(null);
    const res = await teamsApi<WithView & { name: string | null }>("/api/war/teams/mkcentral", "POST", { guild, teamId: team.id, action: "link", mkcId: h.id, game });
    setLinking(null);
    if (!res.ok) { setError(errorText(res.error, LINK_ERRORS)); return; }
    onView(res.data.view);
    toast.success(`${label} is linked to ${res.data.name ?? h.name} on MKCentral`);
    onClose();
  };

  const text = q.trim();
  const status = !text ? "Type a tag or name to search."
    : search.state === "searching" || search.q !== text ? "Searching MKCentral…"
    : search.state === "failed" ? "The search didn't finish."
    : search.byLink ? (search.hits.length ? "The team at that link:" : "MKCentral has no team at that link.")
    : search.hits.length === 0 ? `No MKCentral team matches ${text}.`
    : search.hits.length === 1 ? "1 team on MKCentral" : `${search.hits.length} teams on MKCentral`;
  const shown = text && search.q === text ? search.hits : [];

  return (
    <Modal
      isOpen
      onClose={linking ? () => {} : onClose}
      title={`Link ${label} to MKCentral`}
      size="medium"
      footer={<div className="admin-chatbot-modal-actions"><Button variant="tertiary" onClick={onClose} disabled={!!linking}>Cancel</Button></div>}
    >
      <div className="admin-form wt-form">
        <p className="wt-form__intro">
          Pick {label}&apos;s team on MKCentral. Its players fill in names and flags on tables, and its logo can show.
          Your own player lines and logo still come first, and you can unlink any time.
        </p>
        {error && <p className="admin-field__error" role="alert">{error}</p>}
        <div className="wt-find">
          <AdminField label="Find the team on MKCentral" helper="Type its tag or name, or paste its MKCentral link.">
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                type="search"
                iconBefore={IconSearch}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={200}
                placeholder="FRVR"
                fullWidth
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </AdminField>
          {games.length > 1 && (
            <AdminField label="Game">
              {(id) => <Select id={id} value={game} fullWidth onChange={(v) => setGame(String(Array.isArray(v) ? v[0] : v) as WarGame)} options={games.map((g) => ({ value: g, label: GAME_LABELS[g] }))} />}
            </AdminField>
          )}
        </div>
        <p className="wt-count" role="status" aria-live="polite">{status}</p>
        {shown.length > 0 && (
          <List divided className="wt-hits">
            {shown.map((h) => {
              const now = h.id === current;
              return (
                <ListItem
                  key={h.id}
                  icon={<WarTeamMark tag={h.tag || "?"} logo={h.logo} />}
                  suffix={now
                    ? <Badge variant="success" size="small">Linked now</Badge>
                    : <Button variant="secondary" size="small" onClick={() => void link(h)} loading={linking === h.id} disabled={!!linking} aria-label={`Link to ${h.name} · ${h.tag}`}>Link</Button>}
                >
                  <span className="wt-hit">
                    <span className="wt-hit__name">{h.name}{h.tag ? ` · ${h.tag}` : ""}</span>
                    <span className="wt-hit__meta">{h.game ? `${GAME_LABELS[h.game]} · ${h.players === null ? "players not counted" : players(h.players, h.game)}` : players(null, game)}</span>
                  </span>
                </ListItem>
              );
            })}
          </List>
        )}
        {!!text && !looksLikeLink(text) && search.state === "done" && search.q === text && (
          <p className="admin-field__help">Not there? Open the team on MKCentral and paste its link here.</p>
        )}
      </div>
    </Modal>
  );
}

/** The team's MKCentral line on its row: linked (chip, Update, Unlink) or a button to link it. */
export function WarMkcLine({ guild, team, onLink, onView }: { guild: string; team: TeamView; onLink: () => void; onView: (v: TeamsView | null) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"refresh" | "unlink" | null>(null);
  const label = teamLabel(team);
  const mkc = team.links?.mkc ?? null;

  if (!mkc) {
    return (
      <div className="wt-mkc">
        <Button variant="secondary" size="small" iconBefore={IconLink} onClick={onLink} aria-label={`Link ${label} to MKCentral`}>Link to MKCentral</Button>
      </div>
    );
  }

  const refresh = async () => {
    setBusy("refresh");
    const res = await teamsApi<WithView & { reached: boolean }>("/api/war/teams/mkcentral", "POST", { guild, teamId: team.id, action: "refresh", game: mkc.game });
    setBusy(null);
    if (!res.ok) { toast.error(errorText(res.error, LINK_ERRORS)); return; }
    onView(res.data.view);
    if (res.data.reached) toast.success(`${label} updated from MKCentral`);
    else toast.info("MKCentral didn't answer. Try again in a moment.");
  };

  const unlink = async () => {
    const ok = await confirm({
      title: `Unlink ${label} from MKCentral?`,
      body: `Tables stop filling in names and flags from ${mkc.name}'s players, and the logo stops coming from it. The lines on your list stay as they are, and you can link it again any time.`,
      confirmLabel: "Unlink",
    });
    if (!ok) return;
    setBusy("unlink");
    const res = await teamsApi<WithView>("/api/war/teams/mkcentral", "POST", { guild, teamId: team.id, action: "unlink" });
    setBusy(null);
    if (!res.ok) { toast.error(errorText(res.error, LINK_ERRORS)); return; }
    onView(res.data.view);
    toast.success(`${label} unlinked from MKCentral`);
  };

  const same = mkc.name.toLowerCase() === label.toLowerCase();
  return (
    <div className="wt-mkc-wrap">
      <div className="wt-mkc">
        <a className="wt-mkc__chip" href={mkcTeamUrl(mkc.id)} target="_blank" rel="noopener noreferrer">
          <Chip size="small" variant="outline" icon={<IconExternalLink size={14} aria-hidden />}>
            MKCentral{same ? "" : ` · ${mkc.name}`} · {players(mkc.players, mkc.game)}
          </Chip>
          <span className="sr-only"> (opens MKCentral in a new tab)</span>
        </a>
        <Button variant="ghost" size="small" iconBefore={IconRefresh} onClick={() => void refresh()} loading={busy === "refresh"} disabled={!!busy} aria-label={`Update ${label} from MKCentral`}>Update</Button>
        <Button variant="ghost" size="small" iconBefore={IconLinkOff} onClick={() => void unlink()} loading={busy === "unlink"} disabled={!!busy} aria-label={`Unlink ${label} from MKCentral`}>Unlink</Button>
      </div>
      {!mkc.reached && <p className="wt-team__note">MKCentral didn&apos;t answer just now, so this is what it said last time.</p>}
    </div>
  );
}
