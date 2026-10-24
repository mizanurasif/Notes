// Starts a throwaway MongoDB (random port, temp data dir) and the real API server against it.
// The server runs unmodified as a child process, so src/index.ts doesn't need to export `app`.
// It is started from the tests/ folder so dotenv never loads server/.env (your dev database).
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const http = require("node:http");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");
const { MongoMemoryServer } = require("mongodb-memory-server-core");

const SERVER_ROOT = path.join(__dirname, "..", "..");
const DEFAULT_MONGOD = "C:/Program Files/MongoDB/Server/9.0/bin/mongod.exe";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// The MongoDB driver can't handshake from inside Jest's sandbox (cross-realm BSON objects),
// so tests reach the test DB through this tiny local bridge: POST { op, collection, args } as EJSON.
async function startDbBridge(mongoUri) {
  const client = await new MongoClient(mongoUri, { appName: "jest-probe" }).connect();
  const db = client.db();
  const ops = {
    findOne: (c, [filter, options]) => db.collection(c).findOne(filter, options),
    find: (c, [filter, options]) => db.collection(c).find(filter, options).toArray(),
    countDocuments: (c, [filter]) => db.collection(c).countDocuments(filter),
    insertOne: (c, [doc]) => db.collection(c).insertOne(doc),
    command: (_c, [cmd]) => db.command(cmd),
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { op, collection, args } = EJSON.parse(body);
        const result = await ops[op](collection, args);
        res.end(EJSON.stringify({ result }));
      } catch (err) {
        res.statusCode = 500;
        res.end(EJSON.stringify({ error: err.message }));
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: async () => (server.close(), client.close()) };
}

async function waitForServer(url, child, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`API server exited with code ${child.exitCode}`);
    try {
      await fetch(`${url}/api/notes`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("API server did not start in time");
}

module.exports = async function globalSetup() {
  const mongod = await MongoMemoryServer.create({
    binary: { systemBinary: process.env.MONGOD_BINARY || DEFAULT_MONGOD, checkMD5: false },
  });
  const mongoUri = mongod.getUri("notes_test");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const jwtSecret = "test_secret_" + Math.random().toString(36).slice(2);

  const logFile = path.join(require("node:os").tmpdir(), "notes-api-test.log");
  const log = fs.openSync(logFile, "w");
  const child = spawn(
    process.execPath,
    [path.join(SERVER_ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(SERVER_ROOT, "src", "index.ts")],
    {
      cwd: __dirname, // no .env here → dev settings are never loaded
      env: { ...process.env, MONGO_URI: mongoUri, PORT: String(port), JWT_SECRET: jwtSecret, JWT_EXPIRES_IN: "30m" },
      stdio: ["ignore", log, log],
    }
  );

  await waitForServer(baseUrl, child);

  const bridge = await startDbBridge(mongoUri);

  // Workers are spawned after globalSetup, so they inherit these
  process.env.TEST_BASE_URL = baseUrl;
  process.env.TEST_MONGO_URI = mongoUri;
  process.env.TEST_JWT_SECRET = jwtSecret;
  process.env.TEST_DB_BRIDGE = bridge.url;

  globalThis.__MONGOD__ = mongod;
  globalThis.__API__ = child;
  globalThis.__DB_BRIDGE__ = bridge;
};
