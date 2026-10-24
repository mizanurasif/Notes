# Secure Note-Taking App

A REST API with a simple React frontend: users manage their own notes, admins manage users and everyone's notes, and two MongoDB aggregation scenarios (users grouped by interest, a user's posts via `$lookup`).

The focus is the **backend**: JWT auth, role-based access, pagination on every list, and a minimal indexing strategy where every index is defined with `schema.index()`.

| Part | Stack | Details |
|---|---|---|
| [`server/`](server/README.md) | Node, Express 5, TypeScript, MongoDB + Mongoose, JWT, bcrypt | API routes, **indexes**, aggregation pipelines |
| [`client/`](client/README.md) | React 19, TypeScript, Vite, React Router, axios | Pages and how they call the API |

## Features

- **Roles**
  - **User**: create, update, delete and list their own notes; profile with interests; write posts.
  - **Admin**: everything a user can do, plus add / update / remove / list users and view or manage any user's notes.
- **Auth**: JWT (30 min, renewed while the user is active), passwords hashed with bcrypt.
- **Pagination** on every list endpoint (`?page=&limit=`).
- **Aggregation scenario 1**: users grouped by interest, with exactly one `aggregate()` call.
- **Aggregation scenario 2**: all posts of a user, with a single pipeline using `$lookup`.

## Quick start

Requirements: Node.js 20+ and a running MongoDB (local `mongodb://127.0.0.1:27017` by default).

```bash
# 1. Server
cd server
npm install
cp .env.example .env          # then set JWT_SECRET and ADMIN_PASSWORD
npm run seed:admin            # creates the first admin from ADMIN_* in .env
npm run dev                   # http://localhost:5000

# 2. Client (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

Open http://localhost:5173, register a user, or log in with the admin from `.env`.

The client proxies `/api` to `http://localhost:5000` (see `client/vite.config.ts`), so both run side by side without CORS setup.

## Indexes at a glance

Every index is declared with `schema.index()` in `server/src/models`. Nothing uses `index: true` / `unique: true` on fields.

| Collection | Index | Why |
|---|---|---|
| users | `{ email: 1 }` unique | Login by email; no duplicate emails |
| users | `{ username: 1 }` unique | Login by username; no duplicate usernames |
| users | `{ interests: 1 }` | Scenario 1 `$match` (skips users without interests; `?interest=` filter) |
| notes | `{ owner: 1, _id: -1 }` | A user's notes, newest first, paginated + counted |
| posts | `{ author: 1, _id: -1 }` | Scenario 2 `$lookup` (users → posts), newest first |

Everything else (single-item GETs, updates, deletes, lists sorted by `_id`) uses MongoDB's built-in `_id` index.
Full reasoning and query plans: [server/README.md → Indexes](server/README.md#indexes).

## Project structure

```
.
├── server/        Express API (TypeScript)
│   └── src/
│       ├── models/        User, Note, Post (+ their indexes)
│       ├── controllers/   auth, note (user), admin, user (profile + scenario 1), post (scenario 2)
│       ├── routes/        one router per area, mounted under /api
│       ├── middleware/    auth (JWT + sliding renewal), requireRole
│       ├── utils/         pagination, token signing
│       └── scripts/       seedAdmin
└── client/        React app (TypeScript, Vite)
    └── src/
        ├── pages/         Notes, Posts, Interests, Profile, admin/*
        ├── components/    Navbar, NoteList, NoteDetail, route guards
        └── api.ts         axios instance (token, renewal, logout on 401)
```
