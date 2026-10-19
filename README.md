# TrustBridge AI

A responsive frontend foundation for clear service agreements and PayPal-connected payment workflows.

## Requirements

- Node.js 20.9 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The landing page links to the dashboard at `/dashboard`; the dashboard's “New agreement” action opens an editable, unsaved preview at `/dashboard/new`.

## Available commands

- `npm run dev` — start the local development server
- `npm run build` — create the production build
- `npm run start` — serve the production build
- `npm run lint` — check code with ESLint
- `npm run typecheck` — check TypeScript types

This milestone is a frontend prototype. It has no backend, user accounts, saved transactions, or active payment integration. Agreement previews remain in memory and are not sent or charged.
