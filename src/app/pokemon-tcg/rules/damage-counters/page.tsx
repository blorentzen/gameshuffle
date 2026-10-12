import type { Metadata } from "next";
import Link from "next/link";
import { RulesArticle, type Faq } from "@/components/tcg/rules/RulesArticle";
import { CounterTool } from "@/components/tcg/rules/CounterTool";
import { rulePage, ruleUrl } from "@/data/tcg-rules";
import { ruleMetadata } from "@/lib/tcg/ruleMeta";

const page = rulePage("damage-counters")!;

export const metadata: Metadata = ruleMetadata(page);

const faq: Faq[] = [
  { q: "What is a damage counter in the Pokémon TCG?", a: "A damage counter is a marker you put on a Pokémon to show the damage it has taken. Each counter is worth 10 damage, so a Pokémon with 7 counters on it has taken 70 damage." },
  { q: "When is a Pokémon Knocked Out?", a: "As soon as the damage on it is equal to or more than its HP. A 190 HP Pokémon with 19 damage counters (190 damage) is Knocked Out, and the other player takes Prize cards for it." },
  { q: "Can I use dice instead of damage counters?", a: "Many players do: a die showing the damage in tens, or one die per 10 counters. Use something both players can read at a glance, and check your event's rules before a tournament." },
  { q: "Is putting damage counters the same as doing damage?", a: "No. When a card says to put damage counters on a Pokémon, you just place them: Weakness, Resistance and effects that reduce damage don't change the number. Doing damage is what attacks do, and that does go through Weakness and Resistance." },
  { q: "What happens to damage counters when a Pokémon evolves or retreats?", a: "They stay. Damage counters move with the Pokémon when it evolves, retreats or is switched to the Bench. They only come off when something heals the Pokémon or it leaves play." },
];

export default function DamageCountersPage() {
  return (
    <RulesArticle
      page={page}
      lede={<>Damage counters show how much damage a Pokémon has taken. Each one is worth 10 damage, and when the damage reaches the Pokémon&apos;s HP, it&apos;s Knocked Out. Try the tray below, then use the same one in the free companion during a game.</>}
      faq={faq}
    >
      <h2 id="try-it">A counter tray you can use right now</h2>
      <CounterTool />

      <h2 id="what-they-are">What a damage counter is worth</h2>
      <p>Every damage counter is <strong>10 damage</strong>. An attack that does 60 damage means 6 counters on the Pokémon it hits. Counters only ever come in tens, so damage on a card is always a multiple of 10.</p>
      <p>Physical counters usually come in three sizes so you don&apos;t pile up dozens of small ones:</p>
      <ul>
        <li><strong>Small counters</strong> are 10 damage each.</li>
        <li><strong>Medium counters</strong> are 50 damage.</li>
        <li><strong>Large counters</strong> are 100 damage.</li>
      </ul>
      <p>So 180 damage is one large, one medium and three small counters. The tray above shows damage the same way.</p>

      <h2 id="knocked-out">When a Pokémon is Knocked Out</h2>
      <p>Compare the damage on a Pokémon to its HP (the number in the card&apos;s top corner). Once the damage is <strong>equal to or more than</strong> its HP, the Pokémon is Knocked Out: it goes to the discard pile with everything attached to it, and the other player takes Prize cards for it (one for most Pokémon, two for a Pokémon ex, three for a Mega Evolution Pokémon ex). See <Link href={ruleUrl("prize-cards")}>Prize cards</Link>.</p>
      <p>If the player who lost a Pokémon still has Pokémon on their Bench, they pick one to become the new Active Pokémon. If they have none, they lose the game.</p>

      <h2 id="putting-vs-doing">Putting damage counters vs doing damage</h2>
      <p>Card text uses two different phrases, and they work differently:</p>
      <ul>
        <li><strong>Doing damage</strong> (most attacks): the number goes through <Link href={ruleUrl("weakness-and-resistance")}>Weakness and Resistance</Link> and any effects that change damage, then you put that many tens on as counters.</li>
        <li><strong>Putting damage counters</strong> (some attacks, Abilities and conditions like <Link href={`${ruleUrl("special-conditions")}#poison`}>Poison</Link>): you place exactly that many counters. Weakness and Resistance don&apos;t apply.</li>
      </ul>

      <h2 id="moving-healing">Moving and healing</h2>
      <p>Healing removes counters: heal 30 damage means take off 3 counters (never more than are there). Some cards move counters from one Pokémon to another; the damage moves, nothing is added. Damage stays on a Pokémon when it evolves, retreats or is switched out.</p>

      <h2 id="tracking">Tracking damage without counters</h2>
      <p>Counters roll and get knocked around. Dice work if both players agree how to read them. A phone works too: the <Link href="/pokemon-tcg-companion">GameShuffle TCG Companion</Link> shows the damage on every Pokémon as counters, the HP left, and Knocks a Pokémon Out for you when the damage reaches its HP, with Undo if you tapped one too many.</p>
    </RulesArticle>
  );
}
