const { ObjectId } = require("mongodb");
const { api, db, closeDb, createUser, createAdmin, bearer } = require("./helpers.cjs");

afterAll(closeDb);

let alice, bob;
beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
});

async function createNote(user, body = { title: "Hello", content: "World" }) {
  const res = await api().post("/api/notes").set(bearer(user.token)).send(body);
  expect(res.status).toBe(201);
  return res.body.note;
}

describe("own notes CRUD", () => {
  test("create → get → update → delete", async () => {
    const note = await createNote(alice);
    expect(note).toEqual({ _id: expect.any(String), title: "Hello", content: "World" });

    const got = await api().get(`/api/notes/${note._id}`).set(bearer(alice.token));
    expect(got.status).toBe(200);
    expect(got.body.note.title).toBe("Hello");

    const upd = await api().put(`/api/notes/${note._id}`).set(bearer(alice.token)).send({ title: "Changed" });
    expect(upd.status).toBe(200);
    expect(upd.body.note).toMatchObject({ title: "Changed", content: "World" }); // content kept

    expect((await api().delete(`/api/notes/${note._id}`).set(bearer(alice.token))).status).toBe(204);
    expect((await api().get(`/api/notes/${note._id}`).set(bearer(alice.token))).status).toBe(404);
  });

  test("validation: missing/blank title, non-string content → 400", async () => {
    const send = (body) => api().post("/api/notes").set(bearer(alice.token)).send(body);
    expect((await send({})).status).toBe(400);
    expect((await send({ title: "   " })).status).toBe(400);
    expect((await send({ title: "x", content: 5 })).status).toBe(400);
    expect((await send({ title: "x".repeat(201) })).status).toBe(400);
  });

  test("owner in the body is ignored (cannot create a note for someone else)", async () => {
    const note = await createNote(alice, { title: "spoof", owner: bob.id });
    const doc = await (await db()).collection("notes").findOne({ _id: new ObjectId(note._id) });
    expect(String(doc.owner)).toBe(alice.id);
  });

  test("owner cannot be changed through update", async () => {
    const note = await createNote(alice);
    await api().put(`/api/notes/${note._id}`).set(bearer(alice.token)).send({ title: "t", owner: bob.id });
    const doc = await (await db()).collection("notes").findOne({ _id: new ObjectId(note._id) });
    expect(String(doc.owner)).toBe(alice.id);
  });

  test("invalid or unknown id → 404", async () => {
    expect((await api().get("/api/notes/not-an-id").set(bearer(alice.token))).status).toBe(404);
    expect((await api().get(`/api/notes/${new ObjectId()}`).set(bearer(alice.token))).status).toBe(404);
  });
});

describe("ownership: Bob cannot touch Alice's note by its id", () => {
  let note;
  beforeAll(async () => {
    note = await createNote(alice, { title: "Alice secret", content: "only mine" });
  });

  test("GET → 404", async () => {
    const res = await api().get(`/api/notes/${note._id}`).set(bearer(bob.token));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("only mine");
  });

  test("PUT → 404 and the note is unchanged", async () => {
    const res = await api().put(`/api/notes/${note._id}`).set(bearer(bob.token)).send({ title: "pwned" });
    expect(res.status).toBe(404);
    const doc = await (await db()).collection("notes").findOne({ _id: new ObjectId(note._id) });
    expect(doc.title).toBe("Alice secret");
  });

  test("DELETE → 404 and the note still exists", async () => {
    expect((await api().delete(`/api/notes/${note._id}`).set(bearer(bob.token))).status).toBe(404);
    expect(await (await db()).collection("notes").countDocuments({ _id: new ObjectId(note._id) })).toBe(1);
  });

  test("Bob's list never contains Alice's notes", async () => {
    const res = await api().get("/api/notes").set(bearer(bob.token)).query({ limit: 50 });
    expect(res.body.notes.map((n) => n._id)).not.toContain(note._id);
  });

  test("an admin on /api/notes also only sees their own notes", async () => {
    const admin = await createAdmin();
    expect((await api().get(`/api/notes/${note._id}`).set(bearer(admin.token))).status).toBe(404);
  });
});
