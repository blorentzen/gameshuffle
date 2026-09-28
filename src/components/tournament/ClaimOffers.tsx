"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Checkbox } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { formatEventTime } from "@/lib/time/format";

/**
 * Lists guest entries saved under the account's verified email and links the
 * ones the person ticks (spec F). Rendered by /claim.
 */

interface Offer { claimId: string; tournamentId: string; tournamentTitle: string; dateTime: string | null; displayName: string }

export function ClaimOffers({ verified }: { verified: boolean }) {
  const toast = useToast();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!verified) return;
    let live = true;
    void fetch("/api/account/claims", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!live) return;
      const list = (j.offers ?? []) as Offer[];
      setOffers(list);
      setPicked(new Set(list.map((o) => o.claimId)));
    }).catch(() => live && setOffers([]));
    return () => { live = false; };
  }, [verified]);

  if (!verified) return <Alert variant="warning" title="Confirm your email first">Confirm the address on your account, then come back here to see entries saved under it.</Alert>;
  if (offers === null) return <p className="claim-flow__p">Looking for entries…</p>;
  if (done) {
    return (
      <Alert variant="success" title={done === 1 ? "1 entry linked" : `${done} entries linked`}>
        <p className="claim-flow__p">They&apos;re on your account now, with their original dates and results.</p>
        <Link href="/account/stuff?tab=tournaments" style={{ textDecoration: "none" }}><Button variant="primary" size="small">See my tournaments</Button></Link>
      </Alert>
    );
  }
  if (!offers.length) return <Alert variant="info" title="Nothing to link">There are no unclaimed guest entries under your email right now.</Alert>;

  const toggle = (id: string, on: boolean) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const link = async () => {
    setBusy(true);
    const r = await fetch("/api/account/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimIds: [...picked] }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok || !j.linked) { toast.error("Couldn't link those entries. Please try again."); return; }
    toast.success(j.linked === 1 ? "Entry linked to your account" : `${j.linked} entries linked to your account`);
    setDone(j.linked);
  };

  return (
    <>
      <p className="claim-flow__p">
        Someone entered {offers.length === 1 ? "this tournament" : "these tournaments"} as a guest using your email address.
        Tick the ones that were you and link them to keep the results. Leave anything that wasn&apos;t.
      </p>
      <div className="claim-offers">
        {offers.map((o) => (
          <Checkbox
            key={o.claimId}
            checked={picked.has(o.claimId)}
            onChange={(e) => toggle(o.claimId, e.target.checked)}
            label={`${o.displayName} in ${o.tournamentTitle}`}
            helperText={o.dateTime ? formatEventTime(o.dateTime, null) : undefined}
          />
        ))}
      </div>
      <div className="claim-flow__row">
        <Button variant="primary" size="small" onClick={link} disabled={busy || !picked.size}>
          {busy ? "Linking…" : picked.size === 1 ? "Link 1 entry" : `Link ${picked.size} entries`}
        </Button>
      </div>
    </>
  );
}
