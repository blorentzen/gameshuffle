/** What to tell someone when an /api/ai call doesn't work, by error code. */
export const AI_ERRORS: Record<string, string> = {
  pro_required: "AI tools are part of GS Pro.",
  allowance_used: "You've used your AI allowance. Each use comes back 30 days after you made it.",
  daily_used: "That's today's free tries. They reset at midnight Pacific time, or get more with GS Pro.",
  not_configured: "AI isn't switched on here yet.",
  rate_limited: "Lots of people are generating right now. Try again in a minute.",
  bad_request: "Give it a theme of at least a few letters.",
  not_found: "That isn't yours to recap, or it's gone.",
  not_ended: "Recaps open once it's over.",
  unauthenticated: "Make a free account (or sign in) to use AI tools.",
};
