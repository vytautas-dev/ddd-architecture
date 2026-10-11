-- CreateTable
CREATE TABLE "projection_stream_versions" (
    "projectionName" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projection_stream_versions_pkey" PRIMARY KEY ("projectionName","streamId")
);

-- Projections now apply each stream strictly from version 1. An empty ledger
-- would wait forever for the early versions of streams that already exist,
-- so existing data is wiped (spec #5, decision #16 — there is no production
-- data). Not reversible.
TRUNCATE TABLE "event_store", "active_auctions_view", "favorites_view", "watchlist_auction_catalog_view", "projection_checkpoints";
