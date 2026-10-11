import type { Client } from "pulsar-client";
import type { EventEnvelope } from "./EventEnvelope";
import { isReceiveTimeout } from "./pulsar";
import {
  DEAD_LETTER_SUBSCRIPTION,
  deadLetterTopicFor,
  PROJECTION_SUBSCRIPTION_NAMES,
  PROJECTION_SUBSCRIPTIONS,
  type ProjectionSubscriptionName,
} from "./topology";

/**
 * Moves a subscription's dead letters back onto their source topic, oldest
 * first, keyed by streamId like the relay publishes them. Run it after fixing
 * whatever made the projection fail. Every subscription on the source topic
 * sees the copies; the ones that already applied them drop them as duplicates
 * (stream version ledger), so only the frozen projection moves.
 *
 * Stops once the dead-letter topic has been quiet for `idleMs`. Returns how
 * many messages it replayed.
 */
export async function replayDeadLetters(
  pulsar: Client,
  subscription: ProjectionSubscriptionName,
  idleMs = 2_000,
): Promise<number> {
  const source = PROJECTION_SUBSCRIPTIONS.find(
    (s) => s.subscription === subscription,
  );
  if (!source) throw new UnknownSubscriptionError(subscription);

  const deadLetters = await pulsar.subscribe({
    topic: deadLetterTopicFor(source.topic, subscription),
    subscription: DEAD_LETTER_SUBSCRIPTION,
    subscriptionInitialPosition: "Earliest",
  });
  const producer = await pulsar.createProducer({
    topic: source.topic,
    batchingEnabled: false, // Key_Shared consumers need one key per message
  });

  let replayed = 0;
  try {
    for (;;) {
      let message: Awaited<ReturnType<typeof deadLetters.receive>>;
      try {
        message = await deadLetters.receive(idleMs);
      } catch (error) {
        if (isReceiveTimeout(error)) break; // quiet for idleMs: nothing left
        throw error; // a lost connection must not look like "all replayed"
      }
      await producer.send({
        data: message.getData(),
        partitionKey: streamIdOf(message),
      });
      // ack only after the copy is safely back on the source topic
      await deadLetters.acknowledge(message);
      replayed += 1;
    }
  } finally {
    await producer.close();
    await deadLetters.close();
  }
  return replayed;
}

export class UnknownSubscriptionError extends Error {
  constructor(readonly subscription: string) {
    super(
      `Unknown subscription "${subscription}". Known: ${PROJECTION_SUBSCRIPTION_NAMES.join(", ")}`,
    );
    this.name = "UnknownSubscriptionError";
  }
}

/**
 * The stream key, as the relay set it. Taken from the envelope; a message
 * that is not even JSON (it may well be why it was dead-lettered) falls back
 * to the key the dead-letter copy carries.
 */
function streamIdOf(message: {
  getData(): Buffer;
  getPartitionKey(): string;
}): string {
  try {
    return (JSON.parse(message.getData().toString()) as EventEnvelope).streamId;
  } catch {
    return message.getPartitionKey();
  }
}
