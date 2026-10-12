import type { Metadata } from "next";
import Link from "next/link";
import { RulesArticle, type Faq } from "@/components/tcg/rules/RulesArticle";
import { ConditionTag } from "@/components/companion/glyphs";
import { conditionLooks } from "@/lib/companion/looks";
import { pokemonMode } from "@/lib/companion/modes/pokemon";
import { rulePage, ruleUrl } from "@/data/tcg-rules";
import { ruleMetadata } from "@/lib/tcg/ruleMeta";

const page = rulePage("special-conditions")!;

export const metadata: Metadata = ruleMetadata(page);

const looks = Object.fromEntries(conditionLooks(pokemonMode).map((c) => [c.key, c]));
const tag = (key: string) => (looks[key] ? <ConditionTag look={looks[key]} size={30} decorative /> : null);

const faq: Faq[] = [
  { q: "Can a Pokémon have more than one Special Condition?", a: "Yes, with a limit. Asleep, Confused and Paralyzed are shown by turning the card, so a Pokémon can only have one of those at a time (a new one replaces the old). Poison and Burn use markers, so a Pokémon can be Poisoned, Burned and one of the other three all at once." },
  { q: "How do you get rid of a Special Condition?", a: "Move the Pokémon to the Bench (by retreating or a switching card) or evolve it, and every Special Condition goes away. Some cards also heal them. Asleep, Burned and Paralyzed can also wear off between turns." },
  { q: "Can a Benched Pokémon have a Special Condition?", a: "No. Only the Active Pokémon can be affected, and conditions come off as soon as a Pokémon goes to the Bench." },
  { q: "What order is the Pokémon Checkup done in?", a: "Between turns, in this order: Poison, Burn, Asleep, then Paralyzed. Check both players' Active Pokémon. If a Pokémon is Knocked Out during Checkup, the other player takes Prize cards as usual." },
  { q: "Can a Confused Pokémon retreat?", a: "Yes. Confusion only matters when it attacks. Asleep and Paralyzed Pokémon are the ones that can't retreat." },
];

export default function SpecialConditionsPage() {
  return (
    <RulesArticle
      page={page}
      lede={<>Special Conditions are what an attack can leave behind on the Active Pokémon: Poison, Burn, Asleep, Paralyzed and Confused. Here&apos;s what each does, how to mark it, and what happens to it between turns.</>}
      faq={faq}
    >
      <h2 id="at-a-glance">At a glance</h2>
      <ul className="rules-conds">
        <li><span>{tag("a")}</span><span><strong>Poison</strong>: 10 damage between every turn until it&apos;s removed.</span></li>
        <li><span>{tag("b")}</span><span><strong>Burn</strong>: 20 damage between turns, then flip a coin; heads cures it.</span></li>
        <li><span>{tag("asleep")}</span><span><strong>Asleep</strong>: can&apos;t attack or retreat; flip between turns, heads wakes it.</span></li>
        <li><span>{tag("paralyzed")}</span><span><strong>Paralyzed</strong>: can&apos;t attack or retreat; wears off at the end of its owner&apos;s next turn.</span></li>
        <li><span>{tag("confused")}</span><span><strong>Confused</strong>: flip before attacking; tails, the attack fails and it takes 30 damage.</span></li>
      </ul>
      <p>These are the icons the GameShuffle companion uses: squares for conditions, so they never look like Energy.</p>

      <h2 id="poison">Poison</h2>
      <p>Put a Poison marker on the Pokémon. Between every turn (yours and your opponent&apos;s), put <strong>1 damage counter</strong> (10 damage) on it. Some cards make Poison stronger, so check the attack. It stays until the Pokémon goes to the Bench, evolves, or is healed. Poison puts counters on, so <Link href={ruleUrl("weakness-and-resistance")}>Weakness and Resistance</Link> don&apos;t change it.</p>

      <h2 id="burn">Burn</h2>
      <p>Put a Burn marker on the Pokémon. Between turns, put <strong>2 damage counters</strong> (20 damage) on it, then its owner flips a coin: <strong>heads</strong>, the Burn is removed; tails, it stays for the next Checkup. Burn and Poison can be on the same Pokémon at once.</p>

      <h2 id="asleep">Asleep</h2>
      <p>Turn the card sideways (counterclockwise). An Asleep Pokémon <strong>can&apos;t attack or retreat</strong>. Between turns, its owner flips a coin: heads, it wakes up; tails, it stays Asleep. Moving it to the Bench with a card effect or evolving it wakes it too.</p>

      <h2 id="paralyzed">Paralyzed</h2>
      <p>Turn the card sideways (clockwise). A Paralyzed Pokémon <strong>can&apos;t attack or retreat</strong>. Paralysis wears off on its own during the Checkup after its owner&apos;s next turn, so in practice it costs that player one turn of attacking. The companion clears it at the end of its owner&apos;s turn.</p>

      <h2 id="confused">Confused</h2>
      <p>Turn the card upside down. A Confused Pokémon can still retreat. When it tries to attack, flip a coin first: heads, the attack goes ahead normally; <strong>tails</strong>, the attack does nothing and you put <strong>3 damage counters</strong> on your own Confused Pokémon.</p>

      <h2 id="checkup">Pokémon Checkup: between every turn</h2>
      <p>After each turn ends, before the next player starts, both Active Pokémon go through Checkup in this order: Poison, Burn, Asleep, Paralyzed. Apply the damage, flip the coins, and if a Pokémon is Knocked Out, the other player takes their Prize cards.</p>
      <p>The companion runs this for you: press <strong>End turn</strong> and it lists every condition on both players&apos; Pokémon, applies the damage and flips the coins. You can also keep track by hand with markers and card rotation; see <Link href={ruleUrl("how-to-play")}>how a turn goes</Link>.</p>
    </RulesArticle>
  );
}
