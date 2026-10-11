import { execFileSync } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

declare global {
  var __TEST_CONTAINERS__: StartedTestContainer[] | undefined;
}

/**
 * Starts a disposable Postgres and Pulsar once per Jest run and points the
 * tests at them. Test workers are spawned after this runs, so the env vars set
 * here are what every test module sees at import time.
 */
export default async function globalSetup(): Promise<void> {
  const [postgres, pulsar] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("bidflow")
      .withUsername("bidflow")
      .withPassword("bidflow")
      // the Hermes outbox reads the WAL through logical replication
      .withCommand(["postgres", "-c", "wal_level=logical"])
      .start(),
    new GenericContainer("apachepulsar/pulsar:4.0.14")
      .withCommand(["bin/pulsar", "standalone"])
      .withExposedPorts(6650, 8080)
      .withWaitStrategy(
        Wait.forSuccessfulCommand("bin/pulsar-admin brokers healthcheck"),
      )
      .withStartupTimeout(180_000)
      .start(),
  ]);
  globalThis.__TEST_CONTAINERS__ = [postgres, pulsar];

  const databaseUrl = `${postgres.getConnectionUri()}?schema=public`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  process.env["DATABASE_URL"] = databaseUrl;
  process.env["PULSAR_URL"] =
    `pulsar://${pulsar.getHost()}:${pulsar.getMappedPort(6650)}`;
  // pipeline tests inspect subscriptions over the admin REST API and pause the
  // broker to simulate an outage
  process.env["PULSAR_ADMIN_URL"] =
    `http://${pulsar.getHost()}:${pulsar.getMappedPort(8080)}`;
  process.env["PULSAR_CONTAINER_ID"] = pulsar.getId();
  // set last, only once everything is up — jest.setup.ts checks it
  process.env["BIDFLOW_TEST_CONTAINERS"] = "1";
}
