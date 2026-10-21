# IMO Dynasty V4.0.40 — automatic selected-game sync

This is a **two-stage deployment**. The site won't auto-sync until the Cloudflare Worker is deployed and its public URL is added to `imo-live-config.js`.

## Prerequisites
- A Cloudflare account and Wrangler installed (`npm install -g wrangler`), plus permission to deploy Workers and KV.
- An **active** Sleeper authorization token obtained from **your own authenticated Sleeper session**. Do NOT paste it into ChatGPT, this ZIP, GitHub, Wrangler config, or any website. An old token was previously exposed in chat: replace it, and note that logging out may not revoke issued tokens.
- Sleeper's GraphQL `matchup_legs` endpoint is undocumented; access and token lifespan may change.

## Deploy securely
1. `cd cloudflare-selection-worker`
2. `wrangler login`
3. `wrangler kv namespace create SELECTIONS` (or create a KV namespace in Cloudflare dashboard). Put the printed namespace ID into `wrangler.toml` replacing `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.
4. `wrangler secret put SLEEPER_AUTH_TOKEN` and enter a NEW valid token locally at the secure prompt. Never commit this secret. Cloudflare's secret manager encrypts the value; the Worker can read it server-side.
5. `wrangler deploy`
6. Note the `https://imo-sleeper-selections.<your-subdomain>.workers.dev` URL.
7. Trigger the first scheduled run from Cloudflare Worker dashboard **Triggers / Cron Triggers / Test**, or wait up to 5 minutes. Test `https://<worker-url>/health` and `https://<worker-url>/selections?league_id=1341763186407276544&week=1`. The first should show `last_success`, the second should contain 8 rosters with `starters_games`. If the first shows no sync, see the Worker logs. The selected games are intentionally public read-only data from this Worker; NEVER return auth tokens.
8. In the root `imo-live-config.js`, set `window.IMO_SELECTIONS_FEED_URL` to your Worker base URL (omit trailing `/`). Deploy the **site root only** to GitHub Pages. Do NOT upload the `cloudflare-selection-worker` directory to GitHub Pages (it includes no secrets but is not needed by browsers).

## Behaviour
- The Worker refreshes current NBA week selections every 5 minutes and saves a validated snapshot to KV. Failed auth, incomplete selections and network errors do NOT replace the last valid data.
- Every IMO visitor pulls those selections approximately every 60 seconds (the existing Head-to-Head timer). Scores refresh against Sleeper public player game logs every 60 seconds and preserve the working V4.0.39 player/game ID matching.
- The site keeps its last valid ledger locally when the Worker is temporarily unavailable, but **stale selections are possible** if managers change picks while authentication is broken. Check `/health` and Worker logs periodically.
- When Sleeper rotates or expires the token, repeat `wrangler secret put SLEEPER_AUTH_TOKEN` with a fresh token; the system is not guaranteed to authenticate indefinitely. No token is delivered to GitHub or users' browsers.
- The shared Worker endpoint publishes player IDs and selected NBA game IDs; this makes selections available to anyone with the endpoint URL. Only use it if you're comfortable exposing league selection data. It does not expose the Sleeper session token.

## Troubleshooting
- `/health` shows `last_success:null`: trigger cron and inspect Worker logs; if error says `Unauthorized`, the secret token is invalid or has expired.
- `/selections` returns 503: no validated snapshot yet for that week; this is expected until the first successful sync.
- Wrong week: compare `/v1/state/nba` week with IMO's displayed week. You may need to adjust the Worker current-week resolver if Sleeper shifts weeks differently.
- Scores don't change during game: look for stats API caching, status inference and current public game log updates. The existing player/game scoring logic is preserved.

## Security and limitations
- This is an authenticated private Sleeper GraphQL integration. It is not an officially supported long-lived OAuth integration.
- Don't hardcode credentials in `imo-live-config.js`, `app.js`, HTML, `wrangler.toml`, logs or public GitHub commits.
- Cloudflare KV storage and public read-only endpoint are included for league-wide access; review Cloudflare billing and limits for your account.
- Syntax is checked, but the Worker cannot be end-to-end authenticated or deployed from this environment. Configure secrets and test actual responses in Cloudflare before treating this as production-ready.
