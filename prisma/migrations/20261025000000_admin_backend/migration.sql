ALTER TABLE "app_user" ALTER COLUMN "username" DROP NOT NULL;
ALTER TABLE "app_user" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "role" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "hiring_level" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "hiring_level" ADD CONSTRAINT "hiring_level_positive_interval" CHECK ("evaluation_interval_years" > 0);
