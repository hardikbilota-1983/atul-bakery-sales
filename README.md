# Sales Analytics

## React dashboard (recommended)

```powershell
cd dashboard
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**

## Deploy on Render (free)

This repo includes [`render.yaml`](./render.yaml) for a free **Static Site**.

1. Push to GitHub
2. Go to [render.com](https://dashboard.render.com) → **New** → **Blueprint**
3. Connect the repo → **Apply**

Manual static site settings:

| Setting | Value |
|---------|--------|
| Root Directory | `dashboard` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |
| Rewrite | `/*` → `/index.html` |

Sales CSVs ship in `dashboard/public/data/` so the hosted build includes your reports.

## Legacy Streamlit

`app.py` is an older prototype; prefer the React dashboard.
