import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Integration test files share one database (and TRUNCATE it), so test
  // files must not run in parallel workers.
  maxWorkers: 1,
};

export default config;