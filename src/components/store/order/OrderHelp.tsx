"use client";

/**
 * "Need something?" on a buyer's order page (order tracking picks 2026-11-08, all three): report a problem with an item
 * (which item, what happened, photos, a replacement or a refund), fix the address before it ships, or ask about the
 * order. Each opens a CDS Modal and posts to /api/shop/orders/<code>/requests; the page refreshes to show the request.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Input, Modal, Textarea } from "@empac/cascadeds";
import { IconAlertTriangle, IconCamera, IconChevronRight, IconMapPin, IconMessage } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { PROBLEMS, type Problem, type Wants } from "@/lib/store/orderStage";

export interface HelpItem { sku: string; name: string; detail: string | null; image: string | null }

const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const ERRORS: Record<string, string> = {
  bad_photo: "Use up to 4 photos (JPG, PNG, WEBP or HEIC), 8 MB each.",
  bad_address: "Check the address: a street, city, state and 5-digit ZIP code.",
  too_late: "It's been more than 30 days since this order was delivered. Email us and we'll take a look.",
  not_yet: "You can report a problem once your order ships.",
  shipped: "This order has shipped, so the address can't change now. Ask about it instead and we'll help.",
  empty: "Write your question first.",
  too_many: "That's a lot of requests at once. Try again later, or email us.",
  not_ready: "This isn't open yet. Email us and we'll help.",
};

type Open = "problem" | "address" | "question" | null;

export function OrderHelp({ code, items, can, shipTo }: { code: string; items: HelpItem[]; can: { report: boolean; address: boolean; ask: boolean }; shipTo: { name: string | null; line1: string | null; line2: string | null; city: string | null; state: string | null; postal: string | null } }) {
  const [open, setOpen] = useState<Open>(null);
  const rows: { id: Exclude<Open, null>; tone: string; icon: ReactNode; name: string; line: string }[] = [];
  if (can.report) rows.push({ id: "problem", tone: "red", icon: <IconAlertTriangle size={22} aria-hidden="true" />, name: "Report a problem with an item", line: "Misprinted, damaged, wrong or missing. Add a photo, then pick a replacement or a refund." });
  if (can.address) rows.push({ id: "address", tone: "blue", icon: <IconMapPin size={22} aria-hidden="true" />, name: "Fix the shipping address", line: "Before it ships. We'll change it with our print partner if it isn't packed yet." });
  if (can.ask) rows.push({ id: "question", tone: "violet", icon: <IconMessage size={22} aria-hidden="true" />, name: "Ask about this order", line: "Goes to our team with your order attached. We reply by email." });
  if (!rows.length) return null;
  return (
    <section className="order-sec" aria-labelledby="order-help">
      <h2 id="order-help" className="order-h">Need something?</h2>
      <div className="order-rows">
        {rows.map((r) => (
          <button key={r.id} type="button" className="order-row" onClick={() => setOpen(r.id)}>
            <span className={`icon-tile icon-tile--${r.tone}`}>{r.icon}</span>
            <span className="order-row__text"><b>{r.name}</b><small>{r.line}</small></span>
            <IconChevronRight size={20} className="order-row__chev" aria-hidden="true" />
          </button>
        ))}
      </div>
      {open === "problem" && <ProblemForm code={code} items={items} onClose={() => setOpen(null)} />}
      {open === "address" && <AddressForm code={code} shipTo={shipTo} onClose={() => setOpen(null)} />}
      {open === "question" && <QuestionForm code={code} onClose={() => setOpen(null)} />}
    </section>
  );
}

function useSend(code: string, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const send = async (form: FormData, done: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/shop/orders/${code}/requests`, { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { toast.error(ERRORS[j.error ?? ""] ?? "That didn't send. Try again, or email us."); return; }
      toast.success(done);
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return { busy, send };
}

function ProblemForm({ code, items, onClose }: { code: string; items: HelpItem[]; onClose: () => void }) {
  const [sku, setSku] = useState(items.length === 1 ? items[0].sku : "");
  const [problem, setProblem] = useState<Problem | "">("");
  const [wants, setWants] = useState<Wants>("replacement");
  const [photos, setPhotos] = useState<File[]>([]);
  const [body, setBody] = useState("");
  const { busy, send } = useSend(code, onClose);
  const needsPhoto = problem !== "missing";
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const ready = !!sku && !!problem && (!needsPhoto || photos.length > 0);
  const submit = () => {
    const f = new FormData();
    f.set("kind", "problem"); f.set("sku", sku); f.set("problem", problem); f.set("wants", wants); f.set("body", body);
    for (const p of photos) f.append("photos", p);
    void send(f, "Sent. We'll reply by email.");
  };
  return (
    <Modal isOpen onClose={onClose} title="Report a problem" size="medium"
      footer={<div className="order-modal__foot"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!ready || busy} onClick={submit}>Send the report</Button></div>}>
      <div className="order-form">
        <fieldset className="order-form__set">
          <legend>Which item?</legend>
          <div className="order-picks">
            {items.map((i) => (
              <button key={i.sku} type="button" className={`order-pick${sku === i.sku ? " is-on" : ""}`} aria-pressed={sku === i.sku} onClick={() => setSku(i.sku)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                {i.image && <img src={i.image} alt="" width={72} height={72} />}
                <span>{i.name}{i.detail && <small>{i.detail}</small>}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="order-form__set">
          <legend>What happened?</legend>
          <div className="order-chips">
            {PROBLEMS.map((p) => <Chip key={p.id} label={p.label} clickable selected={problem === p.id} variant={problem === p.id ? "primary" : "default"} onClick={() => setProblem(p.id)} />)}
          </div>
        </fieldset>
        {problem !== "missing" && (
          <fieldset className="order-form__set">
            <legend>Add a photo</legend>
            <label className="order-drop">
              <IconCamera size={26} aria-hidden="true" />
              <span><b>{photos.length ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"} added` : "Take or add photos"}</b><small>Show the whole item and the problem. Up to 4.</small></span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setPhotos([...(e.target.files ?? [])].slice(0, 4))} />
            </label>
            {photos.length > 0 && (
              <div className="order-photos">
                {/* eslint-disable-next-line @next/next/no-img-element -- the buyer's own photos, shown before they're sent */}
                {previews.map((u, k) => <img key={u} src={u} alt={`Photo ${k + 1}`} width={64} height={64} />)}
              </div>
            )}
          </fieldset>
        )}
        <fieldset className="order-form__set">
          <legend>What would you like?</legend>
          <div className="order-picks order-picks--two">
            {([["replacement", "A replacement", "We make a new one and ship it free."], ["refund", "A refund", "Back to your card for this item."]] as const).map(([id, name, line]) => (
              <button key={id} type="button" className={`order-pick order-pick--text${wants === id ? " is-on" : ""}`} aria-pressed={wants === id} onClick={() => setWants(id)}>
                <span>{name}<small>{line}</small></span>
              </button>
            ))}
          </div>
        </fieldset>
        <Textarea floatingLabel="Anything else? (optional)" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} fullWidth />
        <p className="order-note">No need to send anything back. We reply by email.</p>
      </div>
    </Modal>
  );
}

function AddressForm({ code, shipTo, onClose }: { code: string; shipTo: { name: string | null; line1: string | null; line2: string | null; city: string | null; state: string | null; postal: string | null }; onClose: () => void }) {
  const [a, setA] = useState({ name: shipTo.name ?? "", line1: shipTo.line1 ?? "", line2: shipTo.line2 ?? "", city: shipTo.city ?? "", state: shipTo.state ?? "", postal: shipTo.postal ?? "" });
  const { busy, send } = useSend(code, onClose);
  const set = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement>) => setA({ ...a, [k]: e.target.value });
  const ready = a.name.trim() && a.line1.trim() && a.city.trim() && a.state && /^\d{5}(-\d{4})?$/.test(a.postal.trim());
  const submit = () => { const f = new FormData(); f.set("kind", "address"); for (const [k, v] of Object.entries(a)) f.set(k, v); void send(f, "Sent. We'll email you once it's changed."); };
  return (
    <Modal isOpen onClose={onClose} title="Fix the shipping address" size="medium"
      footer={<div className="order-modal__foot"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!ready || busy} onClick={submit}>Send the new address</Button></div>}>
      <div className="order-form">
        <p className="order-note">We&apos;ll change it with our print partner if your order isn&apos;t packed yet, and email you either way. US addresses only.</p>
        <Input floatingLabel="Name" value={a.name} onChange={set("name")} autoComplete="name" fullWidth />
        <Input floatingLabel="Street address" value={a.line1} onChange={set("line1")} autoComplete="address-line1" fullWidth />
        <Input floatingLabel="Apartment, suite, etc. (optional)" value={a.line2} onChange={set("line2")} autoComplete="address-line2" fullWidth />
        <div className="order-form__row">
          <Input floatingLabel="City" value={a.city} onChange={set("city")} autoComplete="address-level2" fullWidth />
          <Select floatingLabel="State" value={a.state} onChange={(v) => setA({ ...a, state: String(v) })} options={STATES.map((s) => ({ value: s, label: s }))} fullWidth />
          <Input floatingLabel="ZIP code" value={a.postal} onChange={set("postal")} autoComplete="postal-code" inputMode="numeric" fullWidth />
        </div>
      </div>
    </Modal>
  );
}

function QuestionForm({ code, onClose }: { code: string; onClose: () => void }) {
  const [body, setBody] = useState("");
  const { busy, send } = useSend(code, onClose);
  const submit = () => { const f = new FormData(); f.set("kind", "question"); f.set("body", body); void send(f, "Sent. We'll reply by email."); };
  return (
    <Modal isOpen onClose={onClose} title="Ask about this order" size="medium"
      footer={<div className="order-modal__foot"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!body.trim() || busy} onClick={submit}>Send</Button></div>}>
      <div className="order-form">
        <Textarea floatingLabel="Your question" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} fullWidth />
        <p className="order-note">It goes to our team with your order attached. We reply by email, and the answer shows on this page too.</p>
      </div>
    </Modal>
  );
}
