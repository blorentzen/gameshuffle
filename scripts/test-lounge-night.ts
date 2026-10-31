/**
 * The lounge night (picks 2026-10-20): tonight's goal, picking a night for "Share the night",
 * the share card's words and emblem, and the Monday report's summary and text.
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-lounge-night.ts
 */
import { cleanGoal, crossesGoal, goalActive, goalChat, goalProgress, goalText, type MmrGoal } from "../src/lib/mmr/goal";
import { stepsFrom, type MmrChange, type MmrSource } from "../src/lib/mmr/rules";
import { divisionLook } from "../src/lib/mmr/look";
import { emblemSvg } from "../src/lib/mmr/emblemSvg";
import { loungeShareText, nightFor } from "../src/lib/lounge/night";
import { weekEmail, weekGameLines, weekNotice, weekSummary, type WeekGame } from "../src/lib/lounge/weekly";
import { challengeTitle, loungeBest, loungeHeadline, loungeSub, loungeWhen, partLine, partTitle, shareAlt, shareTitle, type LoungePart, type ShareData } from "../src/lib/share/types";
import { mmrLine } from "../src/lib/twitch/commands/mmr";

let pass = 0, fail = 0;
const ok = (cond: unknown, label: string) => { if (cond) pass++; else { fail++; console.error("FAIL", label); } };
const eq = (a: unknown, b: unknown, label: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const noDash = (s: string, label: string) => ok(!/[–—]/.test(s), `${label} has no en or em dash: ${s}`);

// ── Goal numbers ──
eq(cleanGoal("15,500"), 15500, "commas are fine");
eq(cleanGoal(" 15 500 "), 15500, "spaces are fine");
eq(cleanGoal(15499.6), 15500, "rounded to a whole number");
eq(cleanGoal(0), null, "zero refused");
eq(cleanGoal(100000), null, "over 99,999 refused");
eq(cleanGoal("abc"), null, "words refused");
eq(cleanGoal(null), null, "null refused");

// ── Which night a goal belongs to (6am to 6am Pacific; PDT = UTC-7 in October) ──
const g = (setAt: string, keep = false): MmrGoal => ({ mmr: 15500, game: "mkworld12p", setAt, keep });
const at = (iso: string) => Date.parse(iso);
// Set at 7pm Pacific on Oct 20 (02:00Z Oct 21).
ok(goalActive(g("2026-10-21T02:00:00Z"), at("2026-10-21T04:00:00Z")), "same evening counts");
ok(goalActive(g("2026-10-21T02:00:00Z"), at("2026-10-21T08:00:00Z")), "1am the same night still counts");
ok(!goalActive(g("2026-10-21T02:00:00Z"), at("2026-10-21T14:00:00Z")), "7am the next day: cleared");
ok(!goalActive(g("2026-10-21T02:00:00Z"), at("2026-10-22T02:00:00Z")), "the next evening: cleared");
ok(goalActive(g("2026-10-21T02:00:00Z", true), at("2026-10-25T02:00:00Z")), "a kept goal stays");
ok(goalActive(g("2026-10-21T02:00:00Z"), at("2026-10-21T14:00:00Z"), { live: true, since: "2026-10-21T01:00:00Z" }), "a stream past 6am keeps a goal set during it");
ok(!goalActive(g("2026-10-21T02:00:00Z"), at("2026-10-22T03:00:00Z"), { live: true, since: "2026-10-22T01:00:00Z" }), "a new stream the next night doesn't bring yesterday's goal back");
ok(!goalActive(null), "no goal");

// ── Progress ──
const p1 = goalProgress(15500, 15316, 15100);
eq([p1.toGo, p1.reached, Math.round(p1.pct * 100)], [184, false, 54], "184 to go, 54% of the way from tonight's start");
eq(goalText(p1), "184 to 15,500", "card line");
eq(goalChat(p1), "goal 15,500, 184 to go", "chat line");
const p2 = goalProgress(15500, 15540, 15100);
eq([p2.toGo, p2.reached, p2.pct], [0, true, 1], "reached");
eq(goalText(p2), "Goal 15,500 reached", "reached line");
eq(goalChat(p2), "goal 15,500 reached", "reached chat");
eq(goalProgress(15000, 14900, 15200).pct, 0, "a goal under tonight's start fills from nothing");
eq(goalProgress(15500, null, null), { goal: 15500, toGo: 15500, reached: false, pct: 0 }, "no number yet");
ok(crossesGoal(15460, 15520, 15500), "an event crossing the goal");
ok(crossesGoal(15460, 15500, 15500), "landing exactly on it counts");
ok(!crossesGoal(15520, 15560, 15500), "already past it: no second moment");
ok(!crossesGoal(15460, 15480, 15500), "short of it");
ok(!crossesGoal(15460, 15520, null), "no goal");

// ── !mmr with a goal ──
const ch = (id: number, mmr: number, delta: number, iso: string, reason = "Table", place: number | null = null): MmrChange => ({ id, mmr, delta, at: iso, reason, place, score: null, tier: null });
const steps = stepsFrom({ Iron: 0, Diamond: 12500, Master: 14000, Grandmaster: 15000 }, "mkworld12p");
const src: MmrSource = {
  name: "Kevo", country: "US", game: "mkworld12p", mmr: 15316, maxMmr: 15400, division: "Grandmaster", worldRank: 48, steps,
  changes: [ch(5, 15316, 66, "2026-10-21T03:30:00Z", "Table", 2), ch(4, 15250, 150, "2026-10-21T03:00:00Z", "Table", 1), ch(3, 15100, -40, "2026-10-20T03:00:00Z"), ch(2, 15140, 40, "2026-10-20T02:00:00Z"), ch(1, 15100, 0, "2026-09-01T00:00:00Z", "Placement")],
  since: "2026-10-21T02:00:00Z", avatar: null,
};
const line = mmrLine(src, { goal: 15500 });
ok(line.includes("goal 15,500, 184 to go"), `!mmr adds the goal: ${line}`);
ok(!mmrLine(src).includes("goal"), "no goal, no goal words");

// ── Picking a night ──
const nightSrc = { changes: src.changes, steps, mmr: src.mmr, division: src.division };
const latest = nightFor(nightSrc);
eq(latest?.day, "2026-10-20", "the latest night is Oct 20 (events at 8pm Pacific)");
eq([latest?.recap.events, latest?.recap.wins, latest?.recap.losses, latest?.recap.net], [2, 2, 0, 216], "the latest night's record and change");
const earlier = nightFor(nightSrc, "2026-10-19");
eq([earlier?.recap.events, earlier?.recap.net, earlier?.recap.mmr], [2, 0, 15100], "an earlier night ends where it ended");
eq(nightFor(nightSrc, "2026-10-01"), null, "a night with no events");
eq(nightFor({ ...nightSrc, changes: [ch(1, 15100, 0, "2026-09-01T00:00:00Z", "Placement")] }), null, "placement only: nothing to share");
const climb = nightFor({ changes: [ch(3, 14060, 80, "2026-10-21T04:00:00Z", "Table", 1), ch(2, 13980, 60, "2026-10-21T03:00:00Z", "Table", 2), ch(1, 13920, 0, "2026-09-01T00:00:00Z", "Placement")], steps, mmr: 14060, division: "Master" });
eq(climb?.recap.newDivisions, ["Master"], "a night into Master");

// ── The share card's words ──
const part: LoungePart = {
  kind: "lounge", game: "mkworld12p", gameLabel: "MK World 12P", name: "Kevo", night: "2026-10-20", events: 6, wins: 5, losses: 1, net: 180,
  mmr: 15316, division: "Grandmaster", newDivision: "Master", best: { place: 1, delta: 62, format: "FFA" }, squares: ["w", "w", "l", "w", "p", "w"], page: "/lounge/Kevo",
};
eq(loungeWhen("2026-10-20", "2026-10-20"), "tonight", "tonight");
eq(loungeWhen("2026-10-19", "2026-10-20"), "last night", "last night");
eq(loungeWhen("2026-10-16", "2026-10-20"), "on Friday", "a weekday in the last week");
eq(loungeHeadline(part, "2026-10-20"), "Kevo went +180 tonight", "headline");
eq(loungeHeadline({ ...part, net: -64 }, "2026-10-21"), "Kevo went −64 last night", "a losing night yesterday");
eq(loungeHeadline({ ...part, net: 0 }, "2026-10-20"), "Kevo broke even tonight", "even");
eq(loungeSub(part), "5 wins, 1 loss in MK World 12P, into Master. Now 15,316, Grandmaster.", "sub line");
eq(loungeBest(part), "Best event: 1st, +62", "best event");
eq(loungeBest({ ...part, best: { place: 2, delta: 120, format: "2v2" } }), "Best event: 2nd (2v2), +120", "best team event");
eq(partTitle(part), "MK World 12P lounge", "kicker");
eq(partLine(part), "+180 · 5-1", "part line");
const data: ShareData = { v: 1, kind: "lounge", day: "2026-10-20", player: null, background: null, parts: [part], referral: null };
eq(shareTitle(data), "Kevo's lounge night: +180, 5-1", "share title");
ok(shareAlt(data).startsWith("Kevo's Mario Kart lounge night in MK World 12P: +180 MMR, 5 wins, 1 loss in 6 events. Into Master."), `alt: ${shareAlt(data)}`);
eq(challengeTitle(data, "2026-10-20"), "Kevo went +180 tonight.", "challenge title");
for (const s of [loungeSub(part), shareAlt(data), shareTitle(data)]) noDash(s, "share words");
const text = loungeShareText("Kevo", { net: 180, wins: 5, losses: 1, squares: ["w", "w", "l", "w", "p", "w"], newDivisions: ["Master"] }, "https://gs.test/r/abc1234");
eq(text, "Kevo's lounge night: +180, 5-1, into Master\n🟩🟩⬛🟩🟨🟩\nhttps://gs.test/r/abc1234", "share text with the dailies' squares");
ok(loungeShareText("Kevo", null, "u").includes("lounge night"), "share text without a recap");

// ── The emblem as a picture ──
for (const name of ["Placement", "Iron", "Silver", "Gold", "Platinum", "Ruby", "Diamond", "Master", "Grandmaster", "Platinum 2", "Diamond 1"]) {
  const svg = emblemSvg(divisionLook(name));
  ok(svg.startsWith("<svg") && svg.endsWith("</svg>") && svg.includes("linearGradient"), `${name} emblem is an SVG`);
  ok(!svg.includes("<text"), `${name} emblem draws no text`);
  ok(!/NaN|undefined/.test(svg), `${name} emblem has no NaN`);
}
ok((emblemSvg(divisionLook("Platinum 2")).match(/V85\.5/g) ?? []).length === 2, "level II as two stems");
ok((emblemSvg(divisionLook("Diamond 1")).match(/V85\.5/g) ?? []).length === 1, "level I as one stem");
ok(!emblemSvg(divisionLook("Grandmaster")).includes("V85.5"), "no level outside MK8DX");

// ── The week (Monday Oct 12 to Sunday Oct 18; nights run 6am to 6am Pacific) ──
const week: MmrChange[] = [
  ch(20, 15400, 30, "2026-10-19T15:00:00Z"), // Monday Oct 19 8am Pacific: next week
  ch(19, 15370, 50, "2026-10-19T11:00:00Z"), // Monday 4am Pacific: still Sunday's night, counts
  ch(18, 15320, -30, "2026-10-17T04:00:00Z"), // Friday night
  ch(17, 15350, 120, "2026-10-17T03:00:00Z"),
  ch(16, 15230, 90, "2026-10-17T02:00:00Z"),
  ch(15, 15140, -15, "2026-10-16T05:00:00Z", "Penalty"), // a penalty moves the number, not the record
  ch(14, 15155, 70, "2026-10-14T03:00:00Z"), // Tuesday night
  ch(13, 15085, -40, "2026-10-14T02:30:00Z"),
  ch(12, 15125, 140, "2026-10-14T02:00:00Z"), // crosses into Grandmaster at 15,000? starts 14,985
  ch(11, 14985, 30, "2026-10-12T12:00:00Z"), // Monday 5am Pacific: the previous week's Sunday night
  ch(10, 14955, 0, "2026-09-01T00:00:00Z", "Placement"),
];
const s = weekSummary(week, steps, "2026-10-12");
ok(s, "a week with events");
eq([s?.events, s?.wins, s?.losses], [7, 5, 2], "events and record (the penalty isn't an event; Monday 4am counts, Monday 5am a week earlier doesn't)");
eq(s?.net, 140 - 40 + 70 - 15 + 90 + 120 - 30 + 50, "net includes the penalty");
eq([s?.startMmr, s?.endMmr], [14985, 15370], "start and end numbers");
eq([s?.startDivision, s?.endDivision, s?.newDivisions], ["Master", "Grandmaster", ["Grandmaster"]], "division change");
eq(s?.nights, 3, "three nights");
eq(s?.bestNight, { day: "2026-10-16", net: 180, wins: 2, losses: 1 }, "Friday was the best night");
eq(weekSummary(week, steps, "2026-09-28"), null, "an empty week");

const wg: WeekGame = { ...s!, game: "mkworld12p", label: "MK World 12P", name: "Kevo", page: "/lounge/Kevo", rivals: [{ name: "Saber", events: 4, ahead: 3, behind: 1 }, { name: "Mikasa", events: 3, ahead: 1, behind: 2 }] };
const lines = weekGameLines(wg);
eq(lines[0], "+385 MMR: 5 wins and 2 losses in 7 events over 3 nights. Now 15,370.", "first line");
eq(lines[1], "Master to Grandmaster (reached Grandmaster).", "division line");
eq(lines[2], "Best night: Friday, +180 (2-1).", "best night line");
eq(lines[3], "Met most: Saber (4 events, ahead in 3), Mikasa (3 events, ahead in 1).", "rivals line");
const report = { weekOf: "2026-10-12", games: [wg] };
const notice = weekNotice(report);
eq(notice.title, "Your lounge week: +385", "notification title");
eq(notice.message, "MK World 12P +385, 5-2, into Grandmaster. Best night Friday (+180). Met Saber most (3-1).", "notification line");
const email = weekEmail(report, { name: "Nova", baseUrl: "https://www.gameshuffle.co" });
ok(email.text.startsWith("Hi Nova,\n\nYour Mario Kart lounge week, Oct 12 to Oct 18:"), `email opening: ${email.text.slice(0, 80)}`);
ok(email.text.includes("Your season: https://www.gameshuffle.co/lounge/Kevo"), "email links the season");
ok(email.text.includes("https://www.gameshuffle.co/mmr-card"), "email says how to stop it");
for (const t of [email.text, notice.message, ...lines]) noDash(t, "weekly words");
const two = weekNotice({ weekOf: "2026-10-12", games: [wg, { ...wg, game: "mk8dx", label: "MK8DX", net: -40, wins: 1, losses: 2, newDivisions: [] }] });
eq(two.title, "Your lounge week", "two games: a plain title");
ok(two.message.includes("MK8DX −40, 1-2"), `two games listed: ${two.message}`);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
