# 🍽️ Three Squares Web (Frontend)

React 19 + TypeScript frontend for the Three Squares ordering platform.

## Quick Start

```bash
cd web
npm install
npm run dev
```

## Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `VITE_API_BASE_URL` - Backend API URL (default: http://localhost:3000)
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk authentication key

## Development

- **Dev server:** `npm run dev` (port 5173)
- **Build:** `npm run build`
- **Preview:** `npm run preview` (port 4173)
- **Lint:** `npm run lint`
- **E2E tests:** `npm run test:e2e`

## Tech Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- React Router 7
- React Query (TanStack Query)
- Clerk (Authentication)
- Framer Motion (Animations)

## Brand Colors

```css
/* Three Squares palette */
--ts-blue: #4A7FB5;      /* Pacific Blue - Primary */
--ts-navy: #1E3A5F;      /* Navy - Primary Dark */
--ts-gold: #F5C518;      /* Golden Sun - Accent */
--ts-amber: #D4A030;     /* Amber - Warm accent */
--ts-text: #1A1A1A;      /* Text */
--ts-surface: #F0EDE8;   /* Surface */
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Route pages
├── layouts/        # Layout components
├── hooks/          # Custom React hooks
├── services/       # API services
├── store/          # Zustand stores
├── types/          # TypeScript types
└── utils/          # Utility functions
```

## Part of Three Squares Monorepo

This is the frontend portion of the Three Squares ordering platform, forked from Hafaloha V2.

- **Backend:** `../api/` (Rails 8 API)
- **Docs:** `../docs/` (PRD, menu data, brand guide)
