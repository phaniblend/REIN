# REIN / KitchenYield

Restaurant inventory, Actual-vs-Theoretical yield, POS, and Gemini-assisted menu + area cuisine stats.

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

No separate Vercel frontend, no separate Express API, no second GitHub repo.

## Env vars (you set on Railway Web service)

| Var | Notes |
|-----|--------|
| `DATABASE_URL` | Usually auto from Postgres plugin |
| `GEMINI_API_KEY` | From Google AI Studio |
| `GEMINI_MODEL` | `gemini-2.5-flash` (optional) |
| `AUTH_SECRET` | Long random string |
| `NEXT_PUBLIC_APP_NAME` | `KitchenYield` (optional) |

## Local

```bash
npm install
npm run db:up          # Docker Desktop required
# ensure .env.local has DATABASE_URL + GEMINI_API_KEY + AUTH_SECRET
npm run db:push
npm run dev
```

## Railway deploy (your side)

1. New project → add **PostgreSQL**
2. New service from **this GitHub repo**
3. Variables: link `DATABASE_URL` from Postgres; add `GEMINI_API_KEY`, `AUTH_SECRET`
4. Deploy — `railway.json` runs `npm run build` then `npm run start:railway` (schema push + Next start)

## App surfaces

- **Yield** — stock value, below-par, shortcuts
- **Stock** — ingredients + purchase receipts
- **Menu** — CRUD + Gemini autofill recipes/BOMs
- **POS** — table tickets → drives theoretical usage
- **Count** — blind shift count → AvT reconciliation
- **Waste** — categorized spoilage / returns
- **Area** — Gemini same-cuisine grocery bought-vs-sold averages for your city
