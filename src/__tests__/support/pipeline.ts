import { execFileSync } from "node:child_process";
import { randomUUID as uuid } from "node:crypto";
import type { Consumer, Message } from "pulsar-client";
import type { EventEnvelope } from "../../shared/infrastructure/messaging/EventEnvelope";
import { createOutboxRelay } from "../../shared/infrastructure/messaging/outboxRelay";
import { provisionSubscriptions } from "../../shared/infrastructure/messaging/provisionSubscriptions";
import { createPulsarClient } from "../../shared/infrastructure/messaging/pulsar";

/**
 * Starts the outbox relay inside a test, the same way the API process does:
 * provision subscriptions, then start Hermes. Each call gets its own
 * replication slot, so test files never fight over one.
 */
export async function startRelay() {
  const pulsar = createPulsarClient(process.env["PULSAR_URL"]);
  const relay = createOutboxRelay({
    databaseUrl: process.env["DATABASE_URL"],
    pulsar,
    // Hermes stores the consumer name in a varchar(30)
    consumerName: `test_${uuid().replace(/-/g, "").slice(0, 16)}`,
    // fail and retry fast while the broker is paused
    waitAfterFailedPublishMs: 200,
    sendTimeoutMs: 3_000,
  });
  let stopRelay: () => Promise<void>;
  try {
    await provisionSubscriptions(pulsar);
    stopRelay = await relay.start();
  } catch (error) {
    await pulsar.close(); // an open client would keep Jest from exiting
    throw error;
  }

  return {
    outbox: relay.outbox,
    pulsar,
    async stop() {
      await stopRelay();
      await pulsar.close();
    },
  };
}

export interface ReceivedEnvelope {
  key: string;
  envelope: EventEnvelope;
}

/**
 * Subscribes to a topic *now* (Latest), so it only sees what is published
 * after this call. Tests match their own streamIds, since earlier test files
 * publish to the same topics.
 */
export async function readTopic(
  pulsar: ReturnType<typeof createPulsarClient>,
  topic: string,
) {
  const consumer: Consumer = await pulsar.subscribe({
    topic,
    subscription: `reader-${uuid()}`,
    subscriptionInitialPosition: "Latest",
  });
  const seen: ReceivedEnvelope[] = [];

  return {
    seen,
    /** Collects messages until one matches, or fails after `timeoutMs`. */
    async waitFor(
      matches: (received: ReceivedEnvelope) => boolean,
      timeoutMs = 15_000,
    ): Promise<ReceivedEnvelope> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const already = seen.find(matches);
        if (already) return already;
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error(
            `no matching message on ${topic} within ${timeoutMs} ms`,
          );
        }
        let message: Message;
        try {
          message = await consumer.receive(remaining);
        } catch {
          continue; // receive timed out — the loop reports the deadline
        }
        await consumer.acknowledge(message);
        seen.push({
          key: message.getPartitionKey(),
          envelope: JSON.parse(message.getData().toString()) as EventEnvelope,
        });
      }
    },
    close: () => consumer.close(),
  };
}

/** Lists the subscriptions that exist on a topic, via the admin REST API. */
export async function subscriptionsOf(topic: string): Promise<string[]> {
  const path = topic.replace("persistent://", "persistent/");
  const response = await fetch(
    `${process.env["PULSAR_ADMIN_URL"]}/admin/v2/${path}/subscriptions`,
  );
  return (await response.json()) as string[];
}

/** Freezes the Pulsar container (connections hang, nothing is refused). */
export function pausePulsar(): void {
  execFileSync("docker", ["pause", requiredEnv("PULSAR_CONTAINER_ID")]);
}

export function unpausePulsar(): void {
  execFileSync("docker", ["unpause", requiredEnv("PULSAR_CONTAINER_ID")]);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set — jest.globalSetup.ts sets it`);
  return value;
}

/** Publishes an envelope straight to its topic, keyed like the relay does. */
export async function publishEnvelope(
  pulsar: ReturnType<typeof createPulsarClient>,
  topic: string,
  envelope: EventEnvelope,
): Promise<void> {
  const producer = await pulsar.createProducer({
    topic,
    batchingEnabled: false,
  });
  try {
    await producer.send({
      data: Buffer.from(JSON.stringify(envelope)),
      partitionKey: envelope.streamId,
    });
  } finally {
    await producer.close();
  }
}

/**
 * Polls `read` until `done` holds, then returns the value. Views are
 * eventually consistent, so tests wait for a state instead of sleeping.
 */
export async function eventually<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(
        `condition not met within ${timeoutMs} ms; last value: ${JSON.stringify(value)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Messages delivered so far to each consumer currently attached to a
 * subscription (admin REST API) — proves that work was actually shared.
 */
export async function deliveriesPerConsumer(
  topic: string,
  subscription: string,
): Promise<number[]> {
  const path = topic.replace("persistent://", "persistent/");
  const response = await fetch(
    `${process.env["PULSAR_ADMIN_URL"]}/admin/v2/${path}/stats`,
  );
  if (!response.ok) {
    throw new Error(`stats for ${topic} failed: HTTP ${response.status}`);
  }
  const stats = (await response.json()) as {
    subscriptions: Record<string, { consumers: { msgOutCounter: number }[] }>;
  };
  return (stats.subscriptions[subscription]?.consumers ?? []).map(
    (consumer) => consumer.msgOutCounter,
  );
}
