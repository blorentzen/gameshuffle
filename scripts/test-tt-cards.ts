// The time trial messages as cards (picks 2026-11-12, all 15 as recommended): every message built from fixtures and
// checked against Discord's rules and ours. No Discord calls.
// Run: npx tsx -r ./scripts/server-only-shim.cjs scripts/test-tt-cards.ts
import { readFileSync } from "node:fs";
import {
  addReplyCard, boardCard, checkCard, checkWarnings, clipForm, countedCard, decodeState, encodeState, fixPickerCard, gameChoiceCard, lapLines, lapsTitle,
  lineInPlace, lineMessage, modalParts, panelCard, pickerCard, playerNoteCard, privately, recordPostCard, saveListCard, savedCard, statusWord, timeDetails,
  AMBER, EPHEMERAL, GOLD, ICE, V2, type BoardLine, type CheckDraft, type Message,
} from "../src/lib/discord/ttCards";
import { playerReply, TT_CLIP_MODAL_PREFIX, TT_CLIP_PREFIX, TT_EVENT_PREFIX, TT_NO_PREFIX, TT_OK_PREFIX, TT_REPORT_PREFIX, TT_UNDO_PREFIX, TT_VERIFY_PREFIX, TT_VOUCH_PREFIX } from "../src/lib/discord/commands/timeTrials";
import { handleTtPanelComponent, TT_BOARD_PREFIX, TT_CUP_PREFIX, TT_FIXTIME_MODAL, TT_FIXTIME_PREFIX, TT_FIXTRACK_PREFIX, TT_MINE_POST, TT_PANEL_MODAL, TT_POST_PREFIX, TT_TRACK_PREFIX, TT_VIEW_PREFIX } from "../src/lib/discord/commands/ttPanelActions";
import { TT_IMPORT_PREFIX } from "../src/lib/discord/commands/ttImport";
import { TT_PANEL_PREFIX, COMP_COLOR } from "../src/lib/discord/ttPanel";
import { ttTracks, ttCups, type TtGame } from "../src/lib/timeTrials/tracks";
import { trackTitle } from "../src/lib/timeTrials/codes";
import type { TtBest } from "../src/lib/timeTrials/store";

let pass = 0, fail = 0;
const ok = (cond: unknown, label: string) => { if (cond) pass++; else { fail++; console.log("FAIL", label); } };
const eq = (a: unknown, b: unknown, label: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ── The custom ids as they were before the cards (extracted from ttPanel.ts, commands/timeTrials.ts,
//    commands/ttPanelActions.ts and commands/ttImport.ts on 2026-11-12, before any change). Buttons on older posts
//    must keep working, so every id a card makes has to fit one of these. The one addition: the active button of a
//    board's mushrooms and speed pairs carries ".i" / ".c" after the state, so no two buttons share an id (Discord
//    refuses that); today's decoder reads the first five parts and ignores the tail.
const STATE = String.raw`[dw]\.[a-z0-9-]+\.(150|200)\.[ns]\.[se]`;
const ID = String.raw`[A-Za-z0-9-]+`;
const TODAY_IDS: RegExp[] = [
  new RegExp(String.raw`^ttp:(add|top|me):(mk8dx|mkworld|both)$`),
  ...["ttok", "ttno", "ttv", "ttr", "ttu", "ttw", "ttclip", "ttclipm", "ttpk", "ttpx", "ttpxm", "ttq"].map((p) => new RegExp(`^${p}:${ID}$`)),
  new RegExp(`^tteva:${ID}:${ID}$`),
  /^ttpm:(mk8dx|mkworld)$/,
  new RegExp(`^ttpc:(top|fix):${ID}$`),
  new RegExp(`^ttpt:(top|fix):${ID}(:\\d+)?$`),
  new RegExp(`^ttpv:(track|cup):(top|fix):${ID}$`),
  new RegExp(`^ttpb:${STATE}(\\.[ic])?$`),
  new RegExp(`^ttpp:${STATE}$`),
  /^ttpme:(mk8dx|mkworld|both)$/,
];
const FORM_FIELDS = new Set(["url", "shot", "cat", "veh", "time"]);

// The prefixes kept their values after moving into ttCards.ts.
eq([TT_PANEL_PREFIX, TT_OK_PREFIX, TT_NO_PREFIX, TT_VERIFY_PREFIX, TT_REPORT_PREFIX, TT_UNDO_PREFIX, TT_VOUCH_PREFIX, TT_CLIP_PREFIX, TT_CLIP_MODAL_PREFIX, TT_EVENT_PREFIX],
  ["ttp:", "ttok:", "ttno:", "ttv:", "ttr:", "ttu:", "ttw:", "ttclip:", "ttclipm:", "tteva:"], "timeTrials prefixes unchanged");
eq([TT_PANEL_MODAL, TT_CUP_PREFIX, TT_TRACK_PREFIX, TT_VIEW_PREFIX, TT_BOARD_PREFIX, TT_POST_PREFIX, TT_MINE_POST, TT_FIXTRACK_PREFIX, TT_FIXTIME_PREFIX, TT_FIXTIME_MODAL, TT_IMPORT_PREFIX],
  ["ttpm:", "ttpc:", "ttpt:", "ttpv:", "ttpb:", "ttpp:", "ttpme:", "ttpk:", "ttpx:", "ttpxm:", "ttq:"], "panel and import prefixes unchanged");
eq(COMP_COLOR, 0xcfe2ee, "COMP_COLOR is still the ice");

// ── Checking one message ───────────────────────────────────────────────────────────────────────
type C = { type: number; components?: C[]; accessory?: C; content?: string; custom_id?: string; style?: number; label?: string; url?: string; items?: { media: { url: string } }[]; media?: { url: string }; divider?: boolean; accent_color?: number; options?: unknown[] };
const all: { name: string; msg: Message }[] = [];
const DASH = /[\u2013\u2014]/;

function walk(list: C[] | undefined, fn: (c: C, parent: C | null) => void, parent: C | null = null) {
  for (const c of list ?? []) {
    fn(c, parent);
    walk(c.components, fn, c);
    if (c.accessory) { fn(c.accessory, c); }
  }
}

function check(name: string, msg: Message, opts: { v2?: boolean; accent?: number; maxDividers?: number } = {}) {
  all.push({ name, msg });
  const v2 = opts.v2 ?? true;
  const flags = Number(msg.flags) || 0;
  if (v2) {
    ok((flags & V2) !== 0, `${name}: V2 flag`);
    ok(msg.content == null && msg.embeds == null, `${name}: no content or embeds beside a card`);
  }
  const comps = (msg.components ?? []) as C[];
  let count = 0, textLen = 0;
  const ids: string[] = [];
  walk(comps, (c, parent) => {
    count++;
    if (c.type === 10) {
      textLen += (c.content ?? "").length;
      ok((c.content ?? "").trim().length > 0, `${name}: empty text`);
    }
    if (c.type === 1) {
      const kids = c.components ?? [];
      const selects = kids.filter((k) => k.type === 3).length;
      ok(selects ? kids.length === 1 : kids.length >= 1 && kids.length <= 5, `${name}: a row holds 1-5 buttons or one menu (${kids.length})`);
      // Links last in a row (rule 7).
      const firstLink = kids.findIndex((k) => k.style === 5);
      ok(firstLink < 0 || kids.slice(firstLink).every((k) => k.style === 5), `${name}: links last in a row`);
    }
    if (c.type === 9) {
      const texts = (c.components ?? []).filter((k) => k.type === 10).length;
      ok(texts >= 1 && texts <= 3 && (c.components ?? []).length === texts, `${name}: a section holds 1-3 text displays`);
      ok(c.accessory && (c.accessory.type === 2 || c.accessory.type === 11), `${name}: a section's accessory is a button or a thumbnail`);
    }
    if (c.type === 2) {
      ok(c.label && c.label.length <= 80, `${name}: button label 1-80 (${c.label})`);
      if (c.style === 5) ok(/^https:\/\//.test(c.url ?? ""), `${name}: link button url ${c.url}`);
      else { ok(!!c.custom_id, `${name}: button custom id`); ids.push(c.custom_id!); }
      ok(parent?.type === 1 || parent?.type === 9, `${name}: a button sits in a row or a section`);
    }
    if (c.type === 3) { ids.push(c.custom_id!); ok((c.options ?? []).length >= 1 && (c.options ?? []).length <= 25, `${name}: menu 1-25 options`); }
    if (c.type === 11) ok(/^https:\/\//.test(c.media?.url ?? ""), `${name}: thumbnail url`);
    if (c.type === 12) ok((c.items ?? []).every((i) => /^https:\/\//.test(i.media.url)), `${name}: gallery url`);
    if (c.type === 17) {
      ok(parent === null, `${name}: a container at the top`);
      if (opts.accent != null) eq(c.accent_color, opts.accent, `${name}: accent`);
      ok([ICE, GOLD, AMBER].includes(c.accent_color ?? -1), `${name}: accent is ice, gold or amber`);
      const dividers = (c.components ?? []).filter((k) => k.type === 14 && k.divider).length;
      ok(dividers <= (opts.maxDividers ?? 3), `${name}: at most ${opts.maxDividers ?? 3} dividers (${dividers})`);
      // No divider at the top or bottom, and never two lines in a row.
      const kinds = (c.components ?? []).map((k) => (k.type === 14 ? (k.divider ? "line" : "space") : "x"));
      ok(kinds[0] === "x" && kinds[kinds.length - 1] === "x", `${name}: no divider or space at the card's edge`);
      ok(!kinds.some((k, i) => k !== "x" && kinds[i + 1] !== undefined && kinds[i + 1] !== "x"), `${name}: no two dividers or spaces in a row`);
    }
  });
  if (v2) {
    ok(count <= 40, `${name}: ${count} components (40 at most)`);
    ok(textLen <= 4000, `${name}: ${textLen} characters of text (4,000 at most)`);
    ok(comps.filter((c) => c.type === 17).length <= 1, `${name}: one card per message`);
  }
  ok(new Set(ids).size === ids.length, `${name}: custom ids unique in the message (${ids.join(", ")})`);
  for (const id of ids) ok(TODAY_IDS.some((r) => r.test(id)), `${name}: custom id ${id} is one of today's`);
  const json = JSON.stringify(msg);
  ok(!DASH.test(json), `${name}: no em or en dashes`);
  ok(!/2b52d6|2839254/i.test(json), `${name}: no old blue`);
  ok(!/gameshuffle\.co\/time-trials"/.test(json) && !/Time trials · gameshuffle/.test(json), `${name}: no site address footer`);
  return { count, textLen };
}
const textOf = (msg: Message) => { const out: string[] = []; walk(msg.components as C[], (c) => { if (c.type === 10) out.push(c.content ?? ""); }); return out.join("\n"); };
const idsOf = (msg: Message) => { const out: string[] = []; walk(msg.components as C[], (c) => { if (c.custom_id) out.push(c.custom_id); }); return out; };
const labels = (msg: Message) => { const out: string[] = []; walk(msg.components as C[], (c) => { if (c.type === 2) out.push(c.label!); }); return out; };
const container = (msg: Message) => (msg.components as C[])[0];

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────────
const dx = ttTracks("mk8dx"), world = ttTracks("mkworld");
const daisy = dx.find((t) => t.name === "Wii Daisy Circuit")!;
const rainbow = dx.find((t) => t.name === "Rainbow Road")!;
const meadows = dx.find((t) => t.name === "Wii Moo Moo Meadows")!;
const snes = world.find((t) => !t.image)!;
const LONG = "Kart Club Time Trial Cup with a very long name for the event";
const UUID = "8f3c2a91-6d1e-4b7a-9c55-2e0f1a7b3d44";
const SHOT = "https://gs-ugc.empac.co/time-trials/abc/shot.jpg";
ok(daisy && rainbow && meadows && snes, "fixture tracks found");
const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DAISY = rx(trackTitle(daisy)), MEADOWS = rx(trackTitle(meadows));

// ── The panel ──────────────────────────────────────────────────────────────────────────────────
const now = new Date().toISOString();
const recs = [
  { game: "mk8dx" as TtGame, track: rainbow.id, cc: 150 as const, items: "shrooms" as const, timeMs: 144418, at: now, name: "Riley" },
  { game: "mk8dx" as TtGame, track: daisy.id, cc: 200 as const, items: "none" as const, timeMs: 125291, at: now, name: "Quinn_the_*great*" },
  { game: "mkworld" as TtGame, track: world[0].id, cc: 150 as const, items: "shrooms" as const, timeMs: 96673, at: now, name: "Sam" },
];
for (const game of ["mk8dx", "mkworld", "both"] as const) {
  const comps = panelCard({ serverTitle: "Kart Club", games: game === "both" ? ["mk8dx", "mkworld"] : [game], game, monthTimes: 17, monthPlayers: 5, records: recs, boardUrl: "https://www.gameshuffle.co/time-trials/servers/1" });
  check(`panel ${game}`, { flags: V2, components: comps }, { accent: ICE, maxDividers: 2 });
  const t = textOf({ components: comps });
  ok(t.startsWith("## Time trials in Kart Club\n-# "), `panel ${game}: ## title, month as small print`);
  ok(/### Newest server records/.test(t) && /\n-# 150cc, mushrooms · /.test(t) && /<t:\d+:R>/.test(t), `panel ${game}: each record's category and when on a small line`);
  ok(game !== "both" || /· MK8DX ·/.test(t), "panel both: the game in small print");
  ok(/Quinn\\_the\\_\\\*great\\\*/.test(t), "panel: names escaped");
  eq(labels({ components: comps }), ["Add a time", "Top ten", "My times", "Server board"], `panel ${game}: buttons`);
}
check("panel empty", { flags: V2, components: panelCard({ serverTitle: null, games: ["mk8dx"], game: "mk8dx", monthTimes: 0, monthPlayers: 0, records: [], boardUrl: "https://www.gameshuffle.co/x" }) });

// ── Record posts ───────────────────────────────────────────────────────────────────────────────
const vs = { name: "Hayato", timeMs: 106941, laps: [35002, 35840, 36099], record: true };
const laps = { title: lapsTitle(vs), lines: lapLines([35104, 36011, 36397], vs) };
eq(laps.lines, ["Lap 1 **35.104** +0.102", "Lap 2 **36.011** +0.171", "Lap 3 **36.397** +0.298"], "laps: one line per lap with the gap");
eq(laps.title, "Laps against the record (Hayato, 1:46.941)", "laps title");
eq(lapLines([35000], { laps: [35000] }), ["Lap 1 **35.000** even"], "laps: an even lap");
eq(lapsTitle({ name: "Ren", timeMs: 107104, record: false }), "Laps against Ren's time (1:47.104)", "laps against another time");

const record = recordPostCard({ kind: "record", track: rainbow, category: "150cc, mushrooms", who: "🇺🇸 Riley", timeMs: 144418, details: ["Was 2:25.905 by Quinn", "212th on GameShuffle"], proofUrl: SHOT, timeId: UUID, board: { label: "Full board", url: "https://www.gameshuffle.co/time-trials/x" }, server: "Kart Club" });
check("server record", record, { accent: GOLD });
const rc = container(record).components!;
eq(rc.map((c) => (c.type === 14 ? (c.divider ? "|" : "_") : c.type)), [9, "|", 10, "|", 10, 12, "|", 1, 9], "server record: header, body, proof, buttons, managers");
ok(textOf(record).startsWith("## New server record\nRainbow Road"), "server record: ## title, track and category");
eq(labels(record), ["Vouch", "Report", "Full board", "Verify"], "server record: Verify last, on its own line");
ok(rc[8].accessory?.custom_id === `ttv:${UUID}` && rc[8].accessory?.style === 2, "server record: Verify grey beside the managers' line");
ok(/^-# Server managers can check this time for Kart Club\.$/.test((rc[8].components ?? [])[0].content ?? ""), "server record: managers' line in small print");
ok(/^-# Proof · result screenshot$/.test(rc[4].content ?? ""), "server record: proof label");

const best = recordPostCard({ kind: "best", track: daisy, category: "150cc, mushrooms", who: "Kevo", timeMs: 107512, details: ["0.384 faster than before", "2nd of 6 in this server", "9th of 212 on GameShuffle"], laps, proofUrl: SHOT, timeId: UUID, board: { label: "Track board", url: "https://www.gameshuffle.co/time-trials/x" }, server: "Kart Club" });
check("new best", best, { accent: ICE });
eq(container(best).components!.map((c) => (c.type === 14 ? (c.divider ? "|" : "_") : c.type)), [9, "|", 10, "_", 10, "|", 10, 12, "|", 1, 9], "new best: laps after a space");
const bestNoShot = recordPostCard({ kind: "best", track: snes, category: "mushrooms", who: "Kevo", timeMs: 107512, details: [], proofUrl: null, timeId: UUID, board: { label: "Track board", url: "https://www.gameshuffle.co/x" }, server: null });
check("new best, no art or proof", bestNoShot, { maxDividers: 2 });
ok(container(bestNoShot).components![0].type === 10, "no track art: a plain header");

// ── The reply after /tt add ────────────────────────────────────────────────────────────────────
const base = { track: daisy, category: "150cc, mushrooms", timeMs: 107512, timeId: UUID, best: true, previousMs: 107896, place: 9, total: 212, server: { place: 2, total: 6 }, laps, boardUrl: "https://www.gameshuffle.co/x" };
const most = addReplyCard({ ...base, askClip: true, clipSent: false, events: [1, 2, 3].map((i) => ({ id: `e${i}`, title: `${LONG} ${i}` })), countryCmd: "/tt country", unlinked: true });
const m = check("add reply, every ask", most);
console.log(`  biggest add reply: ${m.count} components, ${m.textLen} characters`);
ok(textOf(most).startsWith(`### Saved: 1:47.512\n${trackTitle(daisy)}\n-# 150cc, mushrooms`), "add reply: ### title, track, category small");
ok(/\*\*New best\*\*, 0\.384 faster than before\n2nd of 6 in this server · 9th of 212 on GameShuffle/.test(textOf(most)), "add reply: result and places");
eq(labels(most), ["Add clip", "Count it", "Count it", "Count it", "Link to GameShuffle", "Undo", "Track board"], "add reply: asks beside their sentences, Undo and board at the bottom");
ok(idsOf(most).includes(`tteva:${UUID}:e2`), "add reply: Count it keeps its id");
ok(/Add your country with `\/tt country` so your times count on its records\./.test(textOf(most)), "add reply: country ask");
const one = addReplyCard({ ...base, laps: null, askClip: false, clipSent: true, events: [{ id: "e1", title: "Kart Club Time Trial Cup" }], countryCmd: null, unlinked: false });
check("add reply, one event", one);
ok(/You're in Kart Club Time Trial Cup on this track\. Count this run there too\?/.test(textOf(one)) && /in the review queue/.test(textOf(one)), "add reply: one event, clip sent");
const plain = addReplyCard({ ...base, best: false, previousMs: 106000, laps: null, askClip: false, clipSent: false, events: [], countryCmd: null, unlinked: false });
check("add reply, nothing to ask", plain, { maxDividers: 2 });
ok(/Your best is still \*\*1:46\.000\*\*/.test(textOf(plain)), "add reply: not a best");
ok(/your first time/.test(textOf(addReplyCard({ ...base, previousMs: null, laps: null, askClip: false, clipSent: false, events: [], countryCmd: null, unlinked: false }))), "add reply: first time");

check("counted", countedCard({ title: "Kart Club Time Trial Cup", detail: "1st of 6 on Wii Daisy Circuit (bDC) so far.", clipAsk: "The organizer asks for a clip of this run's last 30 seconds before the results are final: add it on the event page.", eventUrl: "https://www.gameshuffle.co/tournament/x" }));

// ── The check ─────────────────────────────────────────────────────────────────────────────────
const draft: CheckDraft = { game: "mk8dx", track: daisy.id, cc: 150, items: "shrooms", vehicle: "teddy", timeMs: 107521, read: false, readMs: 107512, laps: [35104, 36011, 36397], proofUrl: SHOT, parts: { body: "Teddy Buggy", wheels: "Roller", glider: "Cloud Glider" }, shotTrack: { game: "mk8dx", id: meadows.id } };
const warned = checkCard(UUID, draft);
check("check, every warning", warned, { accent: AMBER });
const wt = textOf(warned);
ok(/### Check your time\n-# Nothing is saved until you press Add it/.test(wt), "check: title");
ok(new RegExp(`\\*\\*1:47\\.521\\*\\* on ${DAISY}\\n-# 150cc, mushrooms · Teddy Buggy board`).test(wt), "check: time, track, category and board");
ok(/⚠️ You typed 1:47\.521\. The screenshot reads 1:47\.512\./.test(wt) && /⚠️ The laps don't add up/.test(wt) && new RegExp(`⚠️ The screenshot looks like ${MEADOWS}\\. If it is, press Change track\\.`).test(wt), "check: warnings");
eq(labels(warned), ["Add it", "Change track", "Change time", "Cancel"], "check: the same four buttons");
ok(container(warned).components![2].type === 9 && container(warned).components![2].accessory?.type === 11, "check: the time beside its screenshot");
const clean = checkCard(UUID, { game: "mk8dx", track: daisy.id, cc: 150, timeMs: 107512, readMs: 107512, laps: [35104, 36011, 36397], proofUrl: SHOT });
check("check, nothing to warn about", clean, { accent: ICE, maxDividers: 2 });
eq(checkWarnings({ game: "mk8dx", track: daisy.id, cc: 150, timeMs: 107512, readMs: 107512, proofUrl: null }), [], "check: no warnings");
const unread = checkCard(UUID, { game: "mkworld", track: world[3].id, cc: 150, timeMs: null, proofUrl: null });
check("check, time not read", unread, { accent: AMBER });
eq(labels(unread), ["Add it", "Change track", "Type the time", "Cancel"], "check: Type the time");
ok(JSON.stringify(unread).includes('"disabled":true'), "check: Add it waits for a time");
const otherGame = checkWarnings({ game: "mk8dx", track: daisy.id, cc: 150, timeMs: 107512, proofUrl: null, shotTrack: { game: "mkworld", id: world[0].id } });
ok(/Mario Kart World\)\. If it is, add it again with that track\./.test(otherGame[0] ?? ""), "check: another game's track");
ok(checkWarnings({ ...draft, track: meadows.id, read: undefined, readMs: null, laps: null }).length === 0, "check: picking the screenshot's track clears its warning");

// ── Pickers ───────────────────────────────────────────────────────────────────────────────────
const noTrack = checkCard(UUID, { game: "mk8dx", track: null, cc: 150, items: "shrooms", timeMs: 107521, proofUrl: SHOT }, "That looks like Mario Kart World. This panel is for Mario Kart 8 Deluxe.");
check("picker from the check", noTrack, { accent: AMBER, maxDividers: 0 });
ok(/### Which track was it\?\n-# For your 1:47\.521 · 150cc, mushrooms/.test(textOf(noTrack)), "picker: which time it's for");
for (const game of ["mk8dx", "mkworld"] as const) {
  for (const by of ["track", "cup"] as const) {
    check(`picker top ${game} by ${by}`, pickerCard("top", game, game, by), { accent: ICE, maxDividers: 0 });
    check(`picker fix ${game} by ${by}`, fixPickerCard(UUID, { game, track: null, cc: 150, timeMs: null, proofUrl: null }, by, 0));
  }
  const lastCup = ttCups(game).length - 1;
  check(`picker ${game} last cup`, pickerCard("top", game, game, "cup", lastCup));
}
eq(labels(pickerCard("fix", UUID, "mk8dx", "track")), ["By track", "By cup", "Cancel"], "fix picker: Cancel");
check("which game, add", gameChoiceCard("add"));
check("which game, top", gameChoiceCard("top"));

// ── Boards ────────────────────────────────────────────────────────────────────────────────────
const names = ["Hayato", "Lucas", "Ollie_x", "Riley", "Ren", "Tarek", "Jonas", "Mika", "Kevo", "Dani"];
const flags = ["jp", "fr", "gb", "us", "jp", "us", "de", "ca", "us", "es"];
const statuses = [{ video: "checked", vouches: 0, top: true }, { video: "none", sheet: true, vouches: 0, top: true }, { video: "none", vouches: 12, top: true }, { video: "none", vouches: 0, top: true }, { video: "none", vouches: 0, top: false }];
eq(statuses.map(statusWord), ["Verified", "Legacy", "Community verified", "Unverified", ""], "status words");
const lines: BoardLine[] = names.map((n, i) => ({ rank: i + 1, name: `${n} with a long display name`, country: flags[i], timeMs: 106941 + i * 17, status: statusWord(statuses[i % 4]) }));
const mine: BoardLine = { rank: 23, name: "Sam", country: "us", timeMs: 108204, status: "" };
const state = { game: "mk8dx" as const, track: daisy.id, cc: 150 as const, items: "shrooms" as const, scope: "everyone" as const };
const live = boardCard({ track: daisy, cc: 150, items: "shrooms", scopeLabel: "Everyone on GameShuffle", total: 212, rows: lines, mine, recordLaps: { name: "Hayato", laps: vs.laps }, empty: "No times yet.", fullUrl: "https://www.gameshuffle.co/x", live: { state, guild: true } });
const b = check("board, every switch", live, { accent: ICE, maxDividers: 2 });
console.log(`  biggest board: ${b.count} components, ${b.textLen} characters`);
eq(labels(live), ["This server", "Everyone", "Mushrooms", "No mushrooms", "150cc", "200cc", "Another track", "Post here", "Full board"], "board: switches above the list as pairs, then the bottom row");
const styles = (() => { const out: number[] = []; walk(container(live).components, (c) => { if (c.type === 2) out.push(c.style!); }); return out; })();
eq(styles.slice(0, 6), [2, 1, 1, 2, 1, 2], "board: the active switch in each pair is blurple");
const switchIds = idsOf(live).filter((i) => i.startsWith("ttpb:"));
ok(switchIds.every((i) => decodeState(i.slice(5))), "board: every switch decodes with today's reader");
eq(switchIds.map((i) => decodeState(i.slice(5))), [{ ...state, scope: "server" }, state, state, { ...state, items: "none" }, state, { ...state, cc: 200 }], "board: each switch opens the view it names");
ok(idsOf(live).includes(`ttpp:${encodeState(state)}`), "board: Post here keeps its id");
ok(/-# Your place\n23\. 🇺🇸 Sam · \*\*1:48\.204\*\*/.test(textOf(live)), "board: your place after a space");
ok(/-# Record laps \(Hayato\) · 35\.002 · 35\.840 · 36\.099/.test(textOf(live)), "board: record laps");
ok(/1\. 🇯🇵 Hayato with a long display name · \*\*1:46\.941\*\* · Verified/.test(textOf(live)) && /· Legacy\n/.test(textOf(live)) && /· Community verified\n/.test(textOf(live)) && /· Unverified/.test(textOf(live)), "board: the same status words");
ok(new RegExp(`^### ${DAISY}\\n-# 150cc, mushrooms · Everyone on GameShuffle · 212 players$`).test(container(live).components![0].components![0].content ?? ""), "board: header with scope and count in small print");
const worldLive = boardCard({ track: world[2], cc: 150, items: "none", scopeLabel: "Everyone on GameShuffle", total: 1, rows: lines.slice(0, 1), mine: null, recordLaps: null, empty: "x", fullUrl: "https://www.gameshuffle.co/x", live: { state: { game: "mkworld", track: world[2].id, cc: 150, items: "none", scope: "everyone" }, guild: false } });
check("board, World in a DM", worldLive);
eq(labels(worldLive), ["Mushrooms", "No mushrooms", "Another track", "Post here", "Full board"], "board: no server or speed switches where there are none");
const pub = boardCard({ track: daisy, cc: 200, items: "none", scopeLabel: "Players from Japan", total: 40, rows: lines, mine, recordLaps: null, empty: "x", fullUrl: "https://www.gameshuffle.co/x?country=jp" });
check("board, public", pub, { maxDividers: 2 });
eq(labels(pub), ["Full board"], "public board: no switches");
ok(/^## Wii Daisy Circuit/.test(textOf(pub)), "public board: ## title");
check("board, empty", boardCard({ track: snes, cc: 150, items: "shrooms", scopeLabel: "This server", total: 0, rows: [], mine: null, recordLaps: null, empty: "No times yet. Be the first: /tt add", fullUrl: "https://www.gameshuffle.co/x" }));

// ── A player's times ─────────────────────────────────────────────────────────────────────────
const best1 = (game: TtGame, track: string, cc: 150 | 200, i: number): TtBest => ({ game, track, cc, items: "shrooms", vehicle: "any", timeId: `${track}${cc}`, timeMs: 80000 + i * 731, proof: "none", proofUrl: null, video: "none", at: "2026-10-30", place: (i % 12) + 1, total: 14 } as TtBest);
const bests = [...dx.slice(0, 60).map((t, i) => best1("mk8dx", t.id, 150, i)), ...dx.slice(10, 22).map((t, i) => best1("mk8dx", t.id, 200, i + 3)), ...world.slice(0, 40).map((t, i) => best1("mkworld", t.id, 150, i))];
const pr = playerReply("Münch_with_a_long_name", bests, null, "u:abc", "/u/munch")!;
const p1 = check("player, public", pr, { maxDividers: 2 });
console.log(`  player list: ${p1.count} components, ${p1.textLen} characters`);
const pt = textOf(pr);
ok(/^## Münch\\_with\\_a\\_long\\_name's time trials\n-# Mario Kart 8 Deluxe · mushrooms\n\*\*60 of 96\*\* tracks at 150cc · \*\*12 of 96\*\* at 200cc · 6 records$/m.test(pt.split("\n").slice(0, 3).join("\n")), `player: totals at the top (${pt.split("\n").slice(0, 3).join(" | ")})`);
ok(/### 150cc\n/.test(pt) && /### 200cc\n/.test(pt) && /-# and 52 more/.test(pt) && /-# and 4 more/.test(pt), "player: a label per speed, more as small print");
eq(labels(pr), ["All times"], "player: All times");
const mineCard = playerReply("Kevo", bests, "mkworld", "i:xyz", null, { post: "ttpme:both", unlinked: true })!;
check("player, my times", mineCard);
ok(/^### Kevo's time trials\n-# Mario Kart World · mushrooms\n\*\*40 of 40\*\* tracks · 4 records/.test(textOf(mineCard)), "my times: ### and one speed");
eq(labels(mineCard), ["Post here", "All times", "Link to GameShuffle"], "my times: Post here first, links last");
ok(!/### 150cc/.test(textOf(mineCard)), "my times: no label for a game with one speed");
eq(playerReply("Nobody", [], null, "u:x", null), null, "player: nothing to show");

// ── Save to GameShuffle ──────────────────────────────────────────────────────────────────────
const list = saveListCard({ keep: 12, already: 4, unclear: 1, record: 1, gameLabel: "Mario Kart 8 Deluxe", category: "150cc, with mushrooms", draftId: UUID, checkUrl: "https://www.gameshuffle.co/time-trials/import?d=1", seeUrl: "https://www.gameshuffle.co/x", unlinked: true });
check("save list", list);
ok(/^### 12 new times to save\n-# From Quaxly · Mario Kart 8 Deluxe · 150cc, with mushrooms/.test(textOf(list)), "save list: the count is the title");
ok(/-# 4 more are already saved · 1 is faster than the world record and stays out/.test(textOf(list)), "save list: handled as small print");
eq(labels(list), ["Check them", "Link to GameShuffle", "Save 12 times"], "save list: Check them beside its sentence, Save at the bottom");
ok(idsOf(list)[0] === `ttq:${UUID}`, "save list: Save keeps its id");
const listClean = saveListCard({ keep: 2, already: 0, unclear: 0, record: 0, gameLabel: "Mario Kart World", category: "with mushrooms", draftId: UUID, checkUrl: "https://www.gameshuffle.co/i", seeUrl: "https://www.gameshuffle.co/x", unlinked: false });
check("save list, nothing else", listClean, { maxDividers: 1 });
eq(labels(listClean), ["Save 2 times", "Check them on GameShuffle"], "save list: Check them in the bottom row when nothing is unclear");
check("save list, nothing new", saveListCard({ keep: 0, already: 5, unclear: 0, record: 0, gameLabel: "Mario Kart World", category: "with mushrooms", draftId: null, checkUrl: "https://www.gameshuffle.co/i", seeUrl: "https://www.gameshuffle.co/x", unlinked: false }));
check("saved", savedCard({ saved: 12, already: 4, refused: 1, gameLabel: "Mario Kart 8 Deluxe", category: "150cc, with mushrooms", seeUrl: "https://www.gameshuffle.co/x", unlinked: true }));
check("saved, nothing", savedCard({ saved: 0, already: 3, refused: 0, gameLabel: "Mario Kart World", category: "with mushrooms", seeUrl: "https://www.gameshuffle.co/x", unlinked: false }));

// ── Messages to players ───────────────────────────────────────────────────────────────────────
const t = { game: "mk8dx" as const, track: daisy.id, cc: 150 as const, items: "shrooms" as const, vehicle: "any" as const, timeMs: 107512 };
eq(timeDetails(t), `${trackTitle(daisy)} · 150cc, mushrooms · 1:47.512`, "time details");
const ask = playerNoteCard({ title: "A reviewer asked you to update a time", details: timeDetails(t), note: "The clip ends before the finish line.\nAdd one that shows the last lap.", line: null, act: true, url: "https://www.gameshuffle.co/time-trials/x?time=1" });
check("dm, ask", ask, { accent: AMBER });
ok(/\n> The clip ends before the finish line\.\n> Add one that shows the last lap\./.test(textOf(ask)) || /^> The clip/m.test(textOf(ask)), "dm: the reviewer's words as a quote");
eq(labels(ask), ["Open your time"], "dm: Open your time, no bare link");
ok(!/https?:\/\//.test(textOf(ask)), "dm: no link in the text (no preview card)");
check("dm, fixed", playerNoteCard({ title: "A reviewer fixed your time", details: `${timeDetails(t, "now ")}, verified`, note: "The screen shows 1:47.521; the time said 1:47.512.", line: "They changed the time from 1:47.512 to 1:47.521. If that's wrong, reply from the time.", act: false, url: "https://www.gameshuffle.co/x" }), { accent: ICE });
check("dm, reminder without a note", playerNoteCard({ title: "Still waiting on your update", details: timeDetails(t), note: null, line: "A reviewer asked for an update. Update it or reply to the reviewer.", act: true, url: "https://www.gameshuffle.co/x" }), { accent: AMBER });

// ── One-line answers in place, and the forms ─────────────────────────────────────────────────
const onV2 = { message: { flags: V2 | EPHEMERAL } };
const onOld = { message: { flags: EPHEMERAL } };
check("line in place of a card", lineInPlace(onV2, "Removed. That time isn't on any board."), { v2: true });
const oldLine = lineInPlace(onOld, "Removed.");
ok(!((Number(oldLine.flags) || 0) & V2) && oldLine.content === "Removed.", "line in place of an older message stays plain");
eq(privately(lineMessage("x")).flags, V2 | EPHEMERAL, "privately: ephemeral and V2");
const form = clipForm(UUID);
ok((form.custom_id as string) === `ttclipm:${UUID}` && (form.components as C[])[0].type === 18, "clip form: labeled style, same id");
eq(modalParts({ data: { components: [{ type: 18, component: { type: 4, custom_id: "url", value: "https://youtu.be/x" } }] } }).get("url")?.value, "https://youtu.be/x", "clip form: reads the labeled style");
eq(modalParts({ data: { components: [{ type: 1, components: [{ type: 4, custom_id: "url", value: "https://youtu.be/y" }] }] } }).get("url")?.value, "https://youtu.be/y", "clip form: still reads the older style");
for (const f of [form]) for (const c of f.components as { component?: { custom_id?: string } }[]) ok(FORM_FIELDS.has(c.component?.custom_id ?? ""), "form field ids unchanged");

// ── The panel's buttons, through the real handler (no database on these paths) ──────────────
const user = { id: "990000000000000777", username: "kevo" };
async function press(customId: string, message: { flags: number } | null, extra: Record<string, unknown> = {}) {
  const res = await handleTtPanelComponent({ type: 3, application_id: "1", token: "t", guild_id: "g1", member: { user }, data: { custom_id: customId, ...extra }, ...(message ? { message } : {}) }, customId);
  return res.json() as Promise<{ type: number; data: Message }>;
}
(async () => {
  // Top ten from the panel itself (a public card): a new private card.
  let r = await press("ttp:top:mk8dx", { flags: V2 });
  eq([r.type, (Number(r.data.flags) & (V2 | EPHEMERAL))], [4, V2 | EPHEMERAL], "panel Top ten: a new private card");
  check("handler: picker", r.data);
  // On the private picker (a card), By cup changes it in place, as a card.
  r = await press("ttpv:cup:top:mk8dx", { flags: V2 | EPHEMERAL });
  eq([r.type, (Number(r.data.flags) & V2)], [7, V2], "By cup: in place, still a card");
  r = await press("ttpc:top:mk8dx", { flags: V2 | EPHEMERAL }, { values: ["2"] });
  eq([r.type, (Number(r.data.flags) & V2)], [7, V2], "a cup: in place, still a card");
  // A private picker from before the cards: a new private card instead (a message can't switch formats).
  r = await press("ttpv:track:top:mkworld", { flags: EPHEMERAL });
  eq([r.type, (Number(r.data.flags) & (V2 | EPHEMERAL))], [4, V2 | EPHEMERAL], "an older picker: a new private card");
  // Both games: Which game? as a card; picking a game on it changes it in place.
  r = await press("ttp:add:both", { flags: V2 });
  eq([r.type, labels(r.data)], [4, ["Mario Kart 8 Deluxe", "Mario Kart World"]], "Which game? from the panel");
  r = await press("ttp:top:mkworld", { flags: V2 | EPHEMERAL });
  eq([r.type, (Number(r.data.flags) & V2)], [7, V2], "a game on Which game?: in place, a card");
  // Add a time opens the form.
  r = await press("ttp:add:mk8dx", { flags: V2 });
  eq([r.type, (r.data as { custom_id?: string }).custom_id], [9, "ttpm:mk8dx"], "Add a time: the form");
  r = await press("ttpx:abc", { flags: V2 | EPHEMERAL });
  eq([r.type, (r.data as { custom_id?: string }).custom_id], [9, "ttpxm:abc"], "Change time: the form");

  // Every message built here is a card with no dash or old blue; and the old blue is gone from the source.
  for (const f of ["src/lib/discord/ttCards.ts", "src/lib/discord/ttPanel.ts", "src/lib/discord/commands/timeTrials.ts", "src/lib/discord/commands/ttPanelActions.ts", "src/lib/discord/commands/ttImport.ts", "src/lib/timeTrials/asks.ts"]) {
    const src = readFileSync(f, "utf8");
    ok(!/0x2b52d6/i.test(src), `${f}: no 0x2b52d6`);
    ok(!/embeds:\s*\[\s*\{/.test(src), `${f}: no embeds built`);
    ok(!/gameshuffle\.co\/time-trials" ?\}/.test(src) && !/Time trials · gameshuffle\.co/.test(src), `${f}: no site address footer`);
  }
  console.log(`\n${all.length} messages built.`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
