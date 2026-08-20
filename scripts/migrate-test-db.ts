import { execFileSync } from "node:child_process";
import { resolveTestDatabaseUrl } from "./testDatabaseUrl";

// Brings the test database up to date with prisma/migrations. Uses
// `migrate deploy` (apply only, never drop) — the test database is recreated
// by TRUNCATE in the tests, not by resetting the schema.
execFileSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: resolveTestDatabaseUrl() },
});
