import { randomUUID as uuid } from "node:crypto";
import { Client } from "pulsar-client";
import { createPostgresClient } from "../shared/infrastructure/postgresClient";

// Smoke test for the infrastructure every pipeline test relies on: the
// containers started by jest.globalSetup.ts.

describe("test infrastructure", () => {
  it("runs Postgres with logical replication enabled (needed by the Hermes outbox)", async () => {
    const sql = createPostgresClient(process.env["DATABASE_URL"]);
    try {
      const [row] = await sql<{ wal_level: string }[]>`SHOW wal_level`;
      expect(row?.wal_level).toBe("logical");
    } finally {
      await sql.end();
    }
  });

  it("delivers a message through Pulsar from a producer to a consumer", async () => {
    const serviceUrl = process.env["PULSAR_URL"];
    if (!serviceUrl) {
      throw new Error("PULSAR_URL is not set — jest.globalSetup.ts sets it");
    }
    const client = new Client({ serviceUrl });
    const topic = `persistent://public/default/smoke-${uuid()}`;

    try {
      // subscribe first: Pulsar keeps nothing for a topic without a subscription
      const consumer = await client.subscribe({
        topic,
        subscription: "smoke",
        subscriptionInitialPosition: "Earliest",
      });
      const producer = await client.createProducer({ topic });

      await producer.send({ data: Buffer.from("hello, pulsar") });
      const message = await consumer.receive(10_000);
      await consumer.acknowledge(message);

      expect(message.getData().toString()).toBe("hello, pulsar");
      await producer.close();
      await consumer.close();
    } finally {
      await client.close();
    }
  });
});
