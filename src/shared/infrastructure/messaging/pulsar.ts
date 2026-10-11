import { Client } from "pulsar-client";

export function createPulsarClient(serviceUrl: string | undefined): Client {
  if (!serviceUrl) {
    throw new Error("PULSAR_URL is not set");
  }
  return new Client({ serviceUrl });
}

/** pulsar-client rejects a timed-out receive with "Failed to receive message: TimeOut". */
export function isReceiveTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.endsWith(": TimeOut");
}
