# Deployment Guide (Clerk Auth)

This repository now uses Clerk JWT session authentication for protected API endpoints.

## 1) Render Environment Variables

Backend service (`hemingwai-backend`):
- `CLERK_SECRET_KEY` = Clerk secret key (`sk_...`)
- `FRONTEND_ORIGIN` = deployed frontend URL (for CORS), for example `https://hemingwai-frontend-5vw6.onrender.com`
- `FRONTEND_ORIGINS` = optional comma-separated extra allowed origins
- `OPENAI_API_KEY` = existing OpenAI key
- existing Mongo vars as already configured
- `PORT=3000`

Frontend service (`hemingwai-frontend`):
- `VITE_CLERK_PUBLISHABLE_KEY` = Clerk publishable key (`pk_...`)
- `VITE_API_BASE_URL` = backend URL, for example `https://hemingwai-backend-5vw6.onrender.com`

Notes:
- `CHATBOT_PASSWORD` is no longer used for protected endpoints.
- Do not add secrets to git-tracked files.
- `FRONTEND_ORIGIN` / `FRONTEND_ORIGINS` are normalized server-side (trailing slash removed).

## 2) Protected vs Public Endpoints

Protected with Clerk `Authorization: Bearer <token>`:
- `GET /api/me`
- `POST /api/chatbot`
- `POST /api/buscar`
- `POST /api/chat/news`
- `GET /api/news/:id/alerts`
- `POST /api/check-urls`

Public:
- `POST /api/check-url`
- `GET /api/news/context`
- health endpoints (`/`, `/health`)

Deprecated password endpoints:
- `POST /api/verify-password` (returns `410`)
- `POST /api/chat/validate-password` (returns `410`)

## 3) Local Development

1. Backend env (`.env`):
- Add `CLERK_SECRET_KEY`
- Add `FRONTEND_ORIGIN=http://localhost:5173`

2. Frontend env (for Vite, e.g. `frontend/.env.local`):
- `VITE_CLERK_PUBLISHABLE_KEY=pk_...`
- `VITE_API_BASE=http://localhost:3000`

3. Install dependencies:
- Backend: `cd servidor_api && npm install`
- Frontend: `cd frontend && npm install`

4. Run services:
- Backend:
  `cd servidor_api && export PATH=~/hemingwai/node/nodejs/bin:$PATH && npm run doctor && npm start`
- Frontend: `cd frontend && npm run dev`

`npm run doctor` checks Node version, `CLERK_SECRET_KEY`, Clerk module resolution, and the normalized CORS allowlist.

## 4) Manual Verification Checklist

1. Signed out UI:
- Open frontend and confirm `Iniciar sesión` button is visible.

2. Signed in UI:
- Sign in with Google and confirm `UserButton` appears.

3. Tokenized protected calls:
- Run an analysis from the frontend and confirm requests to `/api/buscar` and `/api/chatbot` include `Authorization: Bearer <token>`.

4. Protected route rejection:
- Call protected endpoint without token (e.g. `POST /api/buscar`) and confirm `401`.

5. CORS:
- Confirm allowed frontend origin works.
- Confirm random origin is blocked by CORS.

6. `/api/me`:
- Call `GET /api/me` with a valid Bearer token and confirm response includes safe fields (`userId`, `sessionId`, optional `orgId`, `issuedAt`, `exp`).

## 5) Extension TODO

The browser extension still uses password-based flow in its current code.
It must be migrated to Clerk authentication and send `Authorization: Bearer <token>` instead of `CHATBOT_PASSWORD`.
