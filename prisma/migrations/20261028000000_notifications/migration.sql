ALTER TABLE "notification"
  ADD COLUMN "target_kind" TEXT,
  ADD COLUMN "target_id" UUID,
  ADD COLUMN "event_key" TEXT;
CREATE UNIQUE INDEX "notification_user_id_event_key_key" ON "notification"("user_id", "event_key");
CREATE INDEX "notification_user_id_created_at_notification_id_idx" ON "notification"("user_id", "created_at", "notification_id");
CREATE INDEX "notification_user_id_is_read_idx" ON "notification"("user_id", "is_read");
-- Preserve existing read evidence. Unknown historical read times are normalized at
-- migration time; this timestamp is not claimed to be the original opening time.
UPDATE "notification" SET "is_read" = true WHERE "read_at" IS NOT NULL;
UPDATE "notification" SET "read_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC' WHERE "is_read" AND "read_at" IS NULL;
ALTER TABLE "notification" ADD CONSTRAINT "notification_read_state_check" CHECK ("is_read" = ("read_at" IS NOT NULL));
ALTER TABLE "notification" ADD CONSTRAINT "notification_target_check" CHECK (
  ("target_kind" IS NULL AND "target_id" IS NULL) OR
  ("target_kind" IS NOT NULL AND "target_kind" = 'observation' AND "target_id" IS NOT NULL)
);
