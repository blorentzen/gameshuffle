/** What to tell someone when an /api/ai call doesn't work, by error code. */
export const AI_ERRORS: Record<string, string> = {
  pro_required: "AI tools are part of GS Pro.",
  allowance_used: "You've used this month's AI allowance. It refills as the 30-day window rolls on.",
  daily_used: "That's today's free tries. Come back tomorrow, or get more with GS Pro.",
  not_configured: "AI isn't switched on here yet.",
  rate_limited: "Lots of people are generating right now. Try again in a minute.",
  bad_request: "Give it a theme of at least a few letters.",
  not_found: "That isn't yours to recap, or it's gone.",
  not_ended: "Recaps open once it's over.",
  unauthenticated: "Sign in to use AI tools.",
};
