# Chelsea Day Resolution Dashboard

Private, read-only property sale dashboard with a separate administrator editor. React + Vite frontend, Express server, and one atomic JSON file on a Render persistent disk. No external database.

## Local setup

Use Node 24 or newer and pnpm 11.19.0. Run `corepack enable`, then `pnpm install --frozen-lockfile`.

Copy `.env.example` to `.env`. Set distinct, random `VIEWER_PASSWORD` and `ADMIN_PASSWORD` values of at least 16 characters, and a random `SESSION_SECRET` of at least 32 characters. Generate secrets with a password manager. Never commit `.env`.

Run `pnpm build`, then `pnpm start`. Open http://localhost:3000. Choose Viewer or Administrator on the login form. The admin entry point is `/admin`. No credentials are shipped.

For frontend development, run `pnpm start` and `pnpm dev` in separate terminals, and temporarily set APP_ORIGIN to the exact Vite URL (normally http://localhost:5173). Return it to http://localhost:3000 for the production-build preview.

## Deploy on Render

1. Push this directory as the root of a private Git repository. Include `pnpm-lock.yaml`; exclude `.env`, `data`, and `node_modules`.
2. In Render, create a Blueprint from that repository using `render.yaml`. This creates a paid Starter web service with a 1 GB persistent disk; review Render's current pricing before deployment.
3. Supply distinct VIEWER_PASSWORD and ADMIN_PASSWORD secrets. Render generates SESSION_SECRET. Set APP_ORIGIN to your exact HTTPS service origin, for example `https://chelsea-day-xxxx.onrender.com`, with no trailing slash. Use your actual Render URL, not this example. If needed, update it after the service URL is assigned and redeploy.
4. Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build`. Start command: `pnpm start`. Health check: `/health`.
5. Confirm DATA_DIR is `/var/data` and the disk is mounted there. The initial dashboard is seeded only on the first start when no data file exists. Redeploys do not reseed or overwrite saved changes.
6. Verify viewer login, admin login, a saved edit, and persistence after restarting the service. Share the viewer password through a private channel.

Render's filesystem is ephemeral outside the persistent disk. Free web services do not support this disk configuration. Run a single service instance / Node process for this intentionally small data store. See [Render persistent disks](https://render.com/docs/disks) and [Blueprint reference](https://render.com/docs/blueprint-spec).

## Maintenance

- Update the current price and add its history entry in the same admin save. They are separate fields so erroneous historical entries can be corrected without silently changing the current price.
- Keep the original listing entry in price history: totals use its price as the original-price baseline. Dates sort chronologically. Per-event reductions compare adjacent entries.
- Days on market uses calendar days in America/New_York, with listing day as day zero, and refreshes while the dashboard is open.
- The earliest incomplete checkpoint supplies both the KPI and next-decision card, even when overdue. Completed checkpoints remain in history. No remaining checkpoint displays “None scheduled.”
- The next-decision card intentionally uses the checkpoint's description directly, avoiding a second editable copy of similar text.
- Initial Last Reviewed is August 28, 2026, the last dated action supplied in the specification. Admin should set the actual reviewed date upon first use.
- “Reviewed — No Material Change” changes only Last Reviewed. Save or discard pending edits first.
- Save changes persists all edits together. Concurrent stale saves are rejected; reload before continuing if another administrator saved changes.
- Back up `/var/data/dashboard.json` through Render's private shell / disk backup process before significant edits. Restore only valid app data while the service is stopped. Never put backups in the public frontend directory.

## Security

All dashboard content is fetched after authentication; the frontend bundle contains no seeded property records. Server-side authorization rejects viewer writes. Passwords are environment-only, compared through constant-time HMAC digests. Signed, random, eight-hour session cookies are HttpOnly, SameSite=Strict, and Secure in production. Mutations require the configured Origin. Login attempts are rate-limited; security headers and strict input validation are enabled. Password and cookie values are never logged.

Logout revocations are kept in memory until session expiry; a server restart clears this revocation list. Rotate SESSION_SECRET to invalidate every outstanding session, including when withdrawing access or changing passwords. Shared passwords intentionally do not provide individual user identity or an audit trail.

## Validation

Run `pnpm test` for calculation, checkpoint rollover, authorization, persistence, review-only updates, validation, and session tests. Run `pnpm build` for the production frontend build.

The source is prepared for Render; no hosted service or real passwords are created by this deliverable.

