# Atul Bakery — Sales Analytics Dashboard

## Local (CSV + Clover API)

```powershell
cd dashboard
copy .env.example .env
# Edit .env with CLOVER_MERCHANT_ID and CLOVER_API_TOKEN
npm install
npm run dev
```

Open http://127.0.0.1:5173/

- Left sidebar → **Clover Sync** → pick dates → **Fetch from Clover**
- Without Clover credentials, the app still loads CSV exports from `public/data/`

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
3. Set env vars: `CLOVER_MERCHANT_ID`, `CLOVER_API_TOKEN`
4. Build: `npm install && npm run build` · Start: `npm start` · Root: `dashboard`

Free web services sleep when idle; the first request after sleep can take ~30s.

## Stack

React · Vite · Express · Clover Orders API · Recharts · Tailwind
