import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Starts disposable Postgres + Pulsar containers once per run.
  globalSetup: "<rootDir>/jest.globalSetup.ts",
  globalTeardown: "<rootDir>/jest.globalTeardown.ts",
  // Refuses to run if the containers are not up.
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // Integration test files share one database (some still TRUNCATE it), so
  // test files must not run in parallel workers.
  maxWorkers: 1,
  testTimeout: 30_000,
};

export default config;
