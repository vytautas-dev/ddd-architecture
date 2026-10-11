import { Client } from "pulsar-client";

export function createPulsarClient(serviceUrl: string | undefined): Client {
  if (!serviceUrl) {
    throw new Error("PULSAR_URL is not set");
  }
  return new Client({ serviceUrl });
}
