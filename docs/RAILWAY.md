# Railway setup checklist for REIN (single Next.js web service + Postgres)

## Required variables (REIN service → Variables)

| Name | Value |
|------|--------|
| `DATABASE_URL` | Reference from your Postgres service (Railway → Variable → Add Reference → `DATABASE_URL`) |
| `AUTH_SECRET` | Long random string (generate locally: `openssl rand -hex 32`) |
| `GEMINI_API_KEY` | Your Google AI Studio key |
| `GEMINI_MODEL` | `gemini-2.5-flash` (optional) |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (for owner SMS login) |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | Twilio number in E.164 (`+15551234567`) |
| `SMS_PROVIDER` | Optional: `twilio` or `console` (logs codes; default auto) |
| `NEXT_PUBLIC_APP_URL` | Public site URL (e.g. `https://www.restman.live`) for staff invite links |

Without Twilio vars, OTP codes are logged to Railway logs and returned as `devCode` in the API so you can still test. Staff invite links are also returned in the Team UI so you can copy/share them.

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
