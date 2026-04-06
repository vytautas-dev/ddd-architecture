-- CreateTable
CREATE TABLE "event_store" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "streamType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_store_streamId_idx" ON "event_store"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "event_store_streamId_version_key" ON "event_store"("streamId", "version");
