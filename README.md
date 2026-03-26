# GameShuffle

Game night randomizer tools — built with [Next.js](https://nextjs.org) and [CascadeDS](https://github.com/blorentzen/cascadeds).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (Navbar, analytics, CDS styles)
│   ├── page.tsx                  # Homepage
│   ├── mario-kart-8-deluxe-randomizer/
│   ├── mario-kart-world-randomizer/
│   ├── contact-us/
│   └── (stream)/                 # Stream overlay pages (no nav/footer)
│       ├── stream/
│       └── stream-card/
├── components/
│   ├── layout/                   # SiteNavbar, EmpacBanner, VideoHero
│   ├── randomizer/               # PlayerCard, KartSlot, FilterGroup, TrackList, etc.
│   └── AppCard.tsx
├── hooks/                        # useKartRandomizer, useTrackRandomizer, useAnalytics
├── data/                         # Game data JSON + TypeScript types
├── lib/                          # Pure functions (randomizer logic, image paths)
└── styles/                       # Randomizer and stream CSS
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI Library**: CascadeDS (@empac/cascadeds)
- **Language**: TypeScript
- **Analytics**: Plausible + Google Analytics
- **Hosting**: Vercel

## Key Features

- Mario Kart 8 Deluxe kart and track randomizer (up to 12 players)
- Mario Kart World kart randomizer (up to 24 players)
- Character weight and drift type filters
- Track randomizer with no-duplicate and tour-only filters
- Stream overlay variants for live streaming
- Responsive design

## Image CDN

Game asset image paths are centralized through `src/lib/images.ts`. Update `IMAGE_BASE_PATH` to point to the CDN when migrating.
