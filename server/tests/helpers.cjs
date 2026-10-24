// Shared helpers: a supertest client for the running API, direct test-DB access for
// setup/inspection (through the bridge in setup/globalSetup.cjs), and ways to create users and tokens.
const request = require("supertest");
const { EJSON } = require("bson");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const api = () => request(process.env.TEST_BASE_URL);
const SECRET = () => process.env.TEST_JWT_SECRET;
const PASSWORD = "Str0ng-test-pass";

let seq = 0;
const unique = (prefix = "u") => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

async function bridge(op, collection, args) {
  const res = await fetch(process.env.TEST_DB_BRIDGE, {
    method: "POST",
    body: EJSON.stringify({ op, collection, args }),
  });
  const data = EJSON.parse(await res.text());
  if (data.error) throw new Error(data.error);
  return data.result;
}

// Mirrors the small part of the driver API the tests use
const testDb = {
  collection: (name) => ({
    findOne: (...args) => bridge("findOne", name, args),
    find: (...args) => ({ toArray: () => bridge("find", name, args) }),
    countDocuments: (...args) => bridge("countDocuments", name, args),
    insertOne: (...args) => bridge("insertOne", name, args),
  }),
  command: (cmd) => bridge("command", null, [cmd]),
};
async function db() {
  return testDb;
}
async function closeDb() {}

async function register(overrides = {}) {
  const username = overrides.username ?? unique("user");
  const body = { username, email: `${username}@test.dev`, password: PASSWORD, ...overrides };
  return api().post("/api/auth/register").send(body);
}

async function login(identifier, password = PASSWORD) {
  return api().post("/api/auth/login").send({ identifier, password });
}

// Registers through the API and logs in; returns { id, username, token }
async function createUser(overrides = {}) {
  const reg = await register(overrides);
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const res = await login(reg.body.user.username, overrides.password ?? PASSWORD);
  return { id: String(reg.body.user.id), username: reg.body.user.username, token: res.body.token };
}

// There is no public way to become admin (by design), so the first admin is inserted
// straight into the test DB, like `npm run seed:admin` would.
async function createAdmin() {
  const username = unique("admin");
  const d = await db();
  const { insertedId } = await d.collection("users").insertOne({
    username,
    email: `${username}@test.dev`,
    password: await bcrypt.hash(PASSWORD, 10),
    role: "admin",
    interests: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const res = await login(username);
  return { id: String(insertedId), username, token: res.body.token };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Token signed with the test secret; use to craft expired / near-expiry tokens
function signRaw(payload, options) {
  return jwt.sign(payload, SECRET(), options);
}

// Recursively looks for a "password" key anywhere in a response body
function hasPasswordField(value) {
  if (Array.isArray(value)) return value.some(hasPasswordField);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([k, v]) => k === "password" || hasPasswordField(v));
  }
  return false;
}

module.exports = {
  api, db, closeDb, register, login, createUser, createAdmin, bearer, signRaw, unique, hasPasswordField, PASSWORD,
};
