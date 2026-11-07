"use client";

/**
 * The visitor homepage's world tour (personalization picks 2026-11-05, 5A; Britton: the homepage is the landing spot
 * for anyone without an account, and a free account curates it). "What are you here for?" (six chips; the pick leads
 * the page with its world and stays in this browser, localStorage `gs-visitor-interest`, nothing sent), the worlds as
 * cards, "Free without an account, better with one", today's numbers and Support.
 */

import { useSyncExternalStore } from "react";
import { Button, Chip } from "@empac/cascadeds";
import { useRouter } from "next/navigation";
import {
  IconBroadcast, IconDice5, IconFlag, IconHeart, IconPokeball, IconSofa, IconTournament, type Icon,
} from "@tabler/icons-react";
import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { INTERESTS, type Interest } from "@/lib/interests/rules";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/home-you.css";

interface Door { title: string; bullets: string[]; cta: { label: string; href: string }; icon: Icon; tone: TileTone }

const KEY = "gs-visitor-interest";
const listeners = new Set<() => void>();
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/** The worlds, one per interest; Running events only shows when picked (its world is Host). */
function doors(seasonal: { label: string; href: string } | null): Record<Interest, Door> {
  return {
    daily: { title: "Play", icon: IconDice5, tone: "violet", bullets: ["Four daily games, a new puzzle at midnight", "Randomizers for 18 games", "A wheel, tier lists, truth or dare and more"], cta: { label: "Play today's games", href: "/daily" } },
    pokemon: { title: "Pokémon", icon: IconPokeball, tone: "red", bullets: ["The Daily Dex and the Daily Duel", "Trainer Road through every region", "A card game companion and deck lists"], cta: { label: "See Pokémon", href: "/pokemon-tcg" } },
    competitive: { title: "Compete", icon: IconFlag, tone: "blue", bullets: ["Time trials on every track", "Lounge stats and your MMR card", "Tournaments with random rounds"], cta: { label: "See Mario Kart", href: "/competitive-mario-kart" } },
    home: { title: "Game night at home", icon: IconSofa, tone: "magenta", bullets: ["Party games on everyone's phones, with the TV", "Trivia nights with ready-made rounds", seasonal ? seasonal.label : "A night planner for the games you own"], cta: { label: "Plan tonight", href: "/game-nights/tools" } },
    stream: { title: "Stream", icon: IconBroadcast, tone: "teal", bullets: ["Games your chat plays, on your overlay", "A Discord bot for your server", "Viewers who join from chat"], cta: { label: "See streaming", href: "/for-streamers" } },
    events: { title: "Run events", icon: IconTournament, tone: "orange", bullets: ["Tournaments in every format, guests welcome", "Weekly trivia leagues with standings", "Public game nights with RSVPs"], cta: { label: "See hosting", href: "/host-a-tournament" } },
  };
}

function DoorCard({ door, big = false }: { door: Door; big?: boolean }) {
  return (
    <article className={`visitor-door${big ? " visitor-door--big" : ""}`}>
      <IconTile icon={door.icon} tone={door.tone} />
      <h3>{door.title}</h3>
      <ul className="list-check">
        {door.bullets.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <ArrowLink href={door.cta.href}>{door.cta.label}</ArrowLink>
    </article>
  );
}

export function VisitorTour({ numbers, seasonal, supportOpen }: { numbers: string[]; seasonal: { label: string; href: string } | null; supportOpen: boolean }) {
  const router = useRouter();
  const raw = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => null,
  );
  const picked = INTERESTS.some((i) => i.id === raw) ? (raw as Interest) : null;
  const all = doors(seasonal);
  const pick = (id: Interest) => {
    const next = picked === id ? null : id;
    try { if (next) localStorage.setItem(KEY, next); else localStorage.removeItem(KEY); } catch { /* private mode */ }
    listeners.forEach((l) => l());
    if (next) track(EVENTS.welcomeDoorClicked, { door: `home-${next}` });
  };
  const worlds: Interest[] = ["daily", "pokemon", "competitive", "home", "stream"];
  const rest = worlds.filter((w) => w !== picked && !(picked === "events" && w === "home"));

  return (
    <div className="visitor-tour">
      <section className="visitor-pick" aria-labelledby="visitor-pick-title">
        <h2 id="visitor-pick-title">What are you here for?</h2>
        <div className="visitor-pick__chips" role="group" aria-labelledby="visitor-pick-title">
          {INTERESTS.map((i) => (
            <Chip key={i.id} label={i.label} clickable selected={picked === i.id} variant={picked === i.id ? "primary" : "default"} onClick={() => pick(i.id)} />
          ))}
        </div>
        <p className="visitor-pick__note">Picking one leads the page with it. It stays in this browser; nothing is sent.</p>
        {picked && <DoorCard door={all[picked]} big />}
      </section>

      <section className="visitor-worlds" aria-label="Everything on GameShuffle">
        {rest.map((w) => <DoorCard key={w} door={all[w]} />)}
      </section>

      <section className="visitor-account" aria-labelledby="visitor-account-title">
        <h2 id="visitor-account-title">Free without an account, better with one</h2>
        <div className="visitor-account__cols">
          <div>
            <h3>No account</h3>
            <ul className="list-check">
              <li>Every daily game, every randomizer, every free tool</li>
              <li>Party games on one device</li>
              <li>Any lounge player and any time trial board</li>
              <li>Tournaments as a guest, where the organizer allows it</li>
            </ul>
          </div>
          <div>
            <h3>Free account</h3>
            <ul className="list-check">
              <li>Your streaks on any device, and a place on the daily boards</li>
              <li>Party games on everyone&apos;s phones with the TV</li>
              <li>Your times on the boards, your lounge page, your MMR card</li>
              <li>Your cards, deck lists and Trainer Road stars</li>
              <li>Your setups, events and RSVPs in one place, and a home that follows what you play</li>
            </ul>
          </div>
        </div>
        <div><Button variant="primary" onClick={() => router.push("/signup")}>Make a free account</Button></div>
      </section>

      {numbers.length > 0 && (
        <ul className="visitor-numbers" aria-label="Today on GameShuffle">
          {numbers.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      {supportOpen && (
        <p className="home-you__plan home-you__plan--support">
          <IconHeart size={18} stroke={2} aria-hidden="true" />
          <span><strong>Support:</strong> GameShuffle is free to play. If it&apos;s part of your game nights, you can chip in from $3, and streamers get GS Pro.</span>
          <ArrowLink href="/support?from=home">Support GameShuffle</ArrowLink>
        </p>
      )}
      <h2 className="home-you__else">Everything else on GameShuffle</h2>
    </div>
  );
}
