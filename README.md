# TrustBridge AI

TrustBridge AI helps freelancers, clients, independent service providers, and buyers turn informal service requests into clear, reviewable terms before a transaction begins. Buyers and providers often start with messages that leave scope, deliverables, deadlines, and acceptance expectations unclear. TrustBridge gives them a shared agreement workspace with owner-managed records, expiring counterparty review links, recorded responses, activity history, and a PayPal Sandbox payment integration. It is not escrow.

## Requirements

- Node.js 20.9 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Copy the example environment file if one does not already exist:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

If `.env.local` already exists, keep it and add the required variable names and values; do not replace the file.

Configure the owner login values in `.env.local` before opening the dashboard. Use a unique password of at least 12 characters and a cryptographically random session secret of at least 32 bytes. For example, generate a secret locally with Node and store it directly in `.env.local` (do not put it in source control):

```powershell
node -e "require('node:fs').appendFileSync('.env.local', '\nTRUSTBRIDGE_SESSION_SECRET=' + require('node:crypto').randomBytes(32).toString('base64url') + '\n')"
```

Add `TRUSTBRIDGE_OWNER_USERNAME` and `TRUSTBRIDGE_OWNER_PASSWORD` to the same file. Then add `OPENAI_API_KEY` if you want AI drafting, and PayPal sandbox credentials if you want checkout. All secrets are used only by the server. `PAYPAL_CLIENT_ID` is shared with the official PayPal JavaScript SDK; the client secret is never sent to the browser. Set `PAYPAL_ENV=sandbox`; other modes are not supported. `OPENAI_MODEL` is optional and defaults to `gpt-5.4-mini`.

Open [http://localhost:3000](http://localhost:3000), then sign in with the configured owner credentials. Create an agreement from `/dashboard/new` in either of two ways:

- **Draft with AI** sends the validated request to the server-side OpenAI API. It requires a working `OPENAI_API_KEY` whose OpenAI account has available API credits. The AI can ask clarification questions before producing an editable review draft.
- **Save Draft** stores the validated details entered in the form without making an AI API request. The resulting agreement is clearly labelled as a manual draft; TrustBridge does not represent it as AI-generated.

Saving stores the agreement and timestamp in the workspace. View saved records at `/dashboard/agreements` and open their detail pages to see payment status, create a counterparty review link, and view activity.

### Current integration testing status

The latest local AI drafting attempts received HTTP 429 from OpenAI because the API account had no remaining credits. AI drafting therefore requires the account's available credits to be restored; manual drafting remains available without an OpenAI request.

## Owner access and counterparty review

The dashboard and private agreement and payment APIs require the single-workspace owner session. The signed session is checked against a hashed server-side session record, so logout revokes copied sessions; it expires after eight hours. Its cookie is HttpOnly, SameSite Strict, and Secure in production. Owner sign-in is limited to five attempts per source IP per 15-minute window using the configured database. The app fails closed if owner credentials or a 32-byte session secret are missing. Use HTTPS for production and ensure your hosting proxy overwrites `x-real-ip` or `x-forwarded-for` with a trusted client address.

From a saved agreement detail page, create a review link with an expiry from 1 to 30 days. The app stores only a SHA-256 hash of the random link token. The raw link is shown once, so copy it when created. Creating a new link revokes previous links for that agreement; the owner can also revoke active links. Anyone possessing a valid link can view the allowlisted agreement terms and record one acceptance or rejection without creating an account.

A recorded response means that someone possessing the link submitted it. TrustBridge does not verify the responder's identity or create a legal signature. Responses are bound to the terms digest stored when the link was created, and one link cannot record conflicting responses. Agreement acceptance is separate from PayPal payment status. Activity records link creation, the first link open, and the response; an open event does not prove the terms were read or understood.

## PayPal sandbox checkout

PayPal Sandbox order creation and the server-side approval/capture verification flow are implemented. However, successful end-to-end Sandbox buyer approval and payment capture have **not yet been confirmed** for this project. The steps below describe the intended test flow, not a verified successful payment.

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), open **Sandbox > Accounts** and create or use a sandbox business account and a separate personal (buyer) account.
2. Under **Apps & Credentials**, select **Sandbox**, create a REST app for the sandbox business account, and copy its client ID and secret into `.env.local` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Set `PAYPAL_ENV=sandbox` and restart the server.
3. Create and save an agreement whose currency is USD, EUR, GBP, CAD, or AUD. PayPal sandbox checkout is not enabled for NGN, although NGN agreements can still be saved.
4. Open the saved agreement detail page and select the PayPal button. The intended flow is to sign in to the PayPal popup with the separate Sandbox buyer account and approve the order.
5. After buyer approval, the server-side integration is designed to retrieve the order, check the saved agreement, amount, and currency, capture through the Sandbox Orders API, verify the capture, and only then record the payment status and PayPal identifiers. Do not treat order creation or browser approval alone as proof of payment.

Automated PayPal tests mock PayPal API calls; they verify application validation and payment-state handling but do not prove a successful real Sandbox checkout. Previous local browser tests have encountered PayPal Sandbox checkout errors before buyer approval/capture. A cancelled or failed checkout does not count as paid. Capture requests use a persisted idempotency key so a timeout can be retried safely. Sandbox payments do not move real money.

## Database setup

The app initializes its schema automatically on first database access. With no Turso URL configured, it uses a local libSQL/SQLite database at `data/trustbridge.db`. The file persists across server restarts and is ignored by Git.

For a deployment with durable storage, configure a Turso database and set both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the server environment. Leave them blank for local SQLite. Do not prefix any secret with `NEXT_PUBLIC_`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | For AI drafting | Server-side OpenAI API key. Without it, drafting returns a setup message and does not generate a fake draft. |
| `OPENAI_MODEL` | No | Model ID; defaults to `gpt-5.4-mini`. |
| `TRUSTBRIDGE_OWNER_USERNAME` | Yes | Username for the single-workspace owner login. Server-side only. |
| `TRUSTBRIDGE_OWNER_PASSWORD` | Yes | Unique owner password (at least 12 characters). Server-side only. |
| `TRUSTBRIDGE_SESSION_SECRET` | Yes | Random secret of at least 32 bytes used to sign expiring owner sessions. Server-side only. |
| `TURSO_DATABASE_URL` | No | Remote Turso/libSQL URL. Omit for local SQLite. |
| `TURSO_AUTH_TOKEN` | For remote Turso | Server-side database token. |
| `PAYPAL_CLIENT_ID` | For sandbox checkout | Sandbox REST app client ID; the public ID is also used to load PayPal's official JS SDK. |
| `PAYPAL_CLIENT_SECRET` | For sandbox checkout | Sandbox REST app secret. Server-side only. |
| `PAYPAL_ENV` | For sandbox checkout | Must be `sandbox`. Live mode is deliberately unsupported. |

## Available commands

- `npm run dev` — start the local development server
- `npm run build` — create the production build
- `npm run start` — serve the production build
- `npm run lint` — check code with ESLint
- `npm run typecheck` — check TypeScript types
- `npm test` — validate agreements, owner sessions, private access, share-link lifecycle, response integrity, activity history, and PayPal payment-state transitions

The workspace uses one environment-configured owner login, not individual accounts or multi-user roles. Public review links are bearer links and can be forwarded; they do not establish the link holder's identity. The agreement stores a seller display name, not an authenticated PayPal merchant account, so this milestone sends payments to the single sandbox business account connected to the configured REST app; it does not route funds to individual service providers. Multi-seller onboarding/payouts and identity binding require a later authenticated marketplace integration. AI drafts are not legal advice; both parties should review the terms. Payment does not guarantee delivery or determine dispute outcomes.
