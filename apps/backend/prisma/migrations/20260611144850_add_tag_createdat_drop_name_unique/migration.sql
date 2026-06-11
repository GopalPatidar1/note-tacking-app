-- DropIndex
DROP INDEX "tags_userId_name_key";

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
