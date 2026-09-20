/*
  Warnings:

  - A unique constraint covering the columns `[position]` on the table `event_store` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "event_store" ADD COLUMN     "position" BIGSERIAL NOT NULL;

-- CreateTable
CREATE TABLE "projection_checkpoints" (
    "subscriberName" TEXT NOT NULL,
    "position" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projection_checkpoints_pkey" PRIMARY KEY ("subscriberName")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_store_position_key" ON "event_store"("position");
