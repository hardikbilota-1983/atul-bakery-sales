# Sales Analytics

## React dashboard (recommended)

A modern Sales Analytics app lives in [`dashboard/`](./dashboard/). It auto-loads every Clover **Items Report** CSV in this folder.

```powershell
cd dashboard
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**

## Legacy Streamlit app

`app.py` is an older Streamlit prototype. Its `src/` modules are incomplete; prefer the React dashboard above.

## Data

Place Clover exports (CSV / Excel / JSON) next to this README, e.g.:

`ATUL BAKERY HILLSIDE-Revenue Item Sales Mar 2026.csv`

The Vite plugin serves them at `/data/*` during development and copies them into `dist/data` on build.
