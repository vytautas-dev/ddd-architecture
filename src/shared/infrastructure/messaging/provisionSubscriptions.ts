import type { Client } from "pulsar-client";
import {
  DEAD_LETTER_SUBSCRIPTION,
  deadLetterTopicFor,
  PROJECTION_SUBSCRIPTIONS,
} from "./topology";

/**
 * Creates every projection subscription before anything is published. Pulsar
 * keeps no messages on a topic that has no subscription, so an event published
 * before the worker's first run would otherwise be gone for good. Closing the
 * consumer keeps the (durable) subscription; it starts at the earliest message.
 * The same goes for each subscription's dead-letter topic: its "replay"
 * subscription must exist before the first dead letter lands there.
 */
export async function provisionSubscriptions(pulsar: Client): Promise<void> {
  for (const { topic, subscription } of PROJECTION_SUBSCRIPTIONS) {
    const consumer = await pulsar.subscribe({
      topic,
      subscription,
      subscriptionType: "KeyShared",
      subscriptionInitialPosition: "Earliest",
    });
    await consumer.close();

    const deadLetters = await pulsar.subscribe({
      topic: deadLetterTopicFor(topic, subscription),
      subscription: DEAD_LETTER_SUBSCRIPTION,
      subscriptionInitialPosition: "Earliest",
    });
    await deadLetters.close();
  }
}
