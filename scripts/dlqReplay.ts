import "dotenv/config";
import { createPulsarClient } from "../src/shared/infrastructure/messaging/pulsar";
import { replayDeadLetters } from "../src/shared/infrastructure/messaging/replayDeadLetters";
import {
  PROJECTION_SUBSCRIPTION_NAMES,
  type ProjectionSubscriptionName,
} from "../src/shared/infrastructure/messaging/topology";

// npm run dlq:replay -- <subscription>
// Run after fixing whatever made the projection fail.

const subscription = PROJECTION_SUBSCRIPTION_NAMES.find(
  (name) => name === process.argv[2],
);
if (!subscription) {
  console.error(
    `Usage: npm run dlq:replay -- <${PROJECTION_SUBSCRIPTION_NAMES.join(" | ")}>`,
  );
  process.exit(1);
}

const pulsar = createPulsarClient(process.env["PULSAR_URL"]);
replayDeadLetters(pulsar, subscription as ProjectionSubscriptionName)
  .then((count) =>
    console.log(`Replayed ${count} dead letter(s) of "${subscription}".`),
  )
  .catch((error) => {
    console.error("dlq:replay failed", error);
    process.exitCode = 1;
  })
  .finally(() => pulsar.close());
