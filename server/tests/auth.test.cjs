const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { api, db, closeDb, register, login, createUser, createAdmin, bearer, signRaw, unique, PASSWORD, hasPasswordField } = require("./helpers.cjs");

afterAll(closeDb);

describe("register", () => {
  test("creates a user with role 'user' and never returns the password", async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("user");
    expect(hasPasswordField(res.body)).toBe(false);
  });

  test("stores a bcrypt hash, not the plain password", async () => {
    const res = await register();
    const doc = await (await db()).collection("users").findOne({ _id: new ObjectId(String(res.body.user.id)) });
    expect(doc.password).not.toBe(PASSWORD);
    expect(doc.password).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(PASSWORD, doc.password)).toBe(true);
  });

  test("mass assignment: role: 'admin' in the body is ignored", async () => {
    const res = await register({ role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("user");
    const doc = await (await db()).collection("users").findOne({ _id: new ObjectId(String(res.body.user.id)) });
    expect(doc.role).toBe("user");
  });

  test("duplicate username or email → 409", async () => {
    const username = unique();
    await register({ username });
    expect((await register({ username, email: `${unique()}@x.dev` })).status).toBe(409);
    expect((await register({ username: unique(), email: `${username}@test.dev` })).status).toBe(409);
  });

  test("weak or common password → 400", async () => {
    expect((await register({ password: "short" })).status).toBe(400);
    expect((await register({ password: "password123" })).status).toBe(400);
  });

  test("missing fields → 400", async () => {
    expect((await api().post("/api/auth/register").send({ username: unique() })).status).toBe(400);
  });

  test("non-string email is rejected with 400 (not a 500)", async () => {
    const res = await api().post("/api/auth/register").send({ username: unique(), email: 123, password: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe("login", () => {
  test("by username and by email; token carries id, role and an expiry", async () => {
    const reg = await register();
    const { username, email } = reg.body.user;

    for (const identifier of [username, email]) {
      const res = await login(identifier);
      expect(res.status).toBe(200);
      expect(hasPasswordField(res.body)).toBe(false);
      const payload = jwt.verify(res.body.token, process.env.TEST_JWT_SECRET);
      expect(payload).toMatchObject({ id: String(reg.body.user.id), role: "user" });
      expect(payload.exp - payload.iat).toBe(30 * 60);
    }
  });

  test("wrong password or unknown user → 401 with the same message", async () => {
    const reg = await register();
    const a = await login(reg.body.user.username, "Wrong-password-1");
    const b = await login(unique("nobody"));
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  test("non-string identifier is rejected with 400 (not a 500)", async () => {
    const res = await api().post("/api/auth/login").send({ identifier: { $gt: "" }, password: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe("protected routes reject bad tokens", () => {
  let user;
  beforeAll(async () => {
    user = await createUser();
  });

  const protectedRoutes = [
    ["get", "/api/notes"],
    ["get", "/api/users/me"],
    ["get", "/api/users/by-interest"],
    ["get", "/api/posts"],
    ["get", "/api/admin/users"],
  ];

  test.each(protectedRoutes)("%s %s without a token → 401", async (method, url) => {
    expect((await api()[method](url)).status).toBe(401);
  });

  test.each(protectedRoutes)("%s %s with a malformed token → 401", async (method, url) => {
    expect((await api()[method](url).set(bearer("not.a.jwt"))).status).toBe(401);
    expect((await api()[method](url).set({ Authorization: user.token })).status).toBe(401); // no "Bearer "
  });

  test("token signed with another secret → 401", async () => {
    const forged = jwt.sign({ id: user.id, role: "admin" }, "attacker-secret", { expiresIn: "30m" });
    expect((await api().get("/api/notes").set(bearer(forged))).status).toBe(401);
  });

  test("alg: none token → 401", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ id: user.id, role: "admin", exp: 9999999999 })).toString("base64url");
    expect((await api().get("/api/admin/users").set(bearer(`${header}.${body}.`))).status).toBe(401);
  });

  test("expired token → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = signRaw({ id: user.id, role: "user", iat: now - 3600, exp: now - 1800 });
    const res = await api().get("/api/notes").set(bearer(expired));
    expect(res.status).toBe(401);
  });

  test("token near expiry gets a fresh X-New-Token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const old = signRaw({ id: user.id, role: "user", iat: now - 25 * 60, exp: now + 5 * 60 });
    const res = await api().get("/api/notes").set(bearer(old));
    expect(res.status).toBe(200);
    const fresh = jwt.decode(res.headers["x-new-token"]);
    expect(fresh.id).toBe(user.id);
    expect(fresh.exp).toBeGreaterThan(now + 25 * 60);
  });
});

describe("role changes and deleted accounts", () => {
  test("a demoted admin loses admin access right away", async () => {
    const boss = await createAdmin();
    const other = await createAdmin();
    const demote = await api().put(`/api/admin/users/${other.id}`).set(bearer(boss.token)).send({ role: "user" });
    expect(demote.status).toBe(200);
    // other.token still says role: "admin"
    expect((await api().get("/api/admin/users").set(bearer(other.token))).status).toBe(403);
  });

  test("a deleted admin loses admin access right away", async () => {
    const boss = await createAdmin();
    const other = await createAdmin();
    expect((await api().delete(`/api/admin/users/${other.id}`).set(bearer(boss.token))).status).toBe(204);
    expect((await api().get("/api/admin/users").set(bearer(other.token))).status).toBe(401);
  });

  test("a deleted user's token stops working", async () => {
    const admin = await createAdmin();
    const victim = await createUser();
    expect((await api().delete(`/api/admin/users/${victim.id}`).set(bearer(admin.token))).status).toBe(204);
    expect((await api().get("/api/notes").set(bearer(victim.token))).status).toBe(401);
  });
});

