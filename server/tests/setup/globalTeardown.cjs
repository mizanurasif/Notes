module.exports = async function globalTeardown() {
  globalThis.__API__?.kill();
  await globalThis.__DB_BRIDGE__?.close();
  await globalThis.__MONGOD__?.stop();
};
