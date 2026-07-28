-- CreateTable
CREATE TABLE "watchlist_auction_catalog_view" (
    "auctionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentBid" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlist_auction_catalog_view_pkey" PRIMARY KEY ("auctionId")
);
