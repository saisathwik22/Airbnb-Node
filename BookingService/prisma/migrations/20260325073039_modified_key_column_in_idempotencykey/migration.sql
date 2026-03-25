/*
  Warnings:

  - You are about to drop the column `key` on the `idempotencykey` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[idemKey]` on the table `idempotencykey` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idemKey` to the `idempotencykey` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `idempotencykey` DROP FOREIGN KEY `IdempotencyKey_bookingId_fkey`;

-- DropIndex
DROP INDEX `IdempotencyKey_key_key` ON `idempotencykey`;

-- AlterTable
ALTER TABLE `idempotencykey` DROP COLUMN `key`,
    ADD COLUMN `idemKey` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `idempotencykey_idemKey_key` ON `idempotencykey`(`idemKey`);

-- AddForeignKey
ALTER TABLE `idempotencykey` ADD CONSTRAINT `idempotencykey_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `idempotencykey` RENAME INDEX `IdempotencyKey_bookingId_key` TO `idempotencykey_bookingId_key`;
