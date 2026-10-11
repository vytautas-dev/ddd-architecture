import type { Client, Consumer, Message } from "pulsar-client";
import type { EventEnvelope } from "./EventEnvelope";
import {
  StreamGapError,
  type StreamOrderedProjection,
} from "./StreamOrderedProjection";
import type { PROJECTION_SUBSCRIPTIONS } from "./topology";

type ProjectionSubscription = (typeof PROJECTION_SUBSCRIPTIONS)[number];

export interface ProjectionConsumerOptions {
  topic: ProjectionSubscription["topic"];
  /** Must be one of the subscriptions the API provisions. */
  subscription: ProjectionSubscription["subscription"];
  projection: StreamOrderedProjection;
  /** How long Pulsar waits before redelivering a nacked message. */
  nackRedeliveryMs?: number;
}

/**
 * Feeds one projection from its own Key_Shared subscription: every event of
 * a stream goes to the same worker instance, several instances share the
 * load. Messages are handled one at a time; a failure (including a gap) is
 * nacked and comes back later, by which time the missing version may be in.
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

/** pulsar-client rejects a timed-out receive with "Failed to receive message: TimeOut". */
function isReceiveTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.endsWith(": TimeOut");
}
