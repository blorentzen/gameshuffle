"use client";

/**
 * Streaming ▸ Chat ▸ Commands: every chat command on the channel in one
 * searchable list (built-ins, ready-made replies, your own commands and the
 * events people type), each with what it does, how to type it, who can use
 * it and a switch. "Works on my stream" hides what can't happen on this
 * streamer's streams (no Mario Kart = no race commands); "Everything" shows
 * all of it with what each one needs. Replaces the Commands and Built-in
 * tabs (2026-10-10). Data: /api/commands/catalog (src/lib/commands/catalog.ts).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Button, Chip, Drawer, EmptyState, Input, Modal, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconSearch } from "@tabler/icons-react";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { COMMAND_GROUPS, NEED_LABELS, type CommandNeed } from "@/lib/twitch/commands/guide";
import type { CatalogCommand, StreamSetup } from "@/lib/commands/catalog";
import { EventOverridesSection } from "../EventOverridesSection";
import { CommandPoolModal } from "../CommandPoolModal";
import { VariableAutocomplete } from "../VariableAutocomplete";
import { CommandFormFields, type CommandActor } from "./CommandForm";

interface Catalog {
  slug: string | null;
  hasCommunity: boolean;
  setup: StreamSetup;
  commands: CatalogCommand[];
}

const WHO_LABEL = { everyone: "Everyone", mods: "Mods and you", you: "Just you" } as const;

const VARIABLES: [string, string][] = [
  ["{user}", "who typed the command"], ["{touser}", "the first @name, or who typed it"], ["{streamer}", "your name"],
  ["{game}", "what you're playing"], ["{random}", "0 to 99"], ["{count}", "times it's been used"],
  ["{uptime}", "how long you've been live"], ["{followage}", "how long they've followed"],
  ["{commands_link}", "your viewers' commands page"], ["{discord_invite}", "your Discord invite"],
  ["{discord} {youtube} {twitter}", "your socials"], ["{psn} {nso} {xbox} {steam}", "your gamertags"],
];

export function CommandsScreen() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"mine" | "all">("mine");
  const [q, setQ] = useState("");
  const [who, setWho] = useState<"any" | "everyone" | "mods" | "you">("any");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"variables" | "events" | null>(null);
  const [replyEdit, setReplyEdit] = useState<CatalogCommand | null>(null);
  const [replyText, setReplyText] = useState("");
  const [pool, setPool] = useState<CatalogCommand | null>(null);
  const [form, setForm] = useState<{ id: string | null; trigger: string; response: string; actor: CommandActor; cooldown: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/commands/catalog", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setError("Couldn't load your commands. Refresh to try again.");
      return;
    }
    setError(null);
    setData((await res.json()) as Catalog);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after its fetch resolves
    void load();
  }, [load]);

  const setOn = async (c: CatalogCommand, on: boolean) => {
    setBusy(c.key);
    setData((d) => d && { ...d, commands: d.commands.map((x) => (x.key === c.key ? { ...x, on } : x)) });
    const res = await fetch("/api/commands/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: c.key, enabled: on }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setData((d) => d && { ...d, commands: d.commands.map((x) => (x.key === c.key ? { ...x, on: !on } : x)) });
      const body = res ? await res.json().catch(() => ({})) : {};
      toast.error(body.detail?.includes("gs_command_toggles") ? "Switching built-ins off needs the latest database update." : "Couldn't save that. Try again.");
      return;
    }
    toast.success(`${c.typed} is ${on ? "on" : "off"}`);
  };

  const saveReply = async (c: CatalogCommand, text: string | null) => {
    setBusy(c.key);
    const res = text === null
      ? await fetch(`/api/account/default-command-overrides?command_id=${encodeURIComponent(c.id)}`, { method: "DELETE" }).catch(() => null)
      : await fetch("/api/account/default-command-overrides", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command_id: c.id, enabled: c.on, custom_response: text }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return toast.error("Couldn't save the reply. Try again.");
    toast.success(text === null ? "Back to our reply" : "Reply saved");
    setReplyEdit(null);
    void load();
  };

  const saveCustom = async () => {
    if (!form) return;
    setFormError(null);
    const trigger = form.trigger.trim();
    const responseTmpl = form.response.trim();
    const cooldown = parseInt(form.cooldown, 10);
    if (!trigger) return setFormError("Give it a trigger, like !discord.");
    if (!responseTmpl) return setFormError("Write what the bot should say.");
    if (Number.isNaN(cooldown) || cooldown < 0) return setFormError("Cooldown is 0 or more seconds.");
    setBusy("form");
    const res = await fetch(form.id ? `/api/account/custom-commands/${form.id}` : "/api/account/custom-commands", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger, responseTmpl, actor: form.actor, cooldownSeconds: cooldown }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok || !body.ok) return setFormError(body.error || "Couldn't save it. Try again.");
    toast.success(form.id ? "Command updated" : "Command added");
    setForm(null);
    void load();
  };

  const deleteCustom = async (c: CatalogCommand) => {
    const ok = await confirm({ title: `Delete ${c.typed}?`, body: "Chat stops answering it, and its use count goes too.", confirmLabel: `Delete ${c.typed}` });
    if (!ok) return;
    const res = await fetch(`/api/account/custom-commands/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast.error("Couldn't delete it. Try again.");
    toast.success(`${c.typed} deleted`);
    void load();
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase().replace(/^!/, "");
    return data.commands.filter((c) =>
      (view === "all" || c.works) &&
      (who === "any" || c.who === who) &&
      (!needle || `${c.usage} ${c.summary} ${c.reply?.text ?? ""}`.toLowerCase().includes(needle)));
  }, [data, q, who, view]);

  if (error) return <AdminScreen title="Chat commands"><Alert variant="error">{error}</Alert></AdminScreen>;
  if (!data) return <AdminScreen title="Chat commands"><LoadingLines /></AdminScreen>;

  const counts = { mine: data.commands.filter((c) => c.works).length, all: data.commands.length };
  const setupBits = [
    ...data.setup.games,
    ...(["wheel", "tournament", "party-night"] as CommandNeed[]).filter((n) => data.setup.has[n]).map((n) => NEED_LABELS[n]),
  ];

  const list: ReactNode = (
    <div className="cmds">
      {view === "mine" && (
        <p className="cmds__setup">
          {setupBits.length ? <>Going by your streams: {setupBits.join(" · ")}. </> : <>Nothing streamed yet, so only commands that work anywhere show here. </>}
          Commands that need something else are under Everything.
        </p>
      )}
      {filtered.length === 0 ? (
        <EmptyState title="No commands match" description="Try another word, or look under Everything." />
      ) : (
        COMMAND_GROUPS.map((g) => {
          const rows = filtered.filter((c) => c.group === g.id);
          if (!rows.length) return null;
          return (
            <section key={g.id} className="cmds__group" aria-labelledby={`cmds-${g.id}`}>
              <header className="cmds__group-head">
                <h2 id={`cmds-${g.id}`} className="cmds__group-title">{g.label}</h2>
                <span className="cmds__group-count">{rows.filter((c) => c.on).length} of {rows.length} on</span>
              </header>
              <p className="cmds__group-blurb">{g.blurb}</p>
              <ul className="cmds__rows">
                {rows.map((c) => (
                  <Row
                    key={c.key}
                    c={c}
                    open={open === c.key}
                    onToggleOpen={() => setOpen(open === c.key ? null : c.key)}
                    onSwitch={(on) => void setOn(c, on)}
                    busy={busy === c.key}
                    onEditReply={() => { setReplyEdit(c); setReplyText(c.reply?.custom ? c.reply.text : c.reply?.ours ?? ""); }}
                    onResetReply={() => void saveReply(c, null)}
                    onPool={() => setPool(c)}
                    onEditCustom={() => c.custom && setForm({ id: c.id, trigger: c.custom.trigger, response: c.custom.response, actor: c.custom.actor, cooldown: String(c.custom.cooldown) })}
                    onDeleteCustom={() => void deleteCustom(c)}
                    onEvents={() => setDrawer("events")}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );

  return (
    <AdminScreen
      title="Chat commands"
      intro="Everything chat can type on your stream: what it does, how to type it and who can use it. Switch any of them off."
      actions={
        <>
          {data.slug && (
            <Link href={`/c/${encodeURIComponent(data.slug)}/commands`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="small">Your viewers&rsquo; page ↗</Button>
            </Link>
          )}
          <Button variant="ghost" size="small" onClick={() => setDrawer("variables")}>Variables</Button>
          {data.hasCommunity && (
            <Button variant="primary" size="small" onClick={() => { setFormError(null); setForm({ id: null, trigger: "", response: "", actor: "everyone", cooldown: "5" }); }}>Add a command</Button>
          )}
        </>
      }
    >
      {!data.hasCommunity && (
        <Alert variant="info">Connect Twitch on <Link href="/account/streaming?tab=integrations">Streaming ▸ Setup</Link> to switch commands and add your own.</Alert>
      )}
      <div className="cmds__toolbar">
        <div className="cmds__search">
          <Input
            type="search"
            size="small"
            fullWidth
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search commands, like !join or poll"
            aria-label="Search commands"
            iconBefore={IconSearch}
          />
        </div>
        <Select
          size="small"
          aria-label="Who can use it"
          value={who}
          onChange={(v) => setWho(String(v) as typeof who)}
          options={[
            { value: "any", label: "Anyone" },
            { value: "everyone", label: "Everyone can use" },
            { value: "mods", label: "Mods and you" },
            { value: "you", label: "Just you" },
          ]}
        />
      </div>
      <Tabs
        variant="pills"
        size="small"
        activeTab={view}
        onChange={(id) => setView(id as "mine" | "all")}
        tabs={[
          { id: "mine", label: "Works on my stream", badge: counts.mine, content: list },
          { id: "all", label: "Everything", badge: counts.all, content: list },
        ]}
      />

      {/* Mounted only while open: a closed CDS Drawer stays in the page with a
          scroll area keyboard focus can't reach (axe scrollable-region-focusable). */}
      {drawer === "variables" && <Drawer open onClose={() => setDrawer(null)} title="Variables" position="right" size="compact">
        <p className="cmds__note">Use these in any reply. Type <code>{"{"}</code> in a reply to pick one.</p>
        <dl className="cmds__vars">
          {VARIABLES.map(([k, v]) => (
            <div key={k}><dt><code>{k}</code></dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Drawer>}
      {drawer === "events" && <Drawer open onClose={() => setDrawer(null)} title="Events" position="right" size="standard">
        <p className="cmds__note">What <code>!chaos</code>, <code>!random</code> and <code>!hug @name</code> can do, and how each one reads in chat.</p>
        <EventOverridesSection hideHeader />
      </Drawer>}

      <Modal
        isOpen={!!replyEdit}
        onClose={() => setReplyEdit(null)}
        title={replyEdit ? `Reply for ${replyEdit.typed}` : "Reply"}
        size="medium"
        primaryAction={{ label: busy ? "Saving…" : "Save the reply", onClick: () => replyEdit && void saveReply(replyEdit, replyText.trim() || null) }}
        secondaryAction={{ label: "Cancel", onClick: () => setReplyEdit(null) }}
      >
        {replyEdit?.reply?.ours && <p className="cmds__note">Ours: <span className="cmds__ours">{replyEdit.reply.ours}</span></p>}
        <VariableAutocomplete value={replyText} onChange={setReplyText} rows={3} ariaLabel="Your reply" placeholder="What the bot says" />
        <p className="cmds__note">Leave it empty to use ours. Type <code>{"{"}</code> to add a variable.</p>
      </Modal>

      <Modal
        isOpen={!!form}
        onClose={() => busy !== "form" && setForm(null)}
        title={form?.id ? `Edit ${form.trigger}` : "Add a command"}
        size="medium"
        primaryAction={{ label: busy === "form" ? "Saving…" : form?.id ? "Save" : "Add it", onClick: () => void saveCustom() }}
        secondaryAction={{ label: "Cancel", onClick: () => setForm(null) }}
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        {form && (
          <CommandFormFields
            trigger={form.trigger}
            onTrigger={(v) => setForm({ ...form, trigger: v })}
            actor={form.actor}
            onActor={(v) => setForm({ ...form, actor: v })}
            response={form.response}
            onResponse={(v) => setForm({ ...form, response: v })}
            cooldown={form.cooldown}
            onCooldown={(v) => setForm({ ...form, cooldown: v })}
            responseAria="What the bot says"
            showTriggerHint={!form.id}
          />
        )}
      </Modal>

      {pool && (
        <CommandPoolModal commandId={pool.id} trigger={pool.typed.replace(/^!/, "")} isOpen onClose={() => setPool(null)} onChanged={() => void load()} />
      )}
    </AdminScreen>
  );
}

function Row({ c, open, onToggleOpen, onSwitch, busy, onEditReply, onResetReply, onPool, onEditCustom, onDeleteCustom, onEvents }: {
  c: CatalogCommand;
  open: boolean;
  onToggleOpen: () => void;
  onSwitch: (on: boolean) => void;
  busy: boolean;
  onEditReply: () => void;
  onResetReply: () => void;
  onPool: () => void;
  onEditCustom: () => void;
  onDeleteCustom: () => void;
  onEvents: () => void;
}) {
  const panelId = `cmd-${c.key.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <li className={`cmds__row${c.on ? "" : " is-off"}`}>
      <div className="cmds__main">
        <button type="button" className="cmds__typed" aria-expanded={open} aria-controls={panelId} onClick={onToggleOpen}>
          <code>{c.typed}</code>
        </button>
        <div className="cmds__summary">
          <span>{c.summary}</span>
          {c.missing.map((m) => <Chip key={m} size="small" variant="warning" label={`Needs ${m}`} />)}
          {c.lockedBy && <Chip size="small" label="Off in Modules" />}
          {c.shadowedBy && <Chip size="small" variant="warning" label="Never answers" />}
          {c.kind === "custom" && <Chip size="small" variant="primary" label="Yours" />}
          {c.reply?.custom && <Chip size="small" variant="primary" label="Your reply" />}
        </div>
        <span className="cmds__who">{WHO_LABEL[c.who]}</span>
        <Switch
          checked={c.on}
          disabled={busy || !!c.lockedBy}
          onChange={(e) => onSwitch(e.target.checked)}
          aria-label={`${c.typed} on`}
        />
      </div>
      {open && (
        <div className="cmds__more" id={panelId}>
          <dl className="cmds__facts">
            <div><dt>Type</dt><dd><code>{c.usage}</code></dd></div>
            <div><dt>Who</dt><dd>{WHO_LABEL[c.who]}</dd></div>
            {c.missing.length > 0 && <div><dt>Needs</dt><dd>{c.missing.join(", ")}</dd></div>}
            {c.lockedBy && <div><dt>Off</dt><dd>{c.lockedBy}. <Link href="/account/streaming?tab=community">Open Modules</Link></dd></div>}
            {c.shadowedBy && <div><dt>Why</dt><dd>{c.shadowedBy}, so this one never answers.</dd></div>}
          </dl>
          <div className="cmds__explain">
            {c.detail && <p>{c.detail}</p>}
            {c.example && (
              <div className="cmds__chat" aria-label="Example">
                <span><b>kartkev</b> {c.example[0]}</span>
                <span><b>GameShuffle</b> {c.example[1]}</span>
              </div>
            )}
            {c.reply && (
              <>
                <p className="cmds__reply"><b>The bot says:</b> {c.reply.text || "(no text)"}</p>
                <div className="cmds__actions">
                  <Button variant="secondary" size="small" onClick={onEditReply}>Change the reply</Button>
                  {c.reply.custom && <Button variant="ghost" size="small" onClick={onResetReply}>Use ours</Button>}
                  {c.reply.pool && <Button variant="ghost" size="small" onClick={onPool}>Answers ({c.reply.pool.platform + c.reply.pool.community})</Button>}
                </div>
              </>
            )}
            {c.custom && (
              <>
                <p className="cmds__reply"><b>The bot says:</b> {c.custom.response}</p>
                <div className="cmds__actions">
                  <Button variant="secondary" size="small" onClick={onEditCustom}>Edit</Button>
                  <Button variant="ghost" size="small" onClick={onDeleteCustom}>Delete</Button>
                </div>
              </>
            )}
            {c.kind === "event" && (
              <div className="cmds__actions"><Button variant="secondary" size="small" onClick={onEvents}>Change the wording</Button></div>
            )}
            {(c.id === "chaos" || c.id === "random") && (
              <div className="cmds__actions"><Button variant="ghost" size="small" onClick={onEvents}>What it can roll</Button></div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
