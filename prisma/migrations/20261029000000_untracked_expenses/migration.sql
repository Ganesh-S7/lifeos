-- AlterTable
ALTER TABLE `finance_transactions` ADD COLUMN `isUntracked` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `accountId` VARCHAR(191) NULL;
