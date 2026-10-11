import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Client } from "pulsar-client";
import { ActiveAuctionsProjection } from "./auction/infrastructure/projections/ActiveAuctionsProjection";
import { PrismaClient } from "./generated/prisma/client";
import { ProjectionConsumer } from "./shared/infrastructure/messaging/ProjectionConsumer";
import { createPulsarClient } from "./shared/infrastructure/messaging/pulsar";
import { StreamOrderedProjection } from "./shared/infrastructure/messaging/StreamOrderedProjection";
import { StreamVersionLedger } from "./shared/infrastructure/messaging/StreamVersionLedger";
import { TOPICS } from "./shared/infrastructure/messaging/topology";
import { PrismaUnitOfWork } from "./shared/infrastructure/PrismaUnitOfWork";

/**
 * The worker process: consumes Pulsar and keeps read models up to date. Any
 * number of instances may run — Key_Shared gives each stream to one of them.
 */
export function createWorker(deps: {
  prisma: PrismaClient;
  pulsar: Client;
  nackRedeliveryMs?: number;
}) {
  const uow = new PrismaUnitOfWork(deps.prisma);
  const ledger = new StreamVersionLedger(uow);
  const consumers = [
    new ProjectionConsumer(deps.pulsar, {
      topic: TOPICS.auction,
      subscription: "active-auctions",
      projection: new StreamOrderedProjection(
        "active-auctions",
        new ActiveAuctionsProjection(uow),
        ledger,
        uow,
      ),
      nackRedeliveryMs: deps.nackRedeliveryMs,
    }),
  ];

  return {
    async start(): Promise<void> {
      await Promise.all(consumers.map((consumer) => consumer.start()));
    },
    async stop(): Promise<void> {
      await Promise.all(consumers.map((consumer) => consumer.stop()));
    },
  };
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString: process.env["DATABASE_URL"],
  });
  const prisma = new PrismaClient({ adapter });
  const pulsar = createPulsarClient(process.env["PULSAR_URL"]);
  const worker = createWorker({ prisma, pulsar });

  await worker.start();
  console.log("BidFlow worker consuming read-model subscriptions");

  const shutdown = async () => {
    await worker.stop();
    await pulsar.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("BidFlow worker failed to start", error);
    process.exit(1);
  });
}
