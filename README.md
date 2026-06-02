# Pregnancy Calculator

A beautifully simple pregnancy calculator available as both a **web app** and a **native iOS/Android mobile app**. Calculate your estimated due date, track how far along you are, and follow your baby's development week by week with original illustrations.

## Features

- **Four ways to calculate your due date**
  - Last Menstrual Period (LMP)
  - Known Due Date
  - Conception Date
  - Ultrasound Measurement
- **Know where you are at a glance**
  - Estimated due date (EDD)
  - Current gestational age in weeks and days
  - Trimester and overall pregnancy progress
  - Key milestone dates throughout the pregnancy
- **Weekly fetal development** — rich, week-by-week details paired with original illustrations, with a tap-to-view full-screen image viewer
- **Instant results** — no account required
- Clean, calming rose/blush design

## Tech Stack

This is a **pnpm workspace monorepo** using TypeScript.

| Area        | Technology                 |
| ----------- | -------------------------- |
| Monorepo    | pnpm workspaces            |
| Language    | TypeScript 5.9, Node.js 24 |
| Web app     | React + Vite               |
| Mobile app  | Expo (React Native)        |
| API         | Express 5                  |
| Database    | PostgreSQL + Drizzle ORM   |
| Validation  | Zod                        |
| API codegen | Orval (from OpenAPI spec)  |

## Project Structure

```text
artifacts/
├── pregnancy-calculator/         # Web app (React + Vite)
├── pregnancy-calculator-mobile/  # Mobile app (Expo)
├── api-server/                   # Express API server
└── mockup-sandbox/               # Component preview sandbox

lib/
├── api-spec/        # OpenAPI spec + Orval codegen config
├── api-client-react/# Generated React Query hooks
├── api-zod/         # Generated Zod schemas
└── db/              # Drizzle ORM schema + DB connection

scripts/             # Utility scripts
```

## Getting Started

This project runs on [Replit](https://replit.com) using workflows. Each artifact has its own dev workflow.

```bash
# Install dependencies
pnpm install

# Typecheck the whole monorepo
pnpm run typecheck

# Build
pnpm run build
```

Individual apps are run via their workflows rather than at the workspace root.

```bash
# Web app
pnpm --filter @workspace/pregnancy-calculator run dev

# Mobile app (Expo)
pnpm --filter @workspace/pregnancy-calculator-mobile run dev

# API server
pnpm --filter @workspace/api-server run dev
```

## Disclaimer

This app is intended for informational purposes only and is not a substitute for professional medical advice. Always consult your healthcare provider regarding your pregnancy.
