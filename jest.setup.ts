import { resolveTestDatabaseUrl } from "./scripts/testDatabaseUrl";

// Runs before any test module is imported. Integration tests read
// DATABASE_URL at import time (top-level `new PrismaPg(...)`), so the swap
// has to happen here — a beforeAll hook would already be too late.
process.env["DATABASE_URL"] = resolveTestDatabaseUrl();
