# MiniLedger

MiniLedger is a small personal ledger for money you have lent to friends. You log in with your phone number and a one-time password (OTP), record each loan with an amount and a due date, and track what has been repaid and what is overdue.

- **Backend:** REST API (Express 5 + TypeScript) with PostgreSQL (Neon)
- **Frontend:** Expo / React Native app that runs on the web, Android and iOS

> **Demo authentication:** no SMS provider is configured. The OTP is printed in the **backend terminal** (`[DEMO OTP] <phone>: <code>`). See [Demo OTP login](#demo-otp-login).

## Features

- Phone + OTP login. Codes expire after 5 minutes, work only once, lock after 5 wrong attempts, and can be resent after 30 seconds.
- JWT session (7 days). The app stores it and restores it when reopened.
- Every user sees and changes **only their own loans**.
- Add a loan with friend's name, amount (₹, up to 2 decimals) and due date. Quick-pick buttons set the due date.
- Dashboard shows the outstanding amount, total lent, total repaid and overdue amount.
- Each loan shows a status: pending, **overdue** (past due and unpaid) or repaid.
- Mark a loan as repaid, or delete it (asks for confirmation first).
- Loading, empty, error and success states on every screen. Messages appear inline, so they also work on the web.

## Tech stack

| Layer | Technology |
| --- | --- |
| API | Node.js 22.9+, Express 5, TypeScript, Zod (validation), jsonwebtoken, pg |
| Database | PostgreSQL (Neon in development) |
| App | Expo SDK 58, React Native 0.88, react-native-web, AsyncStorage |
| Tests | `node:test` + PGlite (real Postgres in-process, no external DB needed) |

## Repository structure

```
miniledger/
├── .env.example            # backend env template (copy to .env.local)
├── backend/
│   ├── schema.sql          # idempotent, non-destructive schema
│   ├── src/
│   │   ├── app.ts          # Express app: routes, auth, validation, errors
│   │   ├── config.ts       # env parsing/validation
│   │   ├── db.ts           # pg pool + small Db interface
│   │   ├── otp.ts          # OTP issue/verify (expiry, attempts, cooldown)
│   │   ├── migrate.ts      # applies schema.sql
│   │   └── server.ts       # entry point
│   └── test/api.test.ts    # API + database integration tests
└── mobile/
    ├── .env.example        # optional EXPO_PUBLIC_API_URL
    ├── App.tsx             # session handling, screen switching
    └── src/
        ├── api.ts          # API client + API URL resolution
        ├── components/Banner.tsx
        ├── screens/LoginScreen.tsx
        ├── screens/LedgerScreen.tsx
        ├── theme.ts
        └── utils.ts
```

## Prerequisites

- Node.js **22.9 or newer** and npm
- A PostgreSQL database, e.g. a free [Neon](https://neon.tech) project

## Setup

### 1. Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`. It is git-ignored, so never commit it.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (Neon: include `?sslmode=require`) |
| `JWT_SECRET` | prod: yes | ≥ 32 random chars. In development a random one is generated if it is missing, which logs everyone out on each restart. |
| `NODE_ENV` | no | `development` (default) or `production` |
| `PORT` | no | API port, default `3000` |
| `CORS_ORIGINS` | no | Comma-separated allowed origins. If unset, any origin is allowed. That is safe here because auth uses bearer tokens, not cookies. |
| `DEMO_OTP_IN_RESPONSE` | no | `true` = also return the OTP to the app (dev only; ignored in production) |
| `DATABASE_SSL` | no | `false` for a local Postgres without TLS |

The frontend needs **no secrets**. Setting `mobile/.env.local` is optional (see [API URL](#api-url)).

### 2. Install and create the schema

```bash
cd backend
npm install
npm run db:migrate      # creates/updates tables; safe to run repeatedly
```

`schema.sql` uses only `CREATE ... IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`. It never drops or rewrites data.

### 3. Start the backend

```bash
cd backend
npm run dev             # tsx watch, reads ../.env.local
```

Expect `MiniLedger API running on port 3000 (development)`. Check it with:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"connected"}
```

### 4. Start the app

```bash
cd mobile
npm install
npx expo start --web    # or: npx expo start  (then press a / i, or scan with Expo Go)
```

#### API URL

The app picks the API URL in this order:

1. `EXPO_PUBLIC_API_URL` from `mobile/.env.local`, if set.
2. **GitHub Codespaces (web):** the app's own forwarded URL with the port swapped to 3000. For example, `…-8081.app.github.dev` becomes `…-3000.app.github.dev`.
3. Other web hosts: same host, port 3000. For example, `http://localhost:8081` becomes `http://localhost:3000`.
4. Native fallback: `http://localhost:3000`. On a physical phone, set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000`.

> **Codespaces:** forwarded ports are **private** by default. In that case the browser's API calls are redirected to GitHub sign-in and fail. In the **Ports** tab, right-click port **3000**, choose **Port Visibility → Public**. Do the same for 8081 if you share the app URL.

## Demo OTP login

1. Enter a phone number (10–15 digits, optional `+`; spaces and dashes are ignored) and press **Get demo OTP**.
2. Find the code in the backend terminal: `[DEMO OTP] 9876543210: 123456 (valid 5 min)`.
3. Enter it and press **Verify and log in**.

With `DEMO_OTP_IN_RESPONSE=true` (development only), the app also shows the code under the input; tap it to fill it in.

With `NODE_ENV=production`, the OTP is **never** logged or returned. A real deployment needs an SMS provider plugged into `POST /api/auth/request-otp`.

## API

All responses are JSON. Errors are `{ "error": "message" }`. Routes marked 🔒 need `Authorization: Bearer <token>`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | `200 {status:"ok",database:"connected"}`, or `503 {status:"degraded",database:"unreachable"}` |
| POST | `/api/auth/request-otp` | `{phone}` → `{message, phone, expiresInSeconds[, devOtp]}`; `429` during the 30 s resend cooldown |
| POST | `/api/auth/verify-otp` | `{phone, otp}` → `{token, user:{id, phone}}`; `401` wrong/expired/used, `429` locked |
| GET | `/api/auth/me` 🔒 | `{user}` |
| GET | `/api/loans` 🔒 | Your loans (unpaid first, by due date) |
| POST | `/api/loans` 🔒 | `{friendName, amount, dueDate:"YYYY-MM-DD"}` → `201` loan |
| PATCH | `/api/loans/:id/repay` 🔒 | Mark repaid; `409` if already repaid, `404` if not yours/not found |
| DELETE | `/api/loans/:id` 🔒 | `204`; `404` if not yours/not found |
| GET | `/api/summary` 🔒 | `{totalLent, totalRepaid, outstandingAmount, overdueAmount, loanCount}` |

A loan looks like `{ id, friendName, amount, dueDate: "YYYY-MM-DD", repaid, repaidAt, createdAt }`.

## Testing

```bash
cd backend
npm run typecheck       # src + tests
npm test                # 15 API/DB integration tests on an in-process Postgres (PGlite)
npm run build

cd ../mobile
npm run typecheck
npx expo-doctor
npm run build:web       # production web bundle in mobile/dist
```

The backend tests use the real `schema.sql` (applied twice, which proves the schema is idempotent). They cover:

- health checks, including a database outage
- CORS headers
- the full OTP login
- OTP single use, expiry, the attempt lock and resend rate limiting
- OTP never exposed in production
- forged and missing tokens rejected
- loan create, list, repay, delete and summary maths
- input validation
- per-user data isolation

## Deployment notes

- Backend: `npm run build && npm start`. Set `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` and ideally `CORS_ORIGINS` in your host's environment. `npm start` uses `.env.local` only if it exists. Run `npm run db:migrate:prod` once per deploy.
- Web app: `npm run build:web` and host `mobile/dist` on any static host. Set `EXPO_PUBLIC_API_URL` at build time.

## Known limitations

- **No real SMS.** The OTP is shown in the backend terminal (demo only).
- **OTPs are kept in memory.** They are lost on restart, and the API supports one instance only. Scaling out would need Redis or a database table.
- **No server-side logout.** The JWT stays valid until it expires (7 days); logging out deletes it from the device.
- **The due date is typed as `YYYY-MM-DD`** (with quick-pick buttons). There is no native date picker.
- **"Overdue" uses two clocks.** The summary total uses the database's date (UTC on Neon), while the per-loan badge uses the device's local date. They can disagree for a few hours around midnight.
- **Old loans are hidden.** Loans created before login existed have no owner (`user_id IS NULL`). They are kept but shown to no one. To give them to a user:
  `UPDATE loans SET user_id = (SELECT id FROM users WHERE phone = '+91...') WHERE user_id IS NULL;`
