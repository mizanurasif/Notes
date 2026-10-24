# Client

React 19 + TypeScript + Vite frontend for the notes API. Styling is intentionally minimal; the task focuses on the backend. [← Back to project README](../README.md)

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
```

The server must be running on `http://localhost:5000`. `vite.config.ts` proxies every `/api` request there, so no CORS setup or full URLs are needed.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | Oxlint |

## Pages

| Path | Page | API used |
|---|---|---|
| `/login`, `/register` | Login (username **or** email), register | `/api/auth/*` |
| `/notes` | Your notes: edit, delete, paginate; titles link to the full note | `/api/notes` |
| `/notes/new` | Create a note | `POST /api/notes` |
| `/notes/:noteId` | One note in full | `GET /api/notes/:id` |
| `/posts` | Everyone's posts; write, edit and delete your own | `/api/posts` |
| `/posts/:postId` | One post in full | `GET /api/posts/:id` |
| `/users/:userId/posts` | A user's posts (scenario 2, `$lookup`) | `GET /api/posts/user/:userId` |
| `/interests` | Users grouped by interest, with an optional filter (scenario 1) | `GET /api/users/by-interest` |
| `/profile` | Your account; add or remove interests one at a time | `/api/users/me` |
| `/admin/users` | **Admin**: list, add, edit and delete users | `/api/admin/users` |
| `/admin/users/:userId` | **Admin**: a user's notes (add, edit, delete) | `/api/admin/users/:userId/notes` |
| `/admin/users/:userId/notes/:noteId` | **Admin**: one of their notes in full | `GET /api/admin/users/:userId/notes/:noteId` |

Logged-in pages share the navbar (`components/ProtectedLayout.tsx`). Admin pages are also wrapped in `components/AdminRoute.tsx`; the **Users** link only shows for admins. These checks only control what is shown. The server enforces roles on every request.

## How auth works in the browser

`src/api.ts` is the single axios instance:

- **Request**: adds `Authorization: Bearer <token>` from `localStorage`.
- **Renewal**: if a response has `X-New-Token`, it is stored, but only when it belongs to the same user and expires later than the current token (a stale or cached header can never replace a good token).
- **401**: clears the token and redirects to `/login`, where the reason is shown (e.g. "Invalid or expired token"). Login/register requests are excluded so a wrong password just shows the error.
- **Other tabs**: `localStorage` is shared, so if another tab logs in or out, this tab reloads instead of mixing two accounts.

`src/auth.ts` reads `{ id, role }` from the token payload to decide what to show (e.g. the admin link).

The token is kept in `localStorage` for simplicity. In production an httpOnly, Secure, SameSite cookie would protect it from XSS.

## Structure

```
src/
├── api.ts             axios instance (token, renewal, 401 handling)
├── auth.ts            getCurrentUser() from the JWT payload
├── limits.ts          max lengths, kept in sync with the server schemas
├── App.tsx            routes
├── components/        Navbar, ProtectedLayout, AdminRoute, NoteList, NoteDetail
└── pages/             Login, Register, Notes, NoteView, CreateNote, Posts, PostView,
                       UserPosts, Interests, Profile, admin/{Users, UserNotes, UserNoteView}
```

Long titles and text are clamped to 3 lines with "…" in lists (CSS `line-clamp`); the full text is on the single note/post page.
