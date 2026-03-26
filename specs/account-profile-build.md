# Account & Profile System — Implementation Plan

## Overview
User accounts are the foundation for saved configs, Pro tiers, Twitch connection, and monetization. This doc covers the full auth + profile build.

---

## 1. Auth Integration (Supabase Auth)

### Auth Methods
- **Email + password** (primary)
- **Magic link** (passwordless option)
- **Twitch OAuth** (Phase 4 — streamer connection, not primary auth)

### Routes
```
/login                → Login page (email/password + magic link)
/signup               → Signup page
/account              → Account dashboard (auth required)
/account/profile      → Profile settings + context profile editor
/account/configs      → Saved randomizer configurations
```

### Middleware
- `middleware.ts` at project root
- Protects `/account/*` routes — redirects to `/login` if unauthenticated
- Refreshes Supabase session on every request

### Components
- `AuthForm.tsx` — Shared login/signup form using CDS Input, Button
- `AuthProvider.tsx` — Client-side context providing current user + loading state
- `UserMenu.tsx` — Navbar dropdown showing avatar/name when logged in, Login button when not

### Auth Flow
1. User signs up → Supabase creates `auth.users` row → trigger creates `public.users` row
2. User logs in → session cookie set → middleware validates on subsequent requests
3. Guest → localStorage-based context profile → prompt to create account on first save attempt

---

## 2. Account Dashboard (`/account`)

### Layout
- Left sidebar: navigation (Overview, Profile, Saved Configs)
- Main content area

### Overview Panel
- Display name + avatar
- Account creation date
- Saved configs count
- Quick links to recently used randomizers
- Pro subscription status (free tier badge for now)

---

## 3. Context Profile (Progressive Collection)

### What Gets Collected
```typescript
interface ContextProfile {
  playerCount?: number;          // "How many usually play?"
  ageContext?: "family" | "21+"; // Content filtering
  consolesOwned?: string[];      // ["switch", "ps5", "pc", "retro"]
  gamesOwned?: string[];         // ["mario-kart-8", "smash-bros-ultimate"]
  hasEmulator?: boolean;
  preferredEmulators?: string[];
}
```

### Progressive Collection UX (never all at once)
1. **First randomizer use** → Prompt for player count (1 question, dismissible)
2. **First theme page visit** → Prompt for consoles owned + age context (collapsible panel)
3. **In account settings** → Full context profile editor
4. **Inline within tools** → "Customize recommendations" toggle per randomizer

### Storage
- **Logged in** → `users.context_profile` (jsonb) in Supabase
- **Guest** → localStorage with key `gs_context_profile`
- **On account creation** → merge localStorage profile into Supabase

### Implementation
- `lib/context-profile.ts` — `getContextProfile()`, `updateContextProfile()`
- `ContextPrompt.tsx` — Dismissible inline prompt component
- `ContextProfileEditor.tsx` — Full editor for account settings page

---

## 4. Saved Configs

### How It Works
- Any randomizer config can be saved with a custom name
- Uses `saved_configs` table (already in schema)
- Share token generates URL: `gameshuffle.co/s/[token]`
- Shared configs are read-only for non-owners

### Free vs Pro Limits
- **Free**: 3 saved configs max
- **Pro**: Unlimited

### Components
- `SaveConfigButton.tsx` — Appears on randomizer pages, prompts login if guest
- `SaveConfigModal.tsx` — Name input + save
- `ConfigList.tsx` — List view for `/account/configs`
- `SharedConfigView.tsx` — Read-only view at `/s/[token]`

### Routes
```
/account/configs      → User's saved configs list
/s/[token]            → Public shared config view (loads randomizer with saved settings)
```

---

## 5. Navbar Integration

### Logged Out
- "Log In" button in navbar actions slot

### Logged In
- User avatar/initials + dropdown menu
  - Account Dashboard
  - Saved Configs
  - Log Out

---

## 6. Implementation Order

1. Auth middleware + Supabase session handling
2. Login/signup pages with CDS form components
3. AuthProvider context + UserMenu in navbar
4. Account dashboard layout + overview
5. Context profile system (lib + localStorage + Supabase sync)
6. Profile settings page with context editor
7. Saved configs CRUD
8. Share token generation + public config view

---

## 7. Database Tables (Already Created)

All tables exist in Supabase with RLS policies:
- `users` — extends auth.users with display_name, context_profile, role
- `saved_configs` — randomizer_slug, config_name, config_data, share_token, is_public

Auto-create trigger on auth.users insert already populates `public.users`.
