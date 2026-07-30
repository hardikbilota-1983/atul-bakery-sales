# Atul Bakery — Sales Analytics Dashboard

Modern React dashboard that auto-discovers Clover **Items Report** CSVs.

## Local

```powershell
cd dashboard
npm install
npm run dev
```

Open http://127.0.0.1:5173/

## Deploy on Render (free Static Site)

1. Push this repo to GitHub (CSVs live in `dashboard/public/data/`).
2. In [Render](https://render.com) → **New** → **Blueprint**
3. Select the repo (uses root `render.yaml`)
4. Click **Apply**

Or manually: **New Static Site**

| Setting | Value |
|---------|--------|
| Root Directory | `dashboard` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

Add a rewrite rule: `/*` → `/index.html` (SPA routing).

Your site URL will look like `https://atul-bakery-sales.onrender.com`.

## Stack

React · TypeScript · Vite · Tailwind · Recharts · Framer Motion
