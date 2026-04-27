# Staff Scenarios

Internal QA tool at `/staff/scenarios` for visual evaluation of UI states.
Renders product surfaces against fixture data — no DB calls, no API
calls, no real session/connection state.

Per `gs-dev-scenarios-spec.md`. Gated to `users.role = 'staff'` (real
role, not impersonated).

---

## Adding a new scenario

Three steps. The whole pattern fits in one PR per scenario.

### 1. Pick a category and view

Categories live in `registry.ts` as `connections | sessions | account | errors | modules`. Each category has a corresponding view in `views/`:

| Category | View | Renders |
|---|---|---|
| `connections` | `ConnectionsView` | Twitch / Discord / Stripe billing cards |
| `sessions` | `HubView` | Hub state previews (Phase 4 placeholder until the real Hub ships) |
| `account` | `AccountView` | Profile + plan + trial banner |
| `errors` | `ErrorView` | Empty / retry / reconnect surfaces |
| `modules` | `ModulesView` | Picks/bans config + mid-flow |

If your scenario doesn't fit an existing view, build a new one in
`views/<NewView>.tsx` and add a matching fixture-kind to `types.ts`'s
`ScenarioFixture` union.

### 2. Write the fixture

In `registry.ts`, append a new entry to the `SCENARIOS` array:

```typescript
{
  id: "twitch-rate-limited",
  name: "Twitch — rate limited",
  category: "connections",
  description: "Bot got rate-limited; banner explains and offers retry.",
  validForTiers: ["pro", "pro_plus"],
  suggestedTier: "pro",
  fixture: {
    kind: "connection",
    user: proUser,
    twitch: {
      ...healthyTwitch,
      // override fields you want to test
    },
    warningOverride: "rate_limited",  // add to ConnectionFixture if new
  },
  view: ConnectionsView,
}
```

Reuse the helper objects at the top of `registry.ts` (`proUser`,
`freeUser`, `healthyTwitch`, `SAMPLE_PARTICIPANTS_4`, etc.) when you
can. Add new helpers there if a fixture pattern repeats across multiple
scenarios.

### 3. Run it

```bash
npm run dev
# open http://localhost:3000/staff/scenarios?id=twitch-rate-limited
```

If the scenario has `validForTiers` that doesn't include your current
impersonation tier, the page renders an inline warning and offers a
"Switch to {tier}" CTA. The floating impersonation control bottom-right
also lets you flip tiers manually.

---

## Constraints

- **No data fetching.** Fixtures are hardcoded TS objects. Network tab
  should show zero requests during scenario navigation.
- **No DB writes.** Buttons in the rendered scenarios are visually
  functional but not wired to real APIs (clicking "Connect Twitch" does
  nothing). If you need an interactive test, do it in dev with the staff
  account, not in scenarios.
- **Real components when possible.** The starter views recreate CDS
  chrome from scratch because the production components fetch their own
  data (Pattern A presentational refactor wasn't done in the foundation
  PR). When a Pattern A refactor lands for a real component, swap the
  view to import + render the real `<XxxView>` instead. See spec §2.4.
- **All 29 starter scenarios should render without errors.** If a fixture
  shape doesn't match a view's expected props, fix the fixture (or the
  view) — never let a scenario render a console error.

---

## Conventions

- Scenario IDs are kebab-case and stable. Direct links to
  `?id=<scenario-id>` should work indefinitely; rename only when
  necessary, and update any internal references.
- `validForTiers` is the contract: if the scenario only makes sense for
  one tier, list only that tier. The page warns + offers tier switching
  for incompatible viewing states.
- `suggestedTier` is optional but recommended — defaults to the first
  tier in `validForTiers`. Pick the *most representative* tier the
  scenario was designed for.
- Fixtures with `feature_flags.test_session: true` should set the
  `hub-test-session-active` pattern (see registry).

---

## Future work

- **Pattern A refactors** for `TwitchHubTab`, `PlansTab`,
  `IntegrationCard` family. Once split into presentational views, the
  scenarios renderer can mount the real components instead of the
  facsimile chrome in `views/`. Tracked in the gs-dev-scenarios-spec
  follow-up.
- **Hub component** ships in Phase 4 (`gs-pro-v1-architecture.md` §10).
  When it lands, replace `HubView`'s placeholder render with the real
  `<HubView />` import.
- **Discord adapter** ships in Phase 3. Add Discord-specific scenarios
  alongside that work.
- **Search/filter sidebar** when scenario count grows past ~50 (per
  spec §10).
