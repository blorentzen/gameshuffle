"use client";

/**
 * Your events ▸ Communities (menus and account picks 2026-11-05, 4A): the communities and crews you're part of, one row
 * each, linking to their page. Reads /api/communities/mine.
 */

import { useEffect, useState } from "react";
import { Button, EmptyState } from "@empac/cascadeds";
import { useRouter } from "next/navigation";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { StuffGroup, StuffRow, StuffThumb } from "@/components/account/stuff/StuffList";
import "@/styles/account-home.css";

interface Community { id: string; slug: string; name: string }

export function CommunitiesTab() {
  const router = useRouter();
  const [list, setList] = useState<Community[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/communities/mine", { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((j: { ok?: boolean; communities?: Community[] } | null) => {
      if (!live) return;
      if (!j?.ok) { setFailed(true); return; }
      setList(j.communities ?? []);
    });
    return () => { live = false; };
  }, []);

  const find = <Button variant="secondary" size="small" onClick={() => router.push("/communities")}>Find a community</Button>;

  return (
    <AdminScreen title="Communities" intro="The communities and crews you're part of." actions={find}>
      {failed && <p className="acct-note">Your communities couldn&apos;t be loaded. Try again in a moment.</p>}
      {!failed && list === null && <p className="acct-note" role="status">Loading…</p>}
      {list && list.length === 0 && (
        <EmptyState title="No communities yet" description="Join one to see its events, crews and chat in one place, or start your own." action={find} />
      )}
      <StuffGroup title="Your communities" items={list ?? []} page={20} row={(c) => (
        <StuffRow key={c.id} thumb={<StuffThumb art="community" seed={c.id} />} title={c.name} href={`/c/${c.slug}`} />
      )} />
    </AdminScreen>
  );
}
