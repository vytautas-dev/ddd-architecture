-- Read models are fed from Pulsar now; the polling CatchUpSubscription — the
-- only reader of event_store.position and of the checkpoints — is gone.
-- Not reversible in content: re-adding the column would renumber the rows.

-- DropTable
DROP TABLE "projection_checkpoints";

-- AlterTable (also drops its unique index and its sequence)
ALTER TABLE "event_store" DROP COLUMN "position";
