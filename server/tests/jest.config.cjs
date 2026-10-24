module.exports = {
  rootDir: __dirname,
  testMatch: ["<rootDir>/**/*.test.cjs"],
  globalSetup: "<rootDir>/setup/globalSetup.cjs",
  globalTeardown: "<rootDir>/setup/globalTeardown.cjs",
  testTimeout: 30000,
};
