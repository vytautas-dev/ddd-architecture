import "dotenv/config";

/**
 * Integration tests TRUNCATE every table, so they must never run against the
 * development database. A single place resolves the test connection string and
 * refuses anything that does not look like a dedicated test database.
 */
export function resolveTestDatabaseUrl(): string {
  const url = process.env["DATABASE_URL_TEST"];

  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST is not set — refusing to run integration tests against DATABASE_URL.",
    );
  }

  if (url === process.env["DATABASE_URL"]) {
    throw new Error(
      "DATABASE_URL_TEST points at the development database — tests would TRUNCATE it.",
    );
  }

  const databaseName = new URL(url).pathname.slice(1);

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against database "${databaseName}" — its name must end with "_test".`,
    );
  }

  return url;
}
