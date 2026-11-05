/**
 * Made-when-ordered picks (src/lib/store/personal.ts): every option each kind offers round-trips through its
 * pick code, labels read right, bad picks are refused, and every pick has a print file once the manifest is
 * filled. Run: npx tsx scripts/test-merch-personal.ts
 */
import {
  DEFAULT_PICK, HEARTS, LEVELS, MEMBER_LINES, PATCH_NOTES, PLAYERS, SEATS, SINCE_FROM, fieldsFor, fileKey, isValidPick, lineKey,
  newestSince, pickFromValues, pickLabel, valuesFromPick, PERSONAL, type Ink, type PickKind,
} from "../src/lib/store/personal";

let pass = 0, fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

// A made-up file set: every pick for one ink, member years to 2026.
const files: Record<string, { id: number }> = {};
const add = (k: string) => { files[k] = { id: Object.keys(files).length + 1 }; };
for (const p of PLAYERS) for (const h of HEARTS) { add(`player-navy-p${p}-h${h}`); add(`cap-navy-p${p}-h${h}`); }
for (const p of PLAYERS) add(`joined-navy-p${p}`);
for (const l of ["none", "founding", "lifetime", "honorary", "good-standing"]) add(`member-navy-${l}`);
for (let y = 1980; y <= 2026; y++) add(`member-navy-since-${y}`);
for (const l of ["none", "junior", "training"]) add(`kidmember-navy-${l}`);
for (let y = 2010; y <= 2026; y++) add(`kidmember-navy-since-${y}`);
for (const n of LEVELS) add(`level-navy-${n}`);
for (const v of [1, 2, 3, 4, 5]) add(`patch-navy-v${v}`);
for (const s of SEATS) add(`seat-navy-p${s}`);

const kinds: PickKind[] = ["player", "cap", "joined", "member", "kidmember", "level", "patch", "seat"];
for (const kind of kinds) {
  const fields = fieldsFor(kind, "navy", files);
  // Walk every combination the pickers offer.
  const combos: Record<string, string>[] = [{}];
  for (const f of fields) {
    const next: Record<string, string>[] = [];
    for (const c of combos) {
      if (f.when && c[f.when.field] !== f.when.value) { next.push({ ...c, [f.id]: "" }); continue; }
      for (const o of f.options) next.push({ ...c, [f.id]: o.value });
    }
    combos.splice(0, combos.length, ...next);
  }
  let ok = 0;
  for (const c of combos) {
    const pick = pickFromValues(kind, c);
    const back = valuesFromPick(kind, pick);
    if (back && pickFromValues(kind, back) === pick && isValidPick(kind, "navy", pick, files)) ok++;
    else console.log(`FAIL ${kind} combo ${JSON.stringify(c)} → ${pick}`);
  }
  check(`${kind}: every combination round-trips and has a file`, ok, combos.length);
  check(`${kind}: default is valid`, isValidPick(kind, "navy", DEFAULT_PICK[kind], files), true);
}
check("player count", fieldsFor("player", "navy", files)[0].options.length * fieldsFor("player", "navy", files)[1].options.length, 36);
check("member choices", MEMBER_LINES.member.length - 1 + (2026 - 1980 + 1), 52);
check("kid choices", MEMBER_LINES.kidmember.length - 1 + (2026 - 2010 + 1), 20);
check("newest since", newestSince("member", "navy", files), 2026);
check("newest since with no files", newestSince("member", "white" as Ink, files), SINCE_FROM.member);
check("years newest first", fieldsFor("member", "navy", files)[1].options[0].value, "2026");

// Labels
check("label hearts", pickLabel("player", "p2-h4"), "Player 2 · 4 hearts");
check("label one heart", pickLabel("player", "p1-h1"), "Player 1 · 1 heart");
check("label out of hearts", pickLabel("cap", "p3-h0"), "Player 3 · out of hearts");
check("label joined", pickLabel("joined", "p3"), "Player 3 has joined");
check("label since", pickLabel("member", "since-1985"), "Member since 1985");
check("label line", pickLabel("member", "good-standing"), "Member in good standing");
check("label none", pickLabel("kidmember", "none"), "No line");
check("label level", pickLabel("level", "12"), "Level 12");
check("label patch", pickLabel("patch", "v4"), "Patch notes v4.0");
check("label seat", pickLabel("seat", "p6"), "Seat P6");

// Refusals
for (const [kind, pick] of [["player", "p7-h1"], ["player", "p1-h6"], ["player", "p1"], ["joined", "p0"], ["member", "since-1979"], ["member", "junior"],
  ["kidmember", "since-2009"], ["kidmember", "founding"], ["level", "17"], ["level", "0"], ["level", "07"], ["patch", "v6"], ["seat", "p7"], ["member", "since-2027"], ["seat", "<b>"]] as [PickKind, string][]) {
  check(`refuse ${kind} ${pick}`, isValidPick(kind, "navy", pick, files), false);
}
check("file key", fileKey("member", "cream", "since-1985"), "member-cream-since-1985");
check("line key", lineKey("m-1", "p2-h4"), "m-1|p2-h4");
check("line key plain", lineKey("m-1", null), "m-1");
check("patch lines", Object.keys(PATCH_NOTES).length, 5);

// The real manifest, once filled: every product's every pick has a file.
const prods = Object.entries(PERSONAL.products);
if (prods.length) {
  let missing = 0;
  for (const [, p] of prods) {
    const fields = fieldsFor(p.kind, p.ink);
    const first = fields[0];
    for (const o of first.options) {
      const v: Record<string, string> = { [first.id]: o.value };
      for (const f of fields.slice(1)) v[f.id] = f.options[0]?.value ?? "";
      const pick = pickFromValues(p.kind, v);
      if (!isValidPick(p.kind, p.ink, pick)) { missing++; console.log(`missing file ${fileKey(p.kind, p.ink, pick)}`); }
    }
  }
  check("manifest: products' picks have files", missing, 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
