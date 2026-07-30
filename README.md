# Sales Analytics

## React dashboard + Clover live sync

```powershell
cd dashboard
copy .env.example .env
# Add CLOVER_MERCHANT_ID and CLOVER_API_TOKEN
npm install
npm run dev
```

Open **http://127.0.0.1:5173/** → sidebar **Clover Sync** → Fetch.

See [`dashboard/README.md`](./dashboard/README.md) for credentials and Render deploy (Node web service + env vars).

## Data sources

1. **Clover API** (preferred when synced) — daily order line items, payment method, order IDs
2. **CSV exports** in `dashboard/public/data/` — fallback Items Reports
