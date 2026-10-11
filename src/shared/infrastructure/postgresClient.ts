import postgres, { type Sql } from "postgres";

const TIMESTAMP_OID = 1114; // `timestamp without time zone`

/**
 * Builds the Postgres.js client from the same DATABASE_URL Prisma uses, and
 * makes it read the shared tables the way Prisma does:
 *
 * - Prisma's `?schema=` parameter is Prisma-only — Postgres.js would forward
 *   it to the server as an unknown run-time setting and fail — so it is
 *   translated into the equivalent `search_path`.
 * - Prisma maps `DateTime` to `timestamp(3)` (no time zone) and treats the
 *   stored wall-clock value as UTC. Postgres.js would parse it in the local
 *   time zone, shifting every date by the host's UTC offset.
 */
export function createPostgresClient(databaseUrl: string | undefined): Sql {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema");
  url.searchParams.delete("schema");

  return postgres(url.toString(), {
    ...(schema ? { connection: { search_path: schema } } : {}),
    types: {
      timestampAsUtc: {
        to: TIMESTAMP_OID,
        from: [TIMESTAMP_OID],
        serialize: (value: Date) => value.toISOString(),
        parse: (value: string) => new Date(`${value.replace(" ", "T")}Z`),
      },
    },
  });
}
