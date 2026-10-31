/** Writes supabase/fire-round-m2-starter-choices.sql from the starter wrong answers: npx tsx scripts/gen-fire-starter-choices.ts > supabase/fire-round-m2-starter-choices.sql */
import { PACK_WRONG } from "../src/data/originals/trivia-pack-wrong";
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const lines = Object.entries(PACK_WRONG).map(([prompt, wrong]) =>
  `update public.trivia_questions set wrong_answers = array[${wrong.map(q).join(", ")}], wrong_status = 'approved', updated_at = now()\n  where owner_user_id is null and kind = 'text' and prompt = ${q(prompt)} and (wrong_answers is null or wrong_status is distinct from 'approved');`);
console.log(`-- fire-round-m2-starter-choices: the starter pack's wrong answers for Fire Round's four choices,
-- written for every word-answer pack question (src/data/originals/trivia-pack-wrong.ts) and
-- approved straight away (Britton, 2026-10-19: "approve everything for now"). Run after
-- fire-round-m1.sql. Safe to re-run: it only touches pack questions not already approved.
-- Regenerate with: npx tsx scripts/gen-fire-starter-choices.ts > supabase/fire-round-m2-starter-choices.sql

begin;

${lines.join("\n")}

-- Any pack questions still waiting (drafted wrong answers), approved too.
update public.trivia_questions set wrong_status = 'approved', updated_at = now()
  where owner_user_id is null and wrong_status = 'draft' and wrong_answers is not null;

commit;`);
