"use client";

/**
 * Platform ▸ Chat bot ▸ Variables (staff/admin): the `{name}` words chat
 * replies and event lines can use. This list is the suggestion list writers
 * see when they type `{` in a reply box (VariableAutocomplete), not a switch:
 * the engine in src/lib/economy/events/engine.ts decides what actually fills
 * in, so the screen says plainly that a new row needs a developer too.
 * Data from /api/admin/flavor-variables (GET list, PUT upsert, DELETE by name).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, EmptyState, Input, Modal, Select, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, Textarea,
} from "@empac/cascadeds";
import { IconBraces, IconPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminHeader, AdminRowMenu, AdminSection, AdminTable } from "@/components/account/admin/AdminKit";

type VariableCategory = "caller" | "stream" | "profile" | "event" | "pool";

const CATEGORIES: VariableCategory[] = ["caller", "stream", "profile", "event", "pool"];

/** Same words and badge colours writers see in the reply-box suggestions
 *  (VariableAutocomplete), so the two never disagree. */
const KIND: Record<VariableCategory, { label: string; variant: "default" | "success" | "warning" | "info" | "outline"; about: string }> = {
  caller: { label: "Caller", variant: "info", about: "About the viewer who typed it. Works in every reply." },
  stream: { label: "Stream", variant: "default", about: "About the stream right now. Works in every reply." },
  profile: { label: "Profile", variant: "success", about: "From the streamer's profile. Works in every reply." },
  event: { label: "Event-only", variant: "warning", about: "Fills in only in chat event lines; blank anywhere else." },
  pool: { label: "Pool-only", variant: "outline", about: "Fills in only for the commands it belongs to, like !roll." },
};

const ALL = "all";
const PAGE = 25;

interface VariableRow {
  name: string;
  description: string;
  example: string;
  category: VariableCategory;
  created_at: string;
  updated_at: string;
}

export function PlatformVariablesTab() {
  const confirm = useConfirm();
  const toast = useToast();
  const [vars, setVars] = useState<VariableRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<VariableRow | "new" | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>(ALL);
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/flavor-variables", { cache: "no-store" });
      if (res.status === 403) {
        setLoadError("Only GameShuffle staff can see the variables.");
        setVars([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError("Couldn't load the variables. Try again in a moment.");
        setVars([]);
        return;
      }
      setVars(body.variables as VariableRow[]);
    } catch {
      setLoadError("Couldn't reach GameShuffle to load the variables. Check your connection and try again.");
      setVars([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const handleDelete = async (row: VariableRow) => {
    const ok = await confirm({
      title: `Delete {${row.name}}?`,
      body: "Replies and event lines that use it will show it in chat exactly as typed.",
      confirmLabel: "Delete variable",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/flavor-variables/${encodeURIComponent(row.name)}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(`Couldn't delete {${row.name}}. Try again.`);
        return;
      }
      setVars((cur) => cur?.filter((v) => v.name !== row.name) ?? null);
      toast.success(`{${row.name}} deleted`);
    } catch {
      toast.error("Couldn't reach GameShuffle. Check your connection and try again.");
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/[{}]/g, "");
    return (vars ?? []).filter((v) =>
      (kind === ALL || v.category === kind) &&
      (!needle || v.name.includes(needle) || v.description.toLowerCase().includes(needle) || v.example.toLowerCase().includes(needle)),
    );
  }, [vars, q, kind]);
  const shown = filtered.slice(0, limit);

  return (
    <div className="account-card admin-screen">
      <AdminHeader
        title="Variables"
        intro="The words in curly brackets, like {game} or {user}, that chat replies and event lines fill in. Writers see this list as suggestions when they type { in a reply box."
        actions={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing("new")}>Add variable</Button>}
      />

      <Alert variant="info" title="Adding one only adds a suggestion">
        A developer has to make a new variable fill in before it works in chat. Until then chat shows it exactly as typed, which also makes typos easy to spot.
      </Alert>

      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}

      <AdminSection
        title={vars && vars.length > 0 ? `All variables (${vars.length.toLocaleString()})` : "All variables"}
        intro="Caller, Stream and Profile variables work in every reply. Event-only ones fill in only in chat event lines, and Pool-only ones only for the commands they belong to, like !roll and the 8-ball."
      >
        {vars === null ? (
          <LoadingLines label="Loading the variables" />
        ) : vars.length === 0 ? (
          !loadError && (
            <EmptyState
              variant="bordered"
              icon={<IconBraces size={28} aria-hidden />}
              title="No variables yet"
              description="Add the first one so writers get it as a suggestion."
              action={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing("new")}>Add variable</Button>}
            />
          )
        ) : (
          <>
            <div className="admin-filters">
              <Input fullWidth floatingLabel="Search variables" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
              <Select
                fullWidth
                floatingLabel="Kind"
                value={kind}
                onChange={(v) => { setKind(String(Array.isArray(v) ? v[0] : v)); setLimit(PAGE); }}
                options={[{ value: ALL, label: "All kinds" }, ...CATEGORIES.map((c) => ({ value: c, label: KIND[c].label }))]}
              />
            </div>
            <AdminTable label="Variables">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variable</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>What it fills in</TableHead>
                    <TableHead>Example</TableHead>
                    <TableHead align="right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <TableEmpty title="No variables match" description="Try another word, or set Kind to All kinds." />
                      </TableCell>
                    </TableRow>
                  ) : shown.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell><button type="button" className="admin-chatbot-open" onClick={() => setEditing(row)}><code className="admin-chatbot-token">{`{${row.name}}`}</code></button></TableCell>
                      <TableCell><Badge size="small" variant={KIND[row.category]?.variant ?? "default"}>{KIND[row.category]?.label ?? row.category}</Badge></TableCell>
                      <TableCell><span className="admin-chatbot-wrap">{row.description}</span></TableCell>
                      <TableCell>{row.example ? <span className="admin-chatbot-example">{row.example}</span> : <span className="admin-table__sub">None</span>}</TableCell>
                      <TableCell align="right">
                        <span className="admin-row-actions">
                          <Button variant="ghost" size="small" onClick={() => setEditing(row)} aria-label={`Edit {${row.name}}`}>Edit</Button>
                          <AdminRowMenu label={`More for {${row.name}}`} items={[{ label: "Delete", onClick: () => void handleDelete(row) }]} />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
            {filtered.length > 0 && (
              <div className="admin-chatbot-more">
                <p className="admin-updated">Showing {shown.length.toLocaleString()} of {filtered.length.toLocaleString()}</p>
                {filtered.length > limit && <Button variant="secondary" size="small" onClick={() => setLimit((n) => n + PAGE)}>Show more</Button>}
              </div>
            )}
          </>
        )}
      </AdminSection>

      {editing && (
        <VariableEditorModal
          row={editing === "new" ? null : editing}
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor modal
// ---------------------------------------------------------------------------

interface EditorProps {
  row: VariableRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const SAVE_ERRORS: Record<string, string> = {
  name_required: "Give the variable a name.",
  description_required: "Say what the variable fills in.",
};

function VariableEditorModal({ row, isOpen, onClose, onSaved }: EditorProps) {
  const isEdit = !!row;
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [example, setExample] = useState(row?.example ?? "");
  const [category, setCategory] = useState<VariableCategory>(row?.category ?? "stream");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const save = async () => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setError("Give the variable a name.");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmedName)) {
      setError("Use lowercase letters, numbers and underscores only, starting with a letter.");
      return;
    }
    if (!trimmedDescription) {
      setError("Say what the variable fills in.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/flavor-variables", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription,
          example: example.trim(),
          category,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(SAVE_ERRORS[body.error as string] ?? "That didn't save. Check the fields and try again.");
        return;
      }
      toast.success(`{${trimmedName}} saved`);
      onSaved();
    } catch {
      setError("Couldn't reach GameShuffle. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const token = `{${name.trim() || "name"}}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={isEdit ? `Edit {${row.name}}` : "Add a variable"}
      size="medium"
      footer={
        <div className="admin-chatbot-modal-actions">
          <Button variant="tertiary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={saving}>Save variable</Button>
        </div>
      }
    >
      <form className="admin-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <AdminField
          label="Name"
          helper={isEdit
            ? "A name can't change. To rename it, delete this one and add it again."
            : <>Lowercase letters, numbers and underscores, starting with a letter. Writers type it as <code className="admin-chatbot-token">{token}</code>. It can&apos;t be renamed later.</>}
        >
          {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} placeholder="streamer" fullWidth disabled={isEdit} autoComplete="off" />}
        </AdminField>

        <AdminField label="Kind" helper={`${KIND[category].about} Writers see this as a coloured tag on the suggestion.`}>
          {(id) => (
            <Select
              id={id}
              value={category}
              onChange={(v) => setCategory((Array.isArray(v) ? v[0] : v) as VariableCategory)}
              options={CATEGORIES.map((c) => ({ value: c, label: KIND[c].label, description: KIND[c].about }))}
              fullWidth
            />
          )}
        </AdminField>

        <AdminField label="What it fills in" helper="Tell writers what chat will show, including when it's blank.">
          {(id, d) => <Textarea id={id} aria-describedby={d} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="The streamer's channel name." fullWidth />}
        </AdminField>

        <AdminField label="Example" helper="A sample of what chat shows, so writers can picture the finished line.">
          {(id, d) => <Input id={id} aria-describedby={d} value={example} onChange={(e) => setExample(e.target.value)} placeholder="MarioFan99" fullWidth autoComplete="off" />}
        </AdminField>

        {!isEdit && (
          <Alert variant="info" title="It won't fill in yet">
            A developer still has to make {token} fill in. Until then chat shows it exactly as typed.
          </Alert>
        )}
      </form>
    </Modal>
  );
}
