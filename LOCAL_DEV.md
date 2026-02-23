# Local Backend Runbook (`servidor_api`)

This backend is a standalone Node package (no npm workspaces configured at repo root).

## Frontend env (`frontend/.env` or `frontend/.env.local`)

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE=http://localhost:3000
```

After changing Vite env vars, restart the dev server:

```bash
cd ~/hemingwai/frontend
export PATH=~/hemingwai/node/nodejs/bin:$PATH
npm run dev
```

## Start locally

```bash
cd ~/hemingwai/servidor_api
export PATH=~/hemingwai/node/nodejs/bin:$PATH
npm install
export CLERK_SECRET_KEY=sk_test_xxxxx
export FRONTEND_ORIGIN=http://localhost:5173
export PORT=3000
npm run doctor
npm start
```

## Quick verification

```bash
cd ~/hemingwai/servidor_api
export PATH=~/hemingwai/node/nodejs/bin:$PATH
node -e "console.log(require.resolve('@clerk/express'))"
```

If this command prints a path, module resolution is correct.

## Doctor checks

`npm run doctor` validates:
- Node runtime (warns if `<18`).
- `CLERK_SECRET_KEY` is set (hard fail).
- `@clerk/express` is resolvable (hard fail).
- Effective CORS allowlist after normalization.

`FRONTEND_ORIGIN` and `FRONTEND_ORIGINS` support trailing slash normalization (e.g. `https://foo.com/` -> `https://foo.com`).

## Notes

- `app.use(clerkMiddleware())` is loaded before protected routes.
- CORS allowlist uses `FRONTEND_ORIGIN` and optional comma-separated `FRONTEND_ORIGINS`.
- Requests without `Origin` (curl/postman) are allowed through CORS, but protected endpoints still require a valid Clerk token.
