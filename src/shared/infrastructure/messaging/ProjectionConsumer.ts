import type { Client, Consumer, Message } from "pulsar-client";
import type { EventEnvelope } from "./EventEnvelope";
import { isReceiveTimeout } from "./pulsar";
import {
  StreamGapError,
  type StreamOrderedProjection,
} from "./StreamOrderedProjection";
import {
  DEAD_LETTER_SUBSCRIPTION,
  deadLetterTopicFor,
  type ProjectionSubscriptionName,
  type Topic,
} from "./topology";

export interface ProjectionConsumerOptions {
  topic: Topic;
  /** Must be one of the subscriptions the API provisions. */
  subscription: ProjectionSubscriptionName;
  projection: StreamOrderedProjection;
  /** How long Pulsar waits before redelivering a nacked message. */
  nackRedeliveryMs?: number;
  /** Redeliveries before a message moves to the dead-letter topic. */
  maxRedeliveries?: number;
}

/**
 * Feeds one projection from its own Key_Shared subscription: every event of
 * a stream goes to the same worker instance, several instances share the
 * load. Messages are handled one at a time; a failure (including a gap) is
 * nacked and comes back later, by which time the missing version may be in.
 * After `maxRedeliveries` it moves to the subscription's dead-letter topic, so
 * a poison message freezes only its own stream: the stream's later events
 * keep gapping until they follow it there, and `dlq:replay` brings them back.
 */
export class ProjectionConsumer {
  private consumer: Consumer | undefined;
  private running = false;
  private loop: Promise<void> | undefined;

  constructor(
    private readonly pulsar: Client,
    private readonly options: ProjectionConsumerOptions,
  ) {}

  async start(): Promise<void> {
    this.consumer = await this.pulsar.subscribe({
      topic: this.options.topic,
      subscription: this.options.subscription,
      subscriptionType: "KeyShared",
      subscriptionInitialPosition: "Earliest",
      nAckRedeliverTimeoutMs: this.options.nackRedeliveryMs ?? 1_000,
      deadLetterPolicy: {
        deadLetterTopic: deadLetterTopicFor(
          this.options.topic,
          this.options.subscription,
        ),
        maxRedeliverCount: this.options.maxRedeliveries ?? 10,
        initialSubscriptionName: DEAD_LETTER_SUBSCRIPTION,
      },
    });
    this.running = true;
    this.loop = this.consume(this.consumer);
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
    await this.consumer?.close();
  }

  private async consume(consumer: Consumer): Promise<void> {
    while (this.running) {
      let message: Message;
      try {
        message = await consumer.receive(500); // wake up to check `running`
      } catch (error) {
        if (!isReceiveTimeout(error)) {
          // e.g. a lost connection: say so, and don't spin on it
          console.error(`[${this.options.subscription}] receive failed`, error);
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        continue;
      }
      try {
        const envelope = JSON.parse(
          message.getData().toString(),
        ) as EventEnvelope;
        await this.options.projection.apply(envelope);
        await consumer.acknowledge(message);
      } catch (error) {
        if (!(error instanceof StreamGapError)) {
          console.error(
            `[${this.options.subscription}] failed to apply message`,
            error,
          );
        }
        consumer.negativeAcknowledge(message);
      }
    }
  }
}
