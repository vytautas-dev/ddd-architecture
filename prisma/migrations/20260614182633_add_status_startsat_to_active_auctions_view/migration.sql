/*
  Warnings:

  - Added the required column `startsAt` to the `active_auctions_view` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `active_auctions_view` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "active_auctions_view" ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL;
