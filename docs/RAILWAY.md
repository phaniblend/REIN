# Railway setup checklist for REIN (single Next.js web service + Postgres)

## Required variables (REIN service → Variables)

| Name | Value |
|------|--------|
| `DATABASE_URL` | Reference from your Postgres service (Railway → Variable → Add Reference → `DATABASE_URL`) |
| `AUTH_SECRET` | Long random string (generate locally: `openssl rand -hex 32`) |
| `GEMINI_API_KEY` | Your Google AI Studio key |
| `GEMINI_MODEL` | `gemini-2.5-flash` (optional) |

## Remove if present (causes npm E401)

Delete these from **REIN → Variables** if they exist:
- `NPM_TOKEN`
- `NODE_AUTH_TOKEN`
- `NPM_PASSWORD`
- `npm_config_//registry.npmjs.org/:_authToken`

## After env is set

1. Open **REIN → Deployments**
2. Click **⋯** on latest → **Redeploy** (or push a new commit)
3. Confirm build log shows **Node 20** (not 18)
4. **Settings → Networking → Generate Domain** so the app is public
