-- CreateTable
CREATE TABLE "favorites_view" (
    "bidderId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentBid" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "favoritedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favorites_view_pkey" PRIMARY KEY ("bidderId","auctionId")
);

-- CreateIndex
CREATE INDEX "favorites_view_bidderId_startsAt_auctionId_idx" ON "favorites_view"("bidderId", "startsAt", "auctionId");

-- CreateIndex
CREATE INDEX "favorites_view_auctionId_idx" ON "favorites_view"("auctionId");
