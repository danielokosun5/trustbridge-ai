# TrustBridge AI

A responsive agreement workspace for turning service requests into clear, reviewable drafts. This milestone does not implement PayPal checkout.

## Requirements

- Node.js 20.9 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Copy the example environment file and add an OpenAI API key:

```powershell
Copy-Item .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`. The key is used only by the server. `OPENAI_MODEL` is optional and defaults to `gpt-5.4-mini`.

Open [http://localhost:3000](http://localhost:3000). Create an agreement from `/dashboard/new`; the AI may ask clarification questions, then routes to an editable review page. Saving stores the agreement and timestamp in the workspace. View saved records at `/dashboard/agreements` and open their detail pages from there.

## Database setup

The app initializes its schema automatically on first database access. With no Turso URL configured, it uses a local libSQL/SQLite database at `data/trustbridge.db`. The file persists across server restarts and is ignored by Git.

For a deployment with durable storage, configure a Turso database and set both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the server environment. Leave them blank for local SQLite. Do not prefix any secret with `NEXT_PUBLIC_`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | For AI drafting | Server-side OpenAI API key. Without it, drafting returns a setup message and does not generate a fake draft. |
| `OPENAI_MODEL` | No | Model ID; defaults to `gpt-5.4-mini`. |
| `TURSO_DATABASE_URL` | No | Remote Turso/libSQL URL. Omit for local SQLite. |
| `TURSO_AUTH_TOKEN` | For remote Turso | Server-side database token. |

## Available commands

- `npm run dev` — start the local development server
- `npm run build` — create the production build
- `npm run start` — serve the production build
- `npm run lint` — check code with ESLint
- `npm run typecheck` — check TypeScript types
- `npm test` — validate agreement inputs, AI setup errors, and persistence across database restarts

Saved agreements are private to this application installation. There is no authentication or multi-user collaboration yet. AI drafts are not legal advice; both parties should review the terms. Drafting and saving do not sign an agreement or make a payment.
