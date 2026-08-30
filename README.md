# REIN / Restman

**Restman** — restaurant manager (inspired by Superman: the ops savior). Short for restaurant mgr.

Inventory, Actual-vs-Theoretical yield, POS, and Gemini-assisted menu + area cuisine stats.

## Architecture (one repo)

You do **not** need separate FE / BE / service repos.

| Piece | Where it lives | Railway |
|-------|----------------|---------|
| Frontend (PWA UI) | `src/app/**` pages | same web service |
| Backend (API) | `src/app/api/**` route handlers | same web service |
| DB schema / AvT / Gemini | `src/db`, `src/lib` | same web service |
| PostgreSQL | managed | **Postgres plugin** (separate service, same project) |

```
REIN (this repo)
└── Next.js (standalone)
    ├── UI  /dashboard /menu /inventory /orders /shifts /wastage /insights
    ├── API /api/auth /api/menu /api/ingredients /api/orders …
    └── Gemini server calls (menu autofill + location averages)
         │
         └── DATABASE_URL ──► Railway Postgres
```

**Hosting = 2 Railway services in 1 project:**
1. **Web** — this Next.js app (connect GitHub `REIN`)
2. **Postgres** — Railway plugin; `DATABASE_URL` is injected automatically

## Env vars (Railway Web service)

| Var | Notes |
|-----|--------|
| `DATABASE_URL` | From Postgres plugin |
| `GEMINI_API_KEY` | Google AI Studio |
| `GEMINI_MODEL` | `gemini-2.5-flash` (optional) |
| `AUTH_SECRET` | Long random string |
| `NEXT_PUBLIC_APP_NAME` | `Restman` (optional) |

## Local

```bash
npm install
npm run db:up
npm run db:push
npm run dev
```

## App surfaces

- **Home** — stock value, below-par, shortcuts
- **Stock** — ingredients + purchase receipts
- **Menu** — CRUD + Gemini autofill recipes/BOMs
- **POS** — table tickets → theoretical usage
- **Count** — blind shift count → AvT reconciliation
- **Waste** — categorized spoilage / returns
- **Area** — Gemini same-cuisine grocery bought-vs-sold averages
