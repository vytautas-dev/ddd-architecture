/*
  Warnings:

  - You are about to drop the column `currency` on the `favorites_view` table. All the data in the column will be lost.
  - You are about to drop the column `currentBid` on the `favorites_view` table. All the data in the column will be lost.
  - You are about to drop the column `startsAt` on the `favorites_view` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `favorites_view` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `favorites_view` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "favorites_view_auctionId_idx";

-- DropIndex
DROP INDEX "favorites_view_bidderId_startsAt_auctionId_idx";

-- AlterTable
ALTER TABLE "favorites_view" DROP COLUMN "currency",
DROP COLUMN "currentBid",
DROP COLUMN "startsAt",
DROP COLUMN "status",
DROP COLUMN "title";

-- AddForeignKey
ALTER TABLE "favorites_view" ADD CONSTRAINT "favorites_view_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "watchlist_auction_catalog_view"("auctionId") ON DELETE RESTRICT ON UPDATE CASCADE;
