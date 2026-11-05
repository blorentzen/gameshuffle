// Tests for reading vehicle parts off time trial screenshots (src/lib/timeTrials/parts.ts): npx tsx scripts/test-tt-parts.ts
import { boardForBody, partsFor, partsText } from "../src/lib/timeTrials/parts";

let pass = 0, fail = 0;
const eq = (got: unknown, want: unknown, what: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// The ghost data screen in the sample: Yoshi Bike, Azure Roller, Paper Glider.
const yoshi = partsFor("mk8dx", { vehicle: "Yoshi Bike", wheels: "Azure Roller", glider: "Paper Glider" });
eq(yoshi, { body: "Yoshi Bike", wheels: "Azure Roller", glider: "Paper Glider" }, "the sample's combo");
eq(partsText(yoshi!), "Yoshi Bike · Azure Roller · Paper Glider", "the combo as text");
eq(partsFor("mk8dx", { vehicle: "yoshi  bike", wheels: "AZURE ROLLER", glider: null }), { body: "Yoshi Bike", wheels: "Azure Roller", glider: null }, "case and spacing don't matter");
eq(partsFor("mk8dx", { vehicle: "Hoverboard", wheels: "Azure Roller" }), null, "a body we don't know keeps nothing");
eq(partsFor("mk8dx", { vehicle: "Standard Kart", wheels: "Made Up Wheels", glider: "Paper Glider" })?.wheels, null, "unknown wheels are left out, the rest kept");
eq(partsFor("mk8dx", { vehicle: null }), null, "no body named");
eq(partsFor("mk8dx", { vehicle: "Pipe Frame", wheels: "Gold Tires", glider: "Gold Glider" }), { body: "Pipe Frame", wheels: "Gold Tires", glider: "Gold Glider" }, "the game's full names for parts our data shortens");
eq(partsFor("mk8dx", { vehicle: "Pipe Frame", wheels: "Leaf", glider: "Paper" })?.glider, "Paper Glider", "a short name still matches, kept as the game writes it");

// Boards.
for (const b of ["Comet", "Sport Bike", "Jet Bike", "Yoshi Bike", "Master Cycle"]) eq(boardForBody("mk8dx", b), "inside_drift", `${b} is inside drift`);
eq(boardForBody("mk8dx", "Teddy Buggy"), "teddy", "Teddy Buggy");
eq(boardForBody("mk8dx", "Biddybuggy"), "biddybuggy", "Biddybuggy");
eq(boardForBody("mk8dx", "Mr. Scooty"), "scooty", "Mr. Scooty");
eq(boardForBody("mk8dx", "Standard Bike"), "any", "an outward bike has no board of its own");
eq(boardForBody("mk8dx", "Master Cycle Zero"), boardForBody("mk8dx", "Master Cycle Zero"), "Master Cycle Zero reads as itself, not Master Cycle");
eq(partsFor("mk8dx", { vehicle: "Master Cycle Zero" })?.body, "Master Cycle Zero", "Master Cycle Zero isn't shortened to Master Cycle");

// Mario Kart World: one body, no wheels or gliders; Swoop and the R.O.B.-HOG share a board.
eq(partsFor("mkworld", { vehicle: "R.O.B.-HOG", wheels: "Azure Roller" }), { body: "R.O.B.-HOG Famicom", wheels: null, glider: null }, "World's shortened R.O.B.-HOG name");
eq(boardForBody("mkworld", "R.O.B.-HOG Famicom"), "rob_hog", "R.O.B.-HOG board");
eq(boardForBody("mkworld", "Swoop"), "rob_hog", "Swoop shares it");
eq(boardForBody("mkworld", "Standard Kart"), "any", "a World kart without a board");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
