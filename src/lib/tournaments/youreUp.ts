import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/env";
import { sendYoureUpEmail } from "@/lib/email/tournament";
import { listAttendees } from "@/lib/events/attendees";
import { deliver } from "@/lib/events/notify";
import { recipientsFor } from "@/lib/events/reminders";
import { currentBracketMatch, matchRoundLabel, type Bracket } from "./bracket";
import { currentHeatMainsRace, type HeatMains } from "./heatMains";
import { currentLobby, lobbyLabel, type GroupBracket } from "./groups";

/**
 * "You're up" (organizer toolkit C).
 *
 * Nothing in the app "calls" a match explicitly: the race being run is DERIVED
 * as the first bracket match, heat or lobby without a result. So a match is
 * called at the moment the previous result is saved, and this runs then. The
 * manage page pings it after every result write; the server recomputes who is
 * up from the database, so a client cannot name its own recipients.
 *
 * Each (entrant, race) pair is claimed in `event_reminders_sent` under the `up`
 * threshold, keyed `participantId:raceId`, so repeat pings, undo/redo and
 * concurrent organizers never alert the same person twice for the same race.
 *
 * Race-scoring formats (FFA points, round robin) are skipped: everyone races
 * every race there, so "you're up" would fire at the whole field every time.
 *
 * Channels: in-app for account holders, email only for guests (who have no
 * in-app alerts), SMS for everyone once Twilio is live and they opted in.
 */

interface CalledRace { id: string; label: string; drivers: string[] }

export function calledRace(t: { bracket: Bracket | null; heat_mains: HeatMains | null; group_bracket: GroupBracket | null }): CalledRace | null {
  if (t.heat_mains) {
    const r = currentHeatMainsRace(t.heat_mains);
    return r ? { id: r.id, label: r.label, drivers: r.drivers } : null;
  }
  if (t.bracket) {
    const m = currentBracketMatch(t.bracket);
    return m && m.a && m.b ? { id: m.id, label: matchRoundLabel(t.bracket, m), drivers: [m.a, m.b] } : null;
  }
  if (t.group_bracket) {
    const l = currentLobby(t.group_bracket);
    return l ? { id: l.id, label: lobbyLabel(t.group_bracket, l), drivers: l.entrants } : null;
  }
  return null;
}

export interface YoureUpResult { race: string | null; notified: number; skipped?: string }

export async function notifyYoureUp(tournamentId: string): Promise<YoureUpResult> {
  const svc = createServiceClient();
  const { data: row } = await svc
    .from("tournaments")
    .select("id, title, status, organizer_id, bracket, heat_mains, group_bracket")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!row) return { race: null, notified: 0, skipped: "not_found" };
  const t = row as {
    id: string; title: string; status: string; organizer_id: string;
    bracket: Bracket | null; heat_mains: HeatMains | null; group_bracket: GroupBracket | null;
  };
  // A bracket is often generated before the event starts; nobody is "up" then.
  if (t.status !== "in_progress") return { race: null, notified: 0, skipped: "not_in_progress" };

  const race = calledRace(t);
  if (!race || race.drivers.length === 0) return { race: null, notified: 0, skipped: "no_called_race" };

  const inRace = new Set(race.drivers);
  const targets = (await listAttendees("tournament", t.id)).filter((a) => inRace.has(a.id));
  if (!targets.length) return { race: race.label, notified: 0 };
  const recipients = await recipientsFor(targets);
  const href = `/tournament/${t.id}`;
  const url = `${getBaseUrl()}${href}`;

  let notified = 0;
  for (const a of targets) {
    const { error: claimErr } = await svc.from("event_reminders_sent").insert({
      event_type: "tournament", event_id: t.id, attendee_key: `${a.id}:${race.id}`, threshold: "up",
    });
    if (claimErr) continue; // already told about this race, or the migration is not applied yet
    const r = recipients.get(a.id)!;
    const res = await deliver(r, {
      inApp: {
        type: "tournament_youre_up",
        title: "You're up",
        message: `${race.label} in ${t.title} is being called now.`,
        link: href,
        data: { eventType: "tournament", eventId: t.id, raceId: race.id },
      },
      // Guests only: account holders already get the in-app alert, and email is
      // too slow to be the primary channel at a venue.
      email: r.userId
        ? undefined
        : (rr) => sendYoureUpEmail({ to: rr.email!, toName: rr.displayName ?? undefined, tournamentTitle: t.title, raceLabel: race.label, tournamentUrl: url }),
      sms: { body: `You're up: ${race.label} in ${t.title}. ${url}`, category: "event_reminders", billedUserId: t.organizer_id, eventType: "tournament", eventId: t.id },
    });
    if (res.inApp || res.email || res.sms === "sent") notified++;
  }
  return { race: race.label, notified };
}
