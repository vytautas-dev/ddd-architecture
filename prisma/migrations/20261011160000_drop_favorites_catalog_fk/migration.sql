-- favorites_view and the catalog are now fed from different Pulsar topics with
-- no cross-topic order, so the database must not insist that a favorite's
-- catalog row already exists. The relation stays in the Prisma client
-- (relationMode = "prisma"), which needs an index on the relation field.

-- DropForeignKey
ALTER TABLE "favorites_view" DROP CONSTRAINT "favorites_view_auctionId_fkey";

-- CreateIndex
CREATE INDEX "favorites_view_auctionId_idx" ON "favorites_view"("auctionId");
