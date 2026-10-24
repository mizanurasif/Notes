const { api, closeDb, createUser, createAdmin, bearer, unique, PASSWORD } = require("./helpers.cjs");

afterAll(closeDb);

const MAX_LIMIT = 50;
let admin, user;

beforeAll(async () => {
  admin = await createAdmin();
  user = await createUser();
  // 60 notes and 60 posts for `user`, so a limit above the cap can be checked
  for (let i = 0; i < 60; i++) {
    await api().post("/api/notes").set(bearer(user.token)).send({ title: `note ${i}` });
    await api().post("/api/posts").set(bearer(user.token)).send({ title: `post ${i}`, body: "b" });
  }
  // 60+ users with one shared interest and 60 distinct interests → many groups
  const tag = unique("i");
  for (let i = 0; i < 60; i++) {
    const username = unique("p");
    await api()
      .post("/api/admin/users")
      .set(bearer(admin.token))
      .send({ username, email: `${username}@t.dev`, password: PASSWORD, interests: [`${tag}-${i}`] });
  }
}, 180000);

// [name, path, key of the items array]
const lists = () => [
  ["own notes", "/api/notes", "notes", user],
  ["admin: a user's notes", `/api/admin/users/${user.id}/notes`, "notes", admin],
  ["admin: users", "/api/admin/users", "users", admin],
  ["interest groups (scenario 1)", "/api/users/by-interest", "groups", user],
  ["posts feed", "/api/posts", "posts", user],
  ["user posts (scenario 2)", `/api/posts/user/${user.id}`, "posts", user],
];

describe.each([0, 1, 2, 3, 4, 5])("list #%i", (i) => {
  const get = (query) => {
    const [, path, , who] = lists()[i];
    return api().get(path).set(bearer(who.token)).query(query);
  };
  const key = () => lists()[i][2];

  test("returns page metadata and respects limit", async () => {
    const res = await get({ page: 1, limit: 3 });
    expect(res.status).toBe(200);
    expect(res.body[key()]).toHaveLength(3);
    expect(res.body).toMatchObject({ page: 1, limit: 3 });
    expect(res.body.totalPages).toBe(Math.ceil(res.body.total / 3));
  });

  test("pages don't overlap", async () => {
    const a = await get({ page: 1, limit: 5 });
    const b = await get({ page: 2, limit: 5 });
    const id = (x) => x._id ?? x.interest;
    const first = new Set(a.body[key()].map(id));
    expect(b.body[key()].some((x) => first.has(id(x)))).toBe(false);
  });

  test(`limit is capped at ${MAX_LIMIT}`, async () => {
    const res = await get({ limit: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(MAX_LIMIT);
    expect(res.body[key()].length).toBeLessThanOrEqual(MAX_LIMIT);
  });

  test.each([
    ["abc", "xyz"],
    ["0", "0"],
  ])("page=%s limit=%s falls back to defaults", async (page, limit) => {
    const res = await get({ page, limit });
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
  });

  test("negative values are clamped to page 1, limit >= 1", async () => {
    const res = await get({ page: "-1", limit: "-5" });
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBeGreaterThanOrEqual(1);
  });

  test("fractional values are handled (no 500)", async () => {
    const res = await get({ page: "1.5", limit: "2.5" });
    expect(res.status).toBe(200);
    expect(Number.isInteger(res.body.page)).toBe(true);
    expect(Number.isInteger(res.body.limit)).toBe(true);
  });

  test("huge page number is handled (no 500)", async () => {
    const res = await get({ page: "1e400" });
    expect(res.status).toBeLessThan(500);
  });

  test("page past the end returns an empty list", async () => {
    const res = await get({ page: 100000, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body[key()]).toEqual([]);
  });
});
