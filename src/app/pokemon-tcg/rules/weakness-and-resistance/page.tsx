import type { Metadata } from "next";
import Link from "next/link";
import { RulesArticle, type Faq } from "@/components/tcg/rules/RulesArticle";
import { DamageCalculator } from "@/components/tcg/rules/DamageCalculator";
import { rulePage, ruleUrl } from "@/data/tcg-rules";
import { ruleMetadata } from "@/lib/tcg/ruleMeta";

const page = rulePage("weakness-and-resistance")!;

export const metadata: Metadata = ruleMetadata(page);

const faq: Faq[] = [
  { q: "How much does Weakness add in the Pokémon TCG?", a: "On current cards, Weakness doubles the damage (×2). Some older cards and Pokémon TCG Pocket use +20 instead. The card always says which." },
  { q: "How much does Resistance take off?", a: "On current cards, Resistance takes 30 off the damage (−30), and the damage can't go below 0. Some older cards use −20." },
  { q: "Do Weakness and Resistance apply to Benched Pokémon?", a: "No. They only apply to damage done to the opponent's Active Pokémon. An attack that also damages the Bench does its printed damage there." },
  { q: "Does Weakness apply to damage counters put on by an effect?", a: "No. When a card puts damage counters on a Pokémon (rather than doing damage), Weakness and Resistance don't change the number." },
  { q: "What order is damage worked out in?", a: "Start with the attack's damage, apply effects on the attacking Pokémon, then Weakness, then Resistance, then effects on the defending Pokémon. Then put that many tens on as damage counters." },
];

export default function WeaknessResistancePage() {
  return (
    <RulesArticle
      page={page}
      lede={<>Every Pokémon card shows a Weakness and sometimes a Resistance at the bottom. Weakness doubles damage from one type; Resistance takes 30 off from another. Check an attack with the calculator, or read on for the order damage is worked out in.</>}
      faq={faq}
    >
      <h2 id="calculator">Damage calculator</h2>
      <DamageCalculator />

      <h2 id="weakness">Weakness: ×2</h2>
      <p>If the attacking Pokémon&apos;s type matches the defender&apos;s Weakness, the damage is <strong>doubled</strong>. A Lightning attack for 120 against a Pokémon weak to Lightning does 240. Older cards and Pokémon TCG Pocket print <strong>+20</strong> instead; the card tells you which.</p>

      <h2 id="resistance">Resistance: −30</h2>
      <p>If the attacker&apos;s type matches the defender&apos;s Resistance, take <strong>30</strong> off the damage (some older cards say −20). Damage never drops below 0, so a 20 damage attack into Resistance does nothing.</p>

      <h2 id="order">The order damage is worked out in</h2>
      <ol>
        <li>Start with the attack&apos;s printed damage (and anything its text adds, like &ldquo;30 more for each Energy&rdquo;).</li>
        <li>Apply effects on the <strong>attacking</strong> Pokémon (a Tool or Supporter that adds damage).</li>
        <li>Apply <strong>Weakness</strong>.</li>
        <li>Apply <strong>Resistance</strong>.</li>
        <li>Apply effects on the <strong>defending</strong> Pokémon (cards that reduce damage taken).</li>
      </ol>
      <p>Then put that many tens on as <Link href={ruleUrl("damage-counters")}>damage counters</Link>. If the damage reaches the defender&apos;s HP, it&apos;s Knocked Out.</p>

      <h2 id="active-only">Only against the Active Pokémon</h2>
      <p>Weakness and Resistance only count for damage done to the opponent&apos;s <strong>Active</strong> Pokémon. Attacks that hit the Bench, and effects that put damage counters on (like Poison), ignore them.</p>

      <h2 id="companion">Let the companion do the maths</h2>
      <p>In the <Link href="/pokemon-tcg-companion">GameShuffle TCG Companion</Link>, tap Attack and pick one of your Active Pokémon&apos;s real attacks: it reads both cards, applies Weakness and Resistance in this order, lets you add card effects, and says when the attack Knocks Out the defender.</p>
    </RulesArticle>
  );
}
