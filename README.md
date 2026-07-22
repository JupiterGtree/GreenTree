# Green Tree Next Concept

Standalone Next.js UI concept for the Green Tree Web3 ecosystem (Version 2.0.0 open-market model).

This project is independent of the production Laravel/Vue website. It explores a new visual and product direction before any transfer into production.

## Stack

- Next.js (App Router)
- TypeScript (strict)
- Tailwind CSS
- Radix UI primitives
- Lucide icons
- Framer Motion
- Recharts

## Getting started

```bash
cd green-tree-next-concept
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev      # development server
npm run lint     # ESLint
npm run build    # production build
npm run start    # serve production build
```

## Environment variables

See `.env.example`. Important fields:

| Variable | Purpose |
|---|---|
| `SOLANA_RPC_URL` | Server-only Solana Mainnet RPC for token state, balances and transactions |
| `METEORA_POOL_API_URL` | Server-only official DAMM v2 pool endpoint |
| `JUPITER_API_BASE_URL` | Server-only Jupiter quote and swap API base |
| `JUPITER_API_KEY` | Optional server-only Jupiter credential |
| `NEXT_PUBLIC_DEX_URL` | Official DEX URL (disabled when empty) |
| `NEXT_PUBLIC_SOLSCAN_BASE_URL` | Explorer base URL |

## Production data behavior

- Token state and recent activity are verified through Solana Mainnet RPC.
- Spot market data comes from the confirmed Meteora DAMM v2 pool.
- Buy quotes and user-signed swap transactions come from Jupiter.
- Failed production sources render unavailable states; the application does not substitute plausible demo metrics.
- Mission pages remain explicitly example-only until verified admin-managed mission records are published.

## Routes

- `/` — Homepage
- `/market` — Market overview and buy widget
- `/transparency` — Transparency Center
- `/missions` — Mission directory
- `/missions/[slug]` — Mission detail
- `/ecosystem` — Future ecosystem modules
- `/roadmap` — Project roadmap
- `/docs` — Official document library
- `/token` — Token identity and allocation
- `/design-system` — Internal visual reference (not in navbar)
