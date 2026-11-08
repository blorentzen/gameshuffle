"use client";

/**
 * A buyer's requests on their order page (order tracking picks 2026-11-08): what they asked, where it stands, the
 * messages back and forth, and a reply box while it's still open.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { ViewRequest } from "@/lib/store/lookup";

export function OrderRequests({ code, requests }: { code: string; requests: ViewRequest[] }) {
  if (!requests.length) return null;
  return (
    <section className="order-sec" aria-labelledby="order-requests">
      <h2 id="order-requests" className="order-h">Your requests</h2>
      <ul className="order-reqs">
        {requests.map((r) => <Request key={r.id} code={code} r={r} />)}
      </ul>
    </section>
  );
}

function Request({ code, r }: { code: string; r: ViewRequest }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/shop/orders/${code}/requests/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!j.ok) { toast.error("That didn't send. Try again, or email us."); return; }
      toast.success("Sent");
      setReply("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  const tone = r.status === "resolved" ? "done" : r.status === "waiting" ? "you" : "us";
  return (
    <li className="order-req">
      <div className="order-req__head">
        <b>{r.line}{r.itemName ? ` · ${r.itemName}` : ""}</b>
        {r.statusLabel && <span className={`order-chip order-chip--${tone}`}>{r.statusLabel}</span>}
      </div>
      <span className="order-req__at">{r.at}</span>
      {r.address && <p className="order-req__body">{r.address}</p>}
      {r.body && <p className="order-req__body">{r.body}</p>}
      {r.photos.length > 0 && (
        <div className="order-photos">
          {/* eslint-disable-next-line @next/next/no-img-element -- the buyer's own photos */}
          {r.photos.map((u, k) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`Your photo ${k + 1}`} width={64} height={64} /></a>)}
        </div>
      )}
      {r.messages.length > 0 && (
        <ul className="order-thread">
          {r.messages.map((m, k) => (
            <li key={k} className={`order-msg order-msg--${m.from}`}>
              <span className="order-msg__who">{m.from === "staff" ? "GameShuffle" : "You"} · {m.at}</span>
              <p>{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      {r.status !== "resolved" && r.id !== "messages" && (
        <div className="order-reply">
          <Textarea floatingLabel={r.status === "waiting" ? "Your answer" : "Add something"} value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={2000} fullWidth />
          <Button variant="secondary" size="small" loading={busy} disabled={!reply.trim() || busy} onClick={() => void send()}>Send</Button>
        </div>
      )}
    </li>
  );
}
