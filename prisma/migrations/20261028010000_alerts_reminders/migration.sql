ALTER TABLE "faculty_issue" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "acknowledged_at" TIMESTAMPTZ(6), ADD COLUMN "resolved_at" TIMESTAMPTZ(6),
  ADD COLUMN "resolution_note" TEXT, ADD COLUMN "updated_by_id" UUID;
ALTER TABLE "faculty_issue" ADD CONSTRAINT "faculty_issue_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "app_user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "faculty_issue_kind_status_observation_id_idx" ON "faculty_issue"("kind", "status", "observation_id");
CREATE TABLE "reminder_dispatch" (
  "dispatch_id" UUID PRIMARY KEY, "cycle_id" UUID NOT NULL, "created_by_id" UUID NOT NULL,
  "request_hash" TEXT NOT NULL, "recipient_count" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_dispatch_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycle"("cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reminder_dispatch_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "permission"("permission_id", "permission_name") VALUES ('45c260d7-b6b4-4899-aec0-fb2dbb91920c','alerts.manage') ON CONFLICT ("permission_name") DO NOTHING;
WITH granted AS (
 INSERT INTO "role_permission"("role_id","permission_id") SELECT r."role_id", p."permission_id" FROM "role" r CROSS JOIN "permission" p WHERE r."role_name" IN ('AC','Admin') AND p."permission_name"='alerts.manage' ON CONFLICT DO NOTHING RETURNING "role_id"
) UPDATE "role" SET "revision"="revision"+1 WHERE "role_id" IN (SELECT "role_id" FROM granted);
