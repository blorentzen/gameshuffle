// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://cf8ccba54dcf736dd1e0d569392ecffb@o4510795773771776.ingest.us.sentry.io/4511117481476096",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Noise filter: Supabase Auth's Web Locks helper emits a benign AbortError
  // when a user has multiple tabs open and one steals the auth lock from
  // another. Not actionable; suppress to keep alert signal clean.
  ignoreErrors: [
    "Lock broken by another request with the 'steal' option",
    /AbortError.*steal/,
    // In-app browser (Facebook, etc.) Android WebView teardown noise: the host
    // app's injected perf logger posts to a native Java object that's already
    // been destroyed when the WebView closes. Not our code, not actionable.
    "Java object is gone",
    /navigation_performance_logger/,
  ],

  // Drop any event whose stack originates in an injected in-app-browser script
  // (they run from app:// origins, not ours).
  denyUrls: [/^app:\/\//],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;