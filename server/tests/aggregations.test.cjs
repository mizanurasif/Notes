const { ObjectId } = require("mongodb");
const { api, db, closeDb, createUser, createAdmin, bearer, unique, hasPasswordField, PASSWORD } = require("./helpers.cjs");

// The profiler records every operation with the client's appName. The tests' own DB access
// uses appName "jest-probe", so the API server's operations can be told apart.
beforeAll(async () => {
  await (await db()).command({ profile: 2 });
});
afterAll(async () => {
  await (await db()).command({ profile: 0 });
  await closeDb();
});

// Every DB operation the API server ran while `fn` was executing
async function serverOpsDuring(fn) {
  const since = new Date();
  await new Promise((r) => setTimeout(r, 5));
  const res = await fn();
  await new Promise((r) => setTimeout(r, 50));
  const ops = await (await db())
    .collection("system.profile")
    .find({ ts: { $gte: since }, appName: { $ne: "jest-probe" }, ns: { $not: /system\.profile$/ } })
    .toArray();
  return { res, ops };
}

let admin, viewer, tag;
const people = {};

beforeAll(async () => {
  admin = await createAdmin();
  viewer = await createUser();
  tag = unique("t"); // unique interest names, so other test files' data doesn't interfere
  const spec = {
    ann: [`${tag}-chess`, `${tag}-music`],
    ben: [`${tag}-chess`],
    cat: [`${tag}-chess`, `${tag}-music`, `${tag}-go`],
    dan: [],
  };
  for (const [name, interests] of Object.entries(spec)) {
    const username = `${name}${tag}`;
    const res = await api()
      .post("/api/admin/users")
      .set(bearer(admin.token))
      .send({ username, email: `${username}@t.dev`, password: PASSWORD, interests });
    people[name] = { id: String(res.body.user._id), username };
  }
});

describe("Scenario 1: GET /api/users/by-interest", () => {
  test("groups users by interest, most popular first, with counts", async () => {
    // Other test files add interest groups too, so walk every page
    const groups = [];
    let res;
    for (let page = 1; ; page++) {
      res = await api().get("/api/users/by-interest").set(bearer(viewer.token)).query({ page, limit: 50 });
      expect(res.status).toBe(200);
      groups.push(...res.body.groups);
      if (page >= res.body.totalPages) break;
    }
    expect(groups).toHaveLength(res.body.total);

    const mine = groups.filter((g) => g.interest.startsWith(tag));
    const byName = Object.fromEntries(mine.map((g) => [g.interest, g]));
    expect(byName[`${tag}-chess`].count).toBe(3);
    expect(byName[`${tag}-music`].count).toBe(2);
    expect(byName[`${tag}-go`].count).toBe(1);
    expect(byName[`${tag}-chess`].users.map((u) => u.username).sort()).toEqual(
      [people.ann, people.ben, people.cat].map((p) => p.username).sort()
    );

    // Sorted by count desc, then name asc
    const counts = groups.map((g) => g.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(hasPasswordField(groups)).toBe(false);
    expect(JSON.stringify(groups)).not.toContain("@t.dev"); // no emails
  });

  test("?interest= returns only that group", async () => {
    const res = await api().get("/api/users/by-interest").set(bearer(viewer.token)).query({ interest: `${tag}-MUSIC ` });
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0]).toMatchObject({ interest: `${tag}-music`, count: 2 });
    expect(res.body.total).toBe(1);
  });

  test("unknown interest → empty groups, total 0", async () => {
    const res = await api().get("/api/users/by-interest").set(bearer(viewer.token)).query({ interest: unique("none") });
    expect(res.body).toMatchObject({ groups: [], total: 0, totalPages: 0 });
  });

  test("runs exactly ONE aggregate and no other DB operation", async () => {
    const { res, ops } = await serverOpsDuring(() =>
      api().get("/api/users/by-interest").set(bearer(viewer.token)).query({ page: 1, limit: 5 })
    );
    expect(res.status).toBe(200);
    const summary = ops.map((o) => `${o.op}:${Object.keys(o.command ?? {})[0]}:${o.ns}`);
    expect(summary).toEqual([expect.stringMatching(/^command:aggregate:.*\.users$/)]);
    const stages = ops[0].command.pipeline.map((s) => Object.keys(s)[0]);
    expect(stages).toContain("$facet");
  });
});

describe("Scenario 2: GET /api/posts/user/:userId", () => {
  let author, postIds;
  beforeAll(async () => {
    author = await createUser();
    postIds = [];
    for (let i = 0; i < 7; i++) {
      const res = await api().post("/api/posts").set(bearer(author.token)).send({ title: `p${i}`, body: `body ${i}` });
      postIds.push(res.body.post._id);
    }
    // Someone else's post must not show up
    await api().post("/api/posts").set(bearer(viewer.token)).send({ title: "other", body: "x" });
  });

  test("returns the user's posts newest first, paginated, with total", async () => {
    const p1 = await api().get(`/api/posts/user/${author.id}`).set(bearer(viewer.token)).query({ page: 1, limit: 5 });
    expect(p1.status).toBe(200);
    expect(p1.body.user).toEqual({ _id: author.id, username: author.username });
    expect(p1.body).toMatchObject({ total: 7, page: 1, limit: 5, totalPages: 2 });
    expect(p1.body.posts.map((p) => p._id)).toEqual([...postIds].reverse().slice(0, 5));

    const p2 = await api().get(`/api/posts/user/${author.id}`).set(bearer(viewer.token)).query({ page: 2, limit: 5 });
    expect(p2.body.posts.map((p) => p._id)).toEqual([...postIds].reverse().slice(5));
    expect(hasPasswordField(p1.body)).toBe(false);
    expect(JSON.stringify(p1.body)).not.toContain("@test.dev");
  });

  test("user with no posts → empty list, total 0", async () => {
    const res = await api().get(`/api/posts/user/${people.dan.id}`).set(bearer(viewer.token));
    expect(res.body).toMatchObject({ posts: [], total: 0 });
  });

  test("unknown / invalid user → 404", async () => {
    expect((await api().get(`/api/posts/user/${new ObjectId()}`).set(bearer(viewer.token))).status).toBe(404);
    expect((await api().get("/api/posts/user/bad").set(bearer(viewer.token))).status).toBe(404);
  });

  test("uses a single aggregate pipeline with $lookup and nothing else", async () => {
    const { res, ops } = await serverOpsDuring(() =>
      api().get(`/api/posts/user/${author.id}`).set(bearer(viewer.token))
    );
    expect(res.status).toBe(200);
    expect(ops).toHaveLength(1);
    expect(Object.keys(ops[0].command)[0]).toBe("aggregate");
    expect(ops[0].command.pipeline.map((s) => Object.keys(s)[0])).toContain("$lookup");
  });
});
