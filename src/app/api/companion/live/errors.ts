/**
 * Play together: plain-words errors and HTTP statuses for the live routes.
 */

import { NextResponse } from "next/server";
import type { LiveError } from "@/lib/companion/live";

const STATUS: Record<LiveError, number> = {
  missing: 503,
  not_found: 404,
  ended: 410,
  full: 409,
  not_in_game: 403,
  host_only: 403,
  bad_move: 400,
  bad_name: 400,
  busy: 409,
};

const MESSAGE: Record<LiveError, string> = {
  missing: "Play together isn't switched on yet.",
  not_found: "No game with that code. Check the letters and try again.",
  ended: "That game has ended.",
  full: "That game already has two players.",
  not_in_game: "This phone isn't in that game. Ask for the link again.",
  host_only: "Only the host can do that.",
  bad_move: "That move didn't go through.",
  bad_name: "Pick a name to show your opponent.",
  busy: "The other phone moved at the same moment. Try again.",
};

export function liveError(error: LiveError, message?: string) {
  return NextResponse.json({ error, message: message ?? MESSAGE[error] }, { status: STATUS[error] });
}
