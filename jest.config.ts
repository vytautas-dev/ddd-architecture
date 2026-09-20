import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Points DATABASE_URL at the test database before any test module loads.
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // Integration test files share one database (and TRUNCATE it), so test
  // files must not run in parallel workers.
  maxWorkers: 1,
};

export default config;
