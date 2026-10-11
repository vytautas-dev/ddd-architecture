import { Duration } from "@chassisjs/hermes";
import {
  createOutboxConsumer,
  type HermesMessageEnvelope,
} from "@chassisjs/hermes-postgresql";
import postgres, { type JSONValue } from "postgres";
import type { Client, Producer } from "pulsar-client";
import type { EventEnvelope } from "./EventEnvelope";
import { topicFor } from "./topology";

/**
 * Hermes keeps its tables (outbox, consumer state) in their own schema, out of
 * `public` — Prisma only manages `public`, so it never sees them as drift.
 */
export const HERMES_SCHEMA = "hermes";

export interface OutboxRelayOptions {
  databaseUrl: string | undefined;
  pulsar: Client;
  /** Names the replication slot. Exactly one running relay per name; Hermes allows at most 30 characters. */
  consumerName: string;
  /** Pause before Hermes retries a failed publish. */
  waitAfterFailedPublishMs?: number;
  /** How long a send to Pulsar may hang before it counts as failed. */
  sendTimeoutMs?: number;
}

/**
 * The relay half of the transactional outbox: Hermes streams committed outbox
 * rows from the WAL (logical replication, in commit order — no polling) and
 * this publishes each one to its aggregate's topic, keyed by streamId. A
 * publish that throws is retried by Hermes; nothing is acknowledged to
 * Postgres until Pulsar has accepted the message.
 */
export function createOutboxRelay(options: OutboxRelayOptions) {
  const connection = hermesConnectionOptions(options.databaseUrl);
  const producers = new Map<string, Promise<Producer>>();

  function producerFor(topic: string): Promise<Producer> {
    let producer = producers.get(topic);
    if (!producer) {
      producer = options.pulsar.createProducer({
        topic,
        // Key_Shared consumers need every message dispatched by its own key;
        // a batch could mix keys
        batchingEnabled: false,
        sendTimeoutMs: options.sendTimeoutMs ?? 30_000,
      });
      producer.catch(() => producers.delete(topic));
      producers.set(topic, producer);
    }
    return producer;
  }

  async function publish(envelope: EventEnvelope): Promise<void> {
    const producer = await producerFor(topicFor(envelope.streamType));
    await producer.send({
      data: Buffer.from(JSON.stringify(envelope)),
      partitionKey: envelope.streamId,
    });
  }

  const outbox = createOutboxConsumer<JSONValue>({
    getOptions: () => connection,
    consumerName: options.consumerName,
    // Publish strictly one at a time, retrying the oldest message until it
    // goes through: commit order survives into Pulsar. (Hermes's default
    // non-blocking queue may publish later messages first, and its retry
    // interval is never cleared on stop, which keeps the process alive.)
    serialization: true,
    waitAfterFailedPublish: Duration.ofMiliseconds(
      options.waitAfterFailedPublishMs ?? 1_000,
    ),
    publish: async (
      delivered:
        | HermesMessageEnvelope<JSONValue>
        | HermesMessageEnvelope<JSONValue>[],
    ) => {
      for (const { message } of [delivered].flat()) {
        await publish(message as unknown as EventEnvelope);
      }
    },
  });

  return {
    /** Pass to OutboxEventStore; usable only after `start()`. */
    outbox,
    async start(): Promise<() => Promise<void>> {
      await ensureHermesSchema(connection);
      const stopHermes = await outbox.start();
      return async () => {
        await stopHermes();
        for (const producer of producers.values()) {
          await (await producer).close();
        }
        producers.clear();
      };
    },
  };
}

function hermesConnectionOptions(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.slice(1),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    connection: { search_path: HERMES_SCHEMA },
  };
}

async function ensureHermesSchema(
  connection: ReturnType<typeof hermesConnectionOptions>,
): Promise<void> {
  const sql = postgres({ ...connection, onnotice: () => {} });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS ${sql(HERMES_SCHEMA)}`;
  } finally {
    await sql.end();
  }
}
