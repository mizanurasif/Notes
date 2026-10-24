const bcrypt = require("bcryptjs");
const { ObjectId } = require("mongodb");
const { api, db, closeDb, login, createUser, createAdmin, bearer, unique, hasPasswordField, PASSWORD } = require("./helpers.cjs");

afterAll(closeDb);

let admin, user, target;
beforeAll(async () => {
  admin = await createAdmin();
  user = await createUser();
  target = await createUser();
});

describe("non-admins get 403 on every admin route", () => {
  const fakeNote = String(new ObjectId());
  const routes = () => [
    ["get", "/api/admin/users"],
    ["post", "/api/admin/users"],
    ["get", `/api/admin/users/${target.id}`],
    ["put", `/api/admin/users/${target.id}`],
    ["delete", `/api/admin/users/${target.id}`],
    ["get", `/api/admin/users/${target.id}/notes`],
    ["post", `/api/admin/users/${target.id}/notes`],
    ["get", `/api/admin/users/${target.id}/notes/${fakeNote}`],
    ["put", `/api/admin/users/${target.id}/notes/${fakeNote}`],
    ["delete", `/api/admin/users/${target.id}/notes/${fakeNote}`],
    // Unknown user id: must still be 403, not a 404 that leaks which ids exist
    ["get", `/api/admin/users/${new ObjectId()}`],
  ];

  test("user token → 403, no token → 401, on all routes", async () => {
    for (const [method, url] of routes()) {
      const asUser = await api()[method](url).set(bearer(user.token)).send({ role: "admin", title: "x" });
      expect([method, url, asUser.status]).toEqual([method, url, 403]);
      const anon = await api()[method](url);
      expect([method, url, anon.status]).toEqual([method, url, 401]);
    }
    // And nothing changed
    const doc = await (await db()).collection("users").findOne({ _id: new ObjectId(target.id) });
    expect(doc.role).toBe("user");
  });
});

describe("admin manages users", () => {
  test("list users: paginated, never includes password", async () => {
    const res = await api().get("/api/admin/users").set(bearer(admin.token)).query({ page: 1, limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: expect.any(Number), totalPages: expect.any(Number) });
    expect(hasPasswordField(res.body)).toBe(false);
  });

  test("get one user, never includes password", async () => {
    const res = await api().get(`/api/admin/users/${target.id}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(target.username);
    expect(hasPasswordField(res.body)).toBe(false);
  });

  test("unknown or invalid user id → 404", async () => {
    expect((await api().get(`/api/admin/users/${new ObjectId()}`).set(bearer(admin.token))).status).toBe(404);
    expect((await api().get("/api/admin/users/nope").set(bearer(admin.token))).status).toBe(404);
  });

  test("create user (any role): password hashed, not returned, can log in", async () => {
    const username = unique("made");
    const res = await api()
      .post("/api/admin/users")
      .set(bearer(admin.token))
      .send({ username, email: `${username}@test.dev`, password: PASSWORD, role: "admin", interests: ["Chess "] });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username, role: "admin", interests: ["chess"] });
    expect(hasPasswordField(res.body)).toBe(false);

    const doc = await (await db()).collection("users").findOne({ username });
    expect(doc.password).toMatch(/^\$2[aby]\$/);
    expect((await login(username)).status).toBe(200);
  });

  test("create user validation: bad role, weak password, duplicate → 400/400/409", async () => {
    const send = (body) => api().post("/api/admin/users").set(bearer(admin.token)).send(body);
    const u = unique();
    expect((await send({ username: u, email: `${u}@t.dev`, password: PASSWORD, role: "root" })).status).toBe(400);
    expect((await send({ username: u, email: `${u}@t.dev`, password: "12345678" })).status).toBe(400);
    expect((await send({ username: target.username, email: `${u}@t.dev`, password: PASSWORD })).status).toBe(409);
  });

  test("update password: stored as a new bcrypt hash; old password stops working", async () => {
    const victim = await createUser();
    const newPassword = "An0ther-good-pass";
    const res = await api().put(`/api/admin/users/${victim.id}`).set(bearer(admin.token)).send({ password: newPassword });
    expect(res.status).toBe(200);
    expect(hasPasswordField(res.body)).toBe(false);

    const doc = await (await db()).collection("users").findOne({ _id: new ObjectId(victim.id) });
    expect(doc.password).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(newPassword, doc.password)).toBe(true);
    expect((await login(victim.username)).status).toBe(401);
    expect((await login(victim.username, newPassword)).status).toBe(200);
  });

  test("update with an empty password keeps the current one", async () => {
    const victim = await createUser();
    await api().put(`/api/admin/users/${victim.id}`).set(bearer(admin.token)).send({ password: "", interests: ["go"] });
    expect((await login(victim.username)).status).toBe(200);
  });

  test("admin cannot remove their own admin role or delete themselves", async () => {
    expect((await api().put(`/api/admin/users/${admin.id}`).set(bearer(admin.token)).send({ role: "user" })).status).toBe(400);
    expect((await api().delete(`/api/admin/users/${admin.id}`).set(bearer(admin.token))).status).toBe(400);
  });

  test("delete user also deletes their notes and posts", async () => {
    const victim = await createUser();
    await api().post("/api/notes").set(bearer(victim.token)).send({ title: "n" });
    await api().post("/api/posts").set(bearer(victim.token)).send({ title: "p", body: "b" });
    expect((await api().delete(`/api/admin/users/${victim.id}`).set(bearer(admin.token))).status).toBe(204);

    const d = await db();
    const oid = new ObjectId(victim.id);
    expect(await d.collection("users").countDocuments({ _id: oid })).toBe(0);
    expect(await d.collection("notes").countDocuments({ owner: oid })).toBe(0);
    expect(await d.collection("posts").countDocuments({ author: oid })).toBe(0);
  });
});

describe("admin manages any user's notes", () => {
  let note;
  beforeAll(async () => {
    const res = await api().post("/api/notes").set(bearer(target.token)).send({ title: "Target note", content: "c" });
    note = res.body.note;
  });

  test("list and read a user's notes", async () => {
    const list = await api().get(`/api/admin/users/${target.id}/notes`).set(bearer(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.notes.map((n) => n._id)).toContain(note._id);
    const one = await api().get(`/api/admin/users/${target.id}/notes/${note._id}`).set(bearer(admin.token));
    expect(one.body.note.title).toBe("Target note");
  });

  test("create, update, delete a note for a user", async () => {
    const base = `/api/admin/users/${target.id}/notes`;
    const created = await api().post(base).set(bearer(admin.token)).send({ title: "By admin" });
    expect(created.status).toBe(201);
    const doc = await (await db()).collection("notes").findOne({ _id: new ObjectId(created.body.note._id) });
    expect(String(doc.owner)).toBe(target.id);

    const upd = await api().put(`${base}/${created.body.note._id}`).set(bearer(admin.token)).send({ content: "edited" });
    expect(upd.body.note).toMatchObject({ title: "By admin", content: "edited" });
    expect((await api().delete(`${base}/${created.body.note._id}`).set(bearer(admin.token))).status).toBe(204);
  });

  test("a note is only reachable under its real owner's id", async () => {
    const wrong = `/api/admin/users/${user.id}/notes/${note._id}`;
    expect((await api().get(wrong).set(bearer(admin.token))).status).toBe(404);
    expect((await api().put(wrong).set(bearer(admin.token)).send({ title: "x" })).status).toBe(404);
    expect((await api().delete(wrong).set(bearer(admin.token))).status).toBe(404);
  });

  test("admin can list ALL notes (every user) in one paginated endpoint", async () => {
    const res = await api().get("/api/admin/notes").set(bearer(admin.token)).query({ page: 1, limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ notes: expect.any(Array), page: 1, limit: 5, total: expect.any(Number) });
  });
});
