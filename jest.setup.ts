// Runs in every test worker before any test module is imported. Tests build
// their clients from DATABASE_URL at import time and some still TRUNCATE
// tables, so without the containers they would fall back to the development
// database from .env. jest.globalSetup.ts sets BIDFLOW_TEST_CONTAINERS last,
// once everything is up.
if (process.env["BIDFLOW_TEST_CONTAINERS"] !== "1") {
  throw new Error(
    "Test containers are not running — refusing to run tests against the development database.",
  );
}
