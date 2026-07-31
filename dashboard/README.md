# Atul Bakery — Sales Analytics Dashboard

## Local (CSV + Clover API)

```powershell
cd dashboard
copy .env.example .env
# Edit .env with CLOVER_MERCHANT_ID, CLOVER_API_TOKEN, and auth vars
npm install
npm run dev
```

Open http://127.0.0.1:5173/ → you will be prompted to sign in.

- Left sidebar → **Clover Sync** → pick dates → **Fetch from Clover**
- Without Clover credentials, the app still loads CSV exports from `public/data/`

### Authentication (required on public domain)

The dashboard and `/api/clover/*` routes require a signed-in session.

**Username / password** — set in `.env`:

```
SESSION_SECRET=a-long-random-string
AUTH_USERS=owner:YourStrongPassword
```

**Google sign-in** (optional) — create an OAuth 2.0 Client ID (Web) in Google Cloud Console:

1. Authorized JavaScript origins: `http://127.0.0.1:5173` (local) and your Render URL
2. Authorized redirect URI: `http://127.0.0.1:5173/api/auth/google/callback` (local) or `https://YOUR-SERVICE.onrender.com/api/auth/google/callback`
3. Set env:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://127.0.0.1:5173/api/auth/google/callback
AUTH_ALLOWED_EMAILS=you@gmail.com,partner@gmail.com
```

Only emails listed in `AUTH_ALLOWED_EMAILS` can sign in with Google. There is no public self-registration.

### Clover credentials

1. Clover Dashboard → merchant URL contains your **Merchant ID** (`mId`)
2. **Account & Setup** → **API Tokens** (or a Clover app OAuth token)
3. Token needs **Read orders** + **Read inventory** permissions
4. Put values in `dashboard/.env` (never commit `.env`)

```
CLOVER_MERCHANT_ID=XXXXXXXXXXXXX
CLOVER_API_TOKEN=XXXXXXXXXXXXXXXX
CLOVER_BASE_URL=https://api.clover.com
CLOVER_STORE_NAME=Hillside
```

Sandbox: `https://apisandbox.dev.clover.com`

## Deploy on Render (Node web service)

Static hosting cannot keep API secrets. This app uses a **Node** service:

1. Push repo to GitHub
2. Render → **Blueprint** (uses root `render.yaml`) **or** New Web Service
3. Set env vars: `CLOVER_MERCHANT_ID`, `CLOVER_API_TOKEN`, `SESSION_SECRET`, `AUTH_USERS`
4. Optional Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `AUTH_ALLOWED_EMAILS`
5. Build: `npm install && npm run build` · Start: `npm start` · Root: `dashboard`

Free web services sleep when idle; the first request after sleep can take ~30s.

## Stack

React · Vite · Express · Passport (local + Google) · Clover Orders API · Recharts · Tailwind
