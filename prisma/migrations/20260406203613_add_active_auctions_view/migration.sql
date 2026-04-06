-- CreateTable
CREATE TABLE "active_auctions_view" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currentBid" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "totalBids" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "active_auctions_view_pkey" PRIMARY KEY ("id")
);
