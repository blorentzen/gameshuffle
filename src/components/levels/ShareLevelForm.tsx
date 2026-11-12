"use client";

/**
 * Share a level (or a Minecraft seed) to its game's board. The code is checked as it's typed (a Mario Maker 2 course
 * ID by its own check bits). A seed also takes Java or Bedrock, the version, a note and up to five places worth seeing
 * (curation picks 15A). `initialCode` fills the code in, for a level cleared on stream whose sender came back from
 * their notification (curation picks 11A): the one thing left is its name. The board keys the form on it, so a new
 * code starts a fresh form.
 */

import { useState } from "react";
import { Button, Chip, Input, Modal, Radio, RadioGroup, Textarea } from "@empac/cascadeds";
import { IconPlus, IconX } from "@tabler/icons-react";
import { IconAction } from "@/components/actions/IconAction";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { checkCode } from "@/lib/levels/codes";
import { itemWord, LEVEL_GAMES, type LevelGame } from "@/lib/levels/games";
import { NOTE_MAX, SPOTS_MAX, TAG_MAX, TAGS_MAX, TITLE_MAX, type SeedEdition } from "@/lib/levels/rules";
import type { LevelCardView } from "@/lib/levels/types";

interface SpotDraft { label: string; x: string; y: string; z: string }
const blankSpot = (): SpotDraft => ({ label: "", x: "", y: "", z: "" });

function hint(game: LevelGame): string {
  if (game === "super-mario-maker-2") return "We check it as you type: a course ID carries its own check.";
  if (game === "fortnite") return "12 numbers. A play.fn.gg or fortnite.com link works too.";
  if (game === "geometry-dash") return "The number on the level's info page.";
  if (game === "minecraft") return "The number /seed shows in the world, or the word you typed when you made it.";
  return "12 numbers. A copied code works too.";
}

export function ShareLevelForm({ game, open, onClose, onShared, initialCode }: {
  game: LevelGame;
  open: boolean;
  onClose: () => void;
  onShared: (l: LevelCardView) => void;
  initialCode?: string | null;
}) {
  const g = LEVEL_GAMES[game];
  const seed = g.kind === "seed";
  const toast = useToast();
  const [code, setCode] = useState(initialCode ?? "");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [own, setOwn] = useState("");
  const [edition, setEdition] = useState<SeedEdition>("java");
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("");
  const [spots, setSpots] = useState<SpotDraft[]>([blankSpot()]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = code.trim() ? checkCode(game, code) : null;

  const toggleTag = (t: string) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : ts.length >= TAGS_MAX ? ts : [...ts, t]));
  const addOwn = () => {
    const t = own.replace(/\s+/g, " ").trim().slice(0, TAG_MAX);
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase()) || tags.length >= TAGS_MAX) { setOwn(""); return; }
    setTags((ts) => [...ts, t]);
    setOwn("");
  };
  const setSpot = (i: number, k: keyof SpotDraft, v: string) => setSpots((ss) => ss.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  async function share() {
    setProblem(null);
    if (!check?.ok) { setProblem(check ? check.line : `Add the ${itemWord(game)}'s ${g.codeWord}.`); return; }
    if (!title.trim()) { setProblem(`Give the ${itemWord(game)} its name.`); return; }
    setBusy(true);
    const body = {
      game, code, title, tags,
      ...(seed ? { edition, version, note, spots: spots.map((s) => ({ label: s.label, x: s.x, y: s.y, z: s.z })) } : {}),
    };
    const r = await fetch("/api/levels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const d = (await r?.json().catch(() => null)) as { level?: LevelCardView; line?: string } | null;
    if (!r?.ok || !d?.level) { setProblem(d?.line ?? "That didn't go through. Try again."); return; }
    track(EVENTS.levelShared, { game });
    toast.success(seed ? "Your seed is on the board" : "Your level is on the board");
    onShared(d.level);
    setCode(""); setTitle(""); setTags([]); setOwn(""); setVersion(""); setNote(""); setSpots([blankSpot()]);
    onClose();
  }

  const offered = [...new Set([...g.tags, ...tags])];
  const word = `${g.codeWord[0].toUpperCase()}${g.codeWord.slice(1)}`;
  return (
    <Modal
      isOpen={open} onClose={onClose} title={seed ? "Share a seed" : "Share a level"} size="medium" className="lvl-share"
      footer={<div className="lvl-share__foot">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void share()} disabled={busy}>{busy ? "Sharing" : "Share it"}</Button>
      </div>}
    >
      <div className="lvl-share__body">
        <div>
          <Input
            floatingLabel={seed ? word : `${word} (${g.shape})`}
            value={code} onChange={(e) => setCode(e.target.value)} fullWidth autoComplete="off" spellCheck={false}
            variant={check ? (check.ok ? "success" : "error") : "default"}
            aria-describedby="lvl-share-check"
          />
          <p id="lvl-share-check" className={`lvl-share__check${check && !check.ok ? " lvl-share__check--bad" : ""}`} aria-live="polite">
            {!check ? hint(game) : check.ok ? `${check.code} looks right.` : check.line}
          </p>
        </div>
        {seed && (
          <div className="lvl-share__row">
            <RadioGroup name="lvl-edition" label="Edition" value={edition} onChange={(v) => setEdition(v as SeedEdition)} orientation="horizontal">
              <Radio value="java" label="Java" />
              <Radio value="bedrock" label="Bedrock" />
            </RadioGroup>
            <Input floatingLabel="Version" value={version} onChange={(e) => setVersion(e.target.value)} maxLength={10} placeholder="1.21.4" />
          </div>
        )}
        <Input floatingLabel={seed ? "Name for the world" : "Level name"} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} fullWidth />
        {seed && (
          <Textarea floatingLabel="What's good about it" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} rows={3} fullWidth />
        )}
        {seed && (
          <fieldset className="lvl-share__spots">
            <legend>Places worth seeing (up to {SPOTS_MAX})</legend>
            {spots.map((s, i) => (
              <div key={i} className="lvl-share__spot">
                <Input floatingLabel="Place" value={s.label} onChange={(e) => setSpot(i, "label", e.target.value)} maxLength={40} />
                <Input floatingLabel="X" value={s.x} onChange={(e) => setSpot(i, "x", e.target.value)} inputMode="numeric" />
                <Input floatingLabel="Y" value={s.y} onChange={(e) => setSpot(i, "y", e.target.value)} inputMode="numeric" />
                <Input floatingLabel="Z" value={s.z} onChange={(e) => setSpot(i, "z", e.target.value)} inputMode="numeric" />
                {spots.length > 1 && <IconAction label={`Take out place ${i + 1}`} icon={IconX} onClick={() => setSpots((ss) => ss.filter((_, j) => j !== i))} />}
              </div>
            ))}
            {spots.length < SPOTS_MAX && <div><Button variant="ghost" size="small" iconBefore={IconPlus} onClick={() => setSpots((ss) => [...ss, blankSpot()])}>Add a place</Button></div>}
          </fieldset>
        )}
        <fieldset className="lvl-share__tags">
          <legend>Tags (up to {TAGS_MAX})</legend>
          <div className="lvl-share__chips">
            {offered.map((t) => (
              <Chip key={t} label={t} clickable selected={tags.includes(t)} onClick={() => toggleTag(t)} size="small" disabled={!tags.includes(t) && tags.length >= TAGS_MAX} />
            ))}
          </div>
          <div className="lvl-share__own">
            <Input floatingLabel="Your own tag" value={own} onChange={(e) => setOwn(e.target.value)} maxLength={TAG_MAX}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOwn(); } }} />
            <Button variant="secondary" size="small" iconBefore={IconPlus} onClick={addOwn} disabled={!own.trim() || tags.length >= TAGS_MAX}>Add tag</Button>
          </div>
        </fieldset>
        {problem && <p className="lvl-share__problem" role="alert">{problem}</p>}
        <p className="lvl-share__note">
          {seed ? "Shared with your GameShuffle name." : "Shared with your GameShuffle name. When a streamer plays it from their level queue, its card says how it went."}
        </p>
      </div>
    </Modal>
  );
}
