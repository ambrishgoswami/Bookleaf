-- CreateEnum
CREATE TYPE "DraftSource" AS ENUM ('AI', 'TEMPLATE');

-- AlterTable
ALTER TABLE "AiDraft" ADD COLUMN     "messageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" "DraftSource" NOT NULL DEFAULT 'AI',
ADD COLUMN     "suggestedActions" TEXT[],
ALTER COLUMN "model" DROP NOT NULL;
