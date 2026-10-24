# Server

Express 5 + TypeScript REST API backed by MongoDB (Mongoose). [← Back to project README](../README.md)

## Setup

```bash
npm install
cp .env.example .env
npm run seed:admin    # create the first admin (or promote an existing user with ADMIN_EMAIL)
npm run dev           # tsx watch, http://localhost:5000
```

| Script | What it does |
|---|---|
| `npm run dev` | Run with reload on file changes |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run seed:admin` | Create an admin from `ADMIN_*` in `.env` (safe to run twice) |

### Environment (`.env`)

| Variable | Example | Purpose |
|---|---|---|
| `PORT` | `5000` | API port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/notes-app` | Database |
| `JWT_SECRET` | long random string | Signs tokens |
| `JWT_EXPIRES_IN` | `30m` | Token lifetime |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | | Used only by `seed:admin` |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Auth

- `POST /api/auth/login` returns a JWT with `{ id, role }`, valid for `JWT_EXPIRES_IN` (30 min).
- Every protected request sends `Authorization: Bearer <token>`; `middleware/auth.ts` verifies it and sets `req.user`.
- **Sliding renewal**: once less than half the lifetime is left, the response carries a fresh token in `X-New-Token` (the user's current role is re-read from the DB, so role changes and deleted users are picked up). Idle for 30 min → logged out.
- `requireRole("admin")` guards every `/api/admin` route (401 without a token, 403 for non-admins).
- Passwords are hashed with bcrypt in a `pre("save")` hook and the field is `select: false`, so it never leaves the DB by accident.
- **Password rule** (`utils/passwordPolicy.ts`): at least 8 characters and not on a list of very common passwords (`12345678`, `password1`, `admin123`, ... case-insensitive). Enforced by the User schema, so register, admin create/update and `seed:admin` all follow it. It only applies when a password is set, so existing accounts can still log in.
- API responses send `Cache-Control: no-store` and no ETag: they depend on who is logged in, so browsers must not cache them.

## API

All list endpoints accept `?page=1&limit=10` (max 50) and return `{ <items>, page, limit, total, totalPages }`.

### Auth: `/api/auth` (public)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/register` | `{ username, email, password }` | Role is always `user` |
| POST | `/login` | `{ identifier, password }` | `identifier` = username **or** email → `{ token, user }` |

### Own notes: `/api/notes` (logged in; always the caller's own notes)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | Paginated, newest first |
| POST | `/` | `{ title, content }` |
| GET | `/:id` | One note in full |
| PUT | `/:id` | `{ title?, content? }` |
| DELETE | `/:id` | 204 |

### Profile and interests: `/api/users` (logged in)
| Method | Path | Notes |
|---|---|---|
| GET | `/me` | Profile with interests |
| POST | `/me/interests` | `{ interest }`, adds **one** (409 if duplicate, max 10) |
| DELETE | `/me/interests/:interest` | Removes one |
| GET | `/by-interest` | **Scenario 1**; optional `?interest=chess` filter |

### Posts: `/api/posts` (logged in; posts are visible to everyone)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | Everyone's posts, newest first, with author username |
| POST | `/` | `{ title, body }` |
| GET | `/user/:userId` | **Scenario 2** (`$lookup`) |
| GET | `/:id` | One post in full |
| PUT | `/:id` | Own posts only |
| DELETE | `/:id` | Own posts only |

### Admin: `/api/admin` (admin only)
| Method | Path | Notes |
|---|---|---|
| GET | `/users` | Paginated user list |
| POST | `/users` | `{ username, email, password, role?, interests? }` |
| GET | `/users/:userId` | One user |
| PUT | `/users/:userId` | Any field; empty password keeps the current one. Can't remove own admin role |
| DELETE | `/users/:userId` | Also deletes their notes and posts. Can't delete yourself |
| GET / POST | `/users/:userId/notes` | List / add notes for that user |
| GET / PUT / DELETE | `/users/:userId/notes/:noteId` | One note of that user |

The admin note routes have their own controllers (`admin.controller.ts`); `note.controller.ts` only ever touches `req.user.id`'s notes.

Errors are JSON `{ message }`: 400 validation, 401 auth, 403 role, 404 not found / not yours, 409 duplicate, 413 body too large.

## Indexes

Defined with `schema.index()` in `src/models/*.ts`. The rule: **an index only exists if a specific query needs it.** The built-in `_id` index covers everything else, so lists that don't filter are sorted by `_id` (which grows with creation time) instead of `createdAt`.

| Collection | Index | Queries it supports |
|---|---|---|
| users | `{ email: 1 }` unique | Login `$or: [{ email }, { username }]`; enforces unique emails |
| users | `{ username: 1 }` unique | The other half of the login `$or`; enforces unique usernames |
| users | `{ interests: 1 }` (multikey) | Scenario 1's first `$match` |
| notes | `{ owner: 1, _id: -1 }` | `find({ owner }).sort({ _id: -1 })` + `countDocuments({ owner })` for a user's list (own or via admin); `deleteMany({ owner })` when a user is deleted |
| posts | `{ author: 1, _id: -1 }` | Scenario 2's `$lookup` on `author`, sorted newest first; `deleteMany({ author })` |

Covered by `_id` (no extra index):
- every single-item GET / PUT / DELETE (`{ _id, owner }`, `{ _id, author }` still seek by `_id`)
- admin user list and the posts feed: `find().sort({ _id: -1 })`, totals via `estimatedDocumentCount()` (collection metadata, no scan)
- profile (`findById`) and the interest add/remove updates

Indexes deliberately **not** created:
- `createdAt`: `_id` already gives creation order.
- `role`: nothing filters by role.
- `notes.title` / text search: not a requirement.

Verified with `explain()`: the notes list is `IXSCAN owner_1__id_-1` with no in-memory sort; the user list is `IXSCAN _id_`; scenario 2 reports `indexesUsed: ["author_1__id_-1"], collectionScans: 0`.

## Aggregations

### Scenario 1: users grouped by interest
`GET /api/users/by-interest`, `src/controllers/user.controller.ts → groupByInterest`. Exactly **one** `User.aggregate()` call; pagination total comes from `$facet`, not a separate count.

```js
[
  { $match: { interests: { $gt: "" } } },        // or { interests: "chess" } with ?interest=
  { $project: { username: 1, interests: 1 } },
  { $unwind: "$interests" },
  // with ?interest=: { $match: { interests: "chess" } } to drop the user's other interests
  { $group: { _id: "$interests", count: { $sum: 1 }, users: { $push: { _id: "$_id", username: "$username" } } } },
  { $sort: { count: -1, _id: 1 } },
  { $facet: { groups: [{ $skip }, { $limit }, { $project: { _id: 0, interest: "$_id", count: 1, users: 1 } }],
              total: [{ $count: "count" }] } },
]
```

- `$gt: ""` means "has at least one interest". It's a range the `{ interests: 1 }` index can scan, so users with no interests are never read. `{ $ne: [] }` looks equivalent, but it reads every user.
- With `?interest=chess`, only users who have that interest are read.
- `$unwind`/`$group` must see every user who has interests, so the index can't speed up the grouping itself. Its job is the `$match`.

### Scenario 2: a user's posts with `$lookup`
`GET /api/posts/user/:userId`, `src/controllers/post.controller.ts → listUserPosts`. One `User.aggregate()` pipeline.

```js
[
  { $match: { _id: userId } },                                   // _id index
  { $lookup: {
      from: "posts", localField: "_id", foreignField: "author",  // { author, _id } index
      pipeline: [
        { $sort: { _id: -1 } },
        { $facet: { posts: [{ $skip }, { $limit }, { $project: { title: 1, body: 1, createdAt: 1 } }],
                    total: [{ $count: "count" }] } },
      ],
      as: "result" } },
  { $project: { _id: 0, user: { _id: "$_id", username: "$username" },
                posts: { $first: "$result.posts" },
                total: { $ifNull: [{ $first: { $first: "$result.total.count" } }, 0] } } },
]
```

- Starts from the user (so an unknown user is a 404) and joins their posts.
- The lookup seeks `author` through the index and reads posts newest first from the same index, so there's no collection scan and no in-memory sort.
- Only `_id` and `username` leave the users collection (no email or password hash).

## Structure

```
src/
├── index.ts                 app setup, no-store caching, error handler (validation → 400, duplicate key → 409, ...)
├── config/db.ts             mongoose.connect
├── models/                  User, Note, Post: schemas, validation, indexes
├── middleware/auth.ts       auth (JWT + sliding renewal), requireRole
├── controllers/
│   ├── auth.controller.ts   register, login
│   ├── note.controller.ts   the caller's own notes
│   ├── user.controller.ts   profile, interests, scenario 1
│   ├── post.controller.ts   posts, scenario 2
│   └── admin.controller.ts  users + any user's notes
├── routes/                  one router per controller
├── utils/                   pagination, signToken
└── scripts/seedAdmin.ts     npm run seed:admin
```
