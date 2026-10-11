import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { readProjectionsStatus } from "../src/shared/infrastructure/messaging/projectionsStatus";

// npm run projections:status [-- --frozen-after <seconds>]
// Read-only: compares each projection's stream version ledger with the event
// store and lists the streams it is behind on.

const DEFAULT_FROZEN_AFTER_SECONDS = 60;

const flag = process.argv.indexOf("--frozen-after");
const frozenAfterSeconds =
  flag === -1 ? DEFAULT_FROZEN_AFTER_SECONDS : Number(process.argv[flag + 1]);
if (!Number.isFinite(frozenAfterSeconds) || frozenAfterSeconds < 0) {
  console.error(
    "Usage: npm run projections:status [-- --frozen-after <seconds>]",
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});

readProjectionsStatus(prisma, { frozenAfterMs: frozenAfterSeconds * 1000 })
  .then((statuses) => {
    const lagging = statuses.filter((s) => s.lagging.length > 0);
    if (lagging.length === 0) {
      console.log("All projections caught up.");
    }
    for (const { projection, lagging: streams } of lagging) {
      console.log(`${projection}: ${streams.length} stream(s) behind`);
      for (const s of streams) {
        const state = s.frozen
          ? `FROZEN — likely in the DLQ (npm run dlq:replay -- ${projection}), or the worker is down`
          : "lagging";
        console.log(
          `  ${s.streamId}  applied ${s.applied}/${s.head}  gap ${s.gap}  waiting ${Math.round(s.waitingMs / 1000)}s  ${state}`,
        );
      }
    }
    console.log(
      "\nNot covered: a projection that applied an event and wrote a wrong value looks caught up here; only a rebuild heals it.",
    );
  })
  .catch((error) => {
    console.error("projections:status failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
