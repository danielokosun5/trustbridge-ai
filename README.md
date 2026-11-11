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

Add `TRUSTBRIDGE_OWNER_USERNAME` and `TRUSTBRIDGE_OWNER_PASSWORD` to the same file. Then add `GEMINI_API_KEY` if you want AI drafting, and PayPal Sandbox credentials if you want checkout. All secrets are used only by the server. `PAYPAL_CLIENT_ID` is shared with the official PayPal JavaScript SDK; the client secret is never sent to the browser. Set `PAYPAL_ENV=sandbox`; other modes are not supported. `GEMINI_MODEL` is optional and defaults to `gemini-3.8-flash`.

Open [http://localhost:3000](http://localhost:3000), then sign in with the configured owner credentials. Create an agreement from `/dashboard/new` in either of two ways:

- **Draft with AI** sends the validated request to the server-side Google Gemini API. It requires a working `GEMINI_API_KEY`. The AI may ask one round of clarification questions when a deliverable, acceptance criterion, or other material term is missing or ambiguous. After you answer the questions and resubmit, it produces an editable review draft. The draft is not legal advice.
- **Save Draft** stores the validated details entered in the form without making an AI API request. The resulting agreement is clearly labelled as a manual draft; TrustBridge does not represent it as AI-generated.

Saving stores the agreement and timestamp in the workspace. View saved records at `/dashboard/agreements` and open their detail pages to see payment status, create a counterparty review link, and view activity.

### Current integration testing status

**AI drafting** has been tested end-to-end. The Gemini API returned clarification questions on an initial request with ambiguous terms, those questions were answered, and a second request produced a complete editable draft that was reviewed and saved as an agreement. AI drafting requires a valid `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey).

**PayPal Sandbox payments** have been confirmed end-to-end. A Sandbox buyer approved two separate PayPal orders (`29570037JV883305W` and `5DC05496S3630415B`), and in both cases TrustBridge successfully verified the server-side capture, recorded the payment, and displayed "Paid" and "Payment confirmed" on the agreement detail page. These are Sandbox transactions only — no real money was moved. See the PayPal Sandbox checkout section below for setup instructions.

## Owner access and counterparty review

The dashboard and private agreement and payment APIs require the single-workspace owner session. The signed session is checked against a hashed server-side session record, so logout revokes copied sessions; it expires after eight hours. Its cookie is HttpOnly, SameSite Strict, and Secure in production. Owner sign-in is limited to five attempts per source IP per 15-minute window using the configured database. The app fails closed if owner credentials or a 32-byte session secret are missing. Use HTTPS for production and ensure your hosting proxy overwrites `x-real-ip` or `x-forwarded-for` with a trusted client address.

From a saved agreement detail page, create a review link with an expiry from 1 to 30 days. The app stores only a SHA-256 hash of the random link token. The raw link is shown once, so copy it when created. Creating a new link revokes previous links for that agreement; the owner can also revoke active links. Anyone possessing a valid link can view the allowlisted agreement terms and record one acceptance or rejection without creating an account.

A recorded response means that someone possessing the link submitted it. TrustBridge does not verify the responder's identity and does not create a legally binding electronic signature. Responses are bound to the terms digest stored when the link was created, and one link cannot record conflicting responses. Agreement acceptance is separate from PayPal payment status. Activity records link creation, the first link open, and the response; an open event does not prove the terms were read or understood.

## PayPal Sandbox checkout

Successful end-to-end Sandbox buyer approval and payment capture have been confirmed. The steps below describe the tested flow.

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), open **Sandbox > Accounts** and create or use a Sandbox business account and a separate personal (buyer) account.
2. Under **Apps & Credentials**, select **Sandbox**, create a REST app for the Sandbox business account, and copy its client ID and secret into `.env.local` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Set `PAYPAL_ENV=sandbox` and restart the server.
3. Create and save an agreement whose currency is USD, EUR, GBP, CAD, or AUD. PayPal Sandbox checkout is not enabled for NGN, although NGN agreements can still be saved.
4. Open the saved agreement detail page and select the PayPal button. Sign in to the PayPal popup with the Sandbox buyer account and approve the order.
5. After buyer approval, the server retrieves the order, checks the saved agreement ID, amount, and currency, captures through the Sandbox Orders API, verifies the capture response, and only then records the payment status and PayPal identifiers. The agreement detail page then shows "Paid" and "Payment confirmed".

Do not treat order creation or browser approval alone as proof of payment; the server-side capture and verification step is required. Capture requests use a persisted idempotency key so a timeout can be retried safely. Sandbox payments do not move real money. Automated PayPal tests mock PayPal API calls and verify application validation and payment-state handling.

## Database setup

The app initializes its schema automatically on first database access. With no Turso URL configured, it uses a local libSQL/SQLite database at `data/trustbridge.db`. The file persists across server restarts and is ignored by Git.

For a deployment with durable storage, configure a Turso database and set both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the server environment. Leave them blank for local SQLite. Do not prefix any secret with `NEXT_PUBLIC_`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | For AI drafting | Server-side Google Gemini API key. Without it, drafting returns a setup message and does not generate a fake draft. Obtain a key from [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | No | Gemini model ID; defaults to `gemini-3.8-flash`. |
| `TRUSTBRIDGE_OWNER_USERNAME` | Yes | Username for the single-workspace owner login. Server-side only. |
| `TRUSTBRIDGE_OWNER_PASSWORD` | Yes | Unique owner password (at least 12 characters). Server-side only. |
| `TRUSTBRIDGE_SESSION_SECRET` | Yes | Random secret of at least 32 bytes used to sign expiring owner sessions. Server-side only. |
| `TURSO_DATABASE_URL` | No | Remote Turso/libSQL URL. Omit for local SQLite. |
| `TURSO_AUTH_TOKEN` | For remote Turso | Server-side database token. |
| `PAYPAL_CLIENT_ID` | For Sandbox checkout | Sandbox REST app client ID; the public ID is also used to load PayPal's official JS SDK. |
| `PAYPAL_CLIENT_SECRET` | For Sandbox checkout | Sandbox REST app secret. Server-side only. |
| `PAYPAL_ENV` | For Sandbox checkout | Must be `sandbox`. Live mode is deliberately unsupported. |

## Hackathon Judge Setup

Each judge runs their own isolated local instance. You will not access the developer's personal database or owner account — you configure your own credentials and start fresh.

### 1. Clone the repository

```bash
git clone https://github.com/danielokosun5/trustbridge-ai.git
cd trustbridge-ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your `.env.local`

```powershell
Copy-Item .env.example .env.local
```

Then open `.env.local` and fill in the values described below. Do not commit this file; it is already in `.gitignore`.

### 4. Set your owner credentials

Choose your own username and a password of at least 12 characters:

```
TRUSTBRIDGE_OWNER_USERNAME=your-chosen-username
TRUSTBRIDGE_OWNER_PASSWORD=your-chosen-password
```

Generate a random session secret and append it:

```powershell
node -e "require('node:fs').appendFileSync('.env.local', '\nTRUSTBRIDGE_SESSION_SECRET=' + require('node:crypto').randomBytes(32).toString('base64url') + '\n')"
```

### 5. Configure AI drafting (optional)

Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey) and add it:

```
GEMINI_API_KEY=your-gemini-api-key
```

`GEMINI_MODEL` is optional. Leave it out to use the default (`gemini-3.8-flash`). Without a key, the app still works — AI drafting returns a configuration message and the manual Save Draft path remains fully available.

### 6. Configure PayPal Sandbox (optional)

If you want to test the payment flow:

1. Create a free account at [developer.paypal.com](https://developer.paypal.com/).
2. Under **Sandbox > Apps & Credentials**, create a REST app and copy the client ID and secret.
3. Add them to `.env.local`:

```
PAYPAL_CLIENT_ID=your-sandbox-client-id
PAYPAL_CLIENT_SECRET=your-sandbox-client-secret
PAYPAL_ENV=sandbox
```

Without these, the app still works — the PayPal button on agreement detail pages will not appear.

### 7. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the owner username and password you set in step 4. The local SQLite database is created automatically on first use at `data/trustbridge.db` — no separate database setup is needed.

Your local instance is completely independent. It has its own empty database, its own owner login, and its own credentials. No data is shared with the developer's machine.

## Available commands

- `npm run dev` — start the local development server
- `npm run build` — create the production build
- `npm run start` — serve the production build
- `npm run lint` — check code with ESLint
- `npm run typecheck` — check TypeScript types
- `npm test` — validate agreements, owner sessions, private access, share-link lifecycle, response integrity, activity history, and PayPal payment-state transitions

The workspace uses one environment-configured owner login, not individual accounts or multi-user roles. Public review links are bearer links and can be forwarded; they do not establish the link holder's identity. The agreement stores a seller display name, not an authenticated PayPal merchant account, so this milestone sends payments to the single Sandbox business account connected to the configured REST app; it does not route funds to individual service providers. Multi-seller onboarding/payouts and identity binding require a later authenticated marketplace integration. AI drafts are not legal advice; both parties should review the terms independently. Payment does not guarantee delivery or determine dispute outcomes. TrustBridge does not provide identity verification or create legally binding electronic signatures.
