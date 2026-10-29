ALTER TABLE "notification" ADD COLUMN "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email_requested" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "notification_email" (
  "notification_id" UUID PRIMARY KEY REFERENCES "notification"("notification_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','sending','sent','failed','skipped')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_token" UUID,
  "lease_until" TIMESTAMPTZ,
  "sent_at" TIMESTAMPTZ,
  "last_error" TEXT
);
CREATE INDEX "notification_email_status_next_attempt_at_idx" ON "notification_email"("status","next_attempt_at");
-- Both Prisma and legacy pg writers insert notifications inside their workflow
-- transaction. An INSERT-only trigger keeps this outbox atomic for both paths.
-- No historical backfill, and no email on read-state updates or event upserts.
CREATE FUNCTION enqueue_notification_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email_requested THEN
    EXECUTE format('INSERT INTO %I.notification_email (notification_id) VALUES ($1) ON CONFLICT DO NOTHING', TG_TABLE_SCHEMA)
      USING NEW.notification_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notification_email_insert AFTER INSERT ON "notification"
  FOR EACH ROW EXECUTE FUNCTION enqueue_notification_email();
