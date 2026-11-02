"use client";

/**
 * Staff page ▸ Seasons: every season with its dates, and ending the current one (admins). Full reset: everyone starts
 * over and places again. Soft reset: everyone keeps part of their distance from the season's middle MMR and starts the
 * new season already placed. Tables still waiting have to be dealt with first.
 */

import { useState } from "react";
import { Alert, Button, Modal, Radio, RadioGroup, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { Select } from "@/components/ui/Select";
import { TableScroll } from "@/components/ui/TableScroll";
import type { StaffTabProps } from "./RankedStaffHub";
import { ModalButtons } from "./StaffPeople";
import { dateOnly, num } from "./types";

export function StaffSeasons({ data, act, reload }: StaffTabProps) {
  const toast = useToast();
  const [ending, setEnding] = useState(false);
  const [reset, setReset] = useState<"full" | "soft">("soft");
  const [keep, setKeep] = useState("0.5");
  const [busy, setBusy] = useState(false);
  const admin = data.you.role === "admin";
  const waiting = data.tables.waiting.length;
  const season = data.ladder.season;
  const end = async () => {
    setBusy(true);
    const res = await act({ action: "end_season", reset, keep: Number(keep) });
    setBusy(false);
    if (res.ok) {
      const carried = Number(res.carried ?? 0);
      toast.success(reset === "soft" ? `Season ${num(season + 1)} has started. ${num(carried)} players carried over.` : `Season ${num(season + 1)} has started.`);
      setEnding(false);
      reload();
    } else toast.error(res.error === "pending" ? "Verify or send back the waiting tables first." : res.error === "moved" ? "The season already changed. Refresh the page." : "That didn't work. Try again in a moment.");
  };
  return (
    <section className="ranked-staff__panel" aria-labelledby="staff-seasons">
      <h2 id="staff-seasons" className="sr-only">Seasons</h2>
      <TableScroll label="The lounge's seasons">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Season</TableHead><TableHead>Started</TableHead><TableHead>Ended</TableHead><TableHead>From</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.seasons.map((s) => (
              <TableRow key={s.season}>
                <TableCell>Season {s.season}{s.current ? " (now)" : ""}</TableCell>
                <TableCell>{dateOnly(s.startedAt) || "Not on record"}</TableCell>
                <TableCell>{s.current ? "Still running" : dateOnly(s.endedAt) || "Not on record"}</TableCell>
                <TableCell>{s.imported ? "The lounge's own records" : "GameShuffle"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
      {admin ? (
        <div className="ranked-staff__bar">
          <Button variant="secondary" onClick={() => setEnding(true)}>End Season {season}</Button>
        </div>
      ) : (
        <p className="ladder-muted">The server&apos;s admins end seasons.</p>
      )}
      {ending && (
        <Modal isOpen onClose={() => setEnding(false)} title={`End Season ${season}`} footer={<ModalButtons label={`End Season ${season}`} danger onClick={end} busy={busy} disabled={waiting > 0} onCancel={() => setEnding(false)} />}>
          <div className="ranked-form">
            {waiting > 0 && <Alert variant="warning">{`${num(waiting)} ${waiting === 1 ? "table is" : "tables are"} still waiting. Verify or send them back first: they belong to Season ${season}.`}</Alert>}
            <RadioGroup name="reset" label={`How Season ${season + 1} starts`} value={reset} onChange={(v) => setReset(v === "full" ? "full" : "soft")}>
              <Radio value="soft" label="Soft reset" helperText="Everyone keeps part of their distance from the season's middle MMR and starts already placed." />
              <Radio value="full" label="Full reset" helperText="Everyone starts over and places again." />
            </RadioGroup>
            {reset === "soft" && (
              <Select floatingLabel="How much they keep" value={keep} onChange={(v) => setKeep(String(v))} options={[{ value: "0.25", label: "A quarter of their distance" }, { value: "0.5", label: "Half of their distance" }, { value: "0.75", label: "Three quarters of their distance" }]} />
            )}
            <p className="ladder-muted">Season {season}&apos;s standings stay on the lounge&apos;s page under the Season menu. This can&apos;t be undone.</p>
          </div>
        </Modal>
      )}
    </section>
  );
}
