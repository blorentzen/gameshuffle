"use client";

/** Compare on a player's page (round 2 tightening, 7A): a header button that asks for the other player's username. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormField, Input, Modal } from "@empac/cascadeds";
import { IconArrowsLeftRight } from "@tabler/icons-react";

export function TtCompareButton({ base, query, current }: { base: string; query: string; current?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current ?? "");
  const router = useRouter();
  const go = () => {
    const qs = new URLSearchParams(query);
    if (name.trim()) qs.set("vs", name.trim()); else qs.delete("vs");
    const s = qs.toString();
    setOpen(false);
    router.push(`${base}${s ? `?${s}` : ""}`);
  };
  return (
    <>
      <Button variant="secondary" iconBefore={IconArrowsLeftRight} onClick={() => setOpen(true)}>Compare</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Compare times" size="small">
        <form className="tt-form" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <FormField label="The other player's username" htmlFor="tt-vs">
            <Input id="tt-vs" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" fullWidth />
          </FormField>
          <div className="tt-add__actions"><Button type="submit" variant="primary" disabled={!name.trim()}>Compare</Button></div>
        </form>
      </Modal>
    </>
  );
}
