-- Add optimistic concurrency to signups and bind every observation to the
-- published template selected when the observation is created.
ALTER TABLE "evaluation_signup" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "observation" ADD COLUMN "assigned_template_id" UUID;
ALTER TABLE "observation_template" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
ALTER TABLE "signed_assessment" ADD COLUMN "template_snapshot" JSONB;
ALTER TABLE "signed_assessment" ADD COLUMN "response_archive" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Existing assessments are authoritative for their observation assignment.
UPDATE "observation" o
SET "assigned_template_id" = a."template_id"
FROM "signed_assessment" a
WHERE a."observation_id" = o."observation_id";

-- Existing blank observations previously selected the newest published active
-- template at first form load. Preserve that behavior once during migration.
UPDATE "observation" o
SET "assigned_template_id" = current_template."template_id"
FROM LATERAL (
  SELECT t."template_id"
  FROM "observation_template" t
  WHERE t."status" = 'published' AND t."is_active" = true
  ORDER BY t."published_at" DESC NULLS LAST, t."template_id" DESC
  LIMIT 1
) current_template
WHERE o."assigned_template_id" IS NULL;

ALTER TABLE "observation" ADD CONSTRAINT "observation_assigned_template_id_fkey"
  FOREIGN KEY ("assigned_template_id") REFERENCES "observation_template"("template_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "observation_assigned_template_id_idx" ON "observation"("assigned_template_id");

-- Freeze the complete displayed template for every assessment that already has
-- an acknowledgement. Answers and acknowledgement timestamps remain in their
-- existing immutable assessment columns.
UPDATE "signed_assessment" a
SET "template_snapshot" = jsonb_build_object(
  'id', t."template_id",
  'title', t."template_name",
  'description', t."description",
  'revision', t."revision",
  'criteria', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c."criterion_id", 'key', c."criterion_key", 'prompt', c."criterion_text",
      'type', c."question_type", 'required', c."is_required",
      'order', c."display_order", 'weight', c."weight", 'options', c."options"
    ) ORDER BY c."display_order", c."criterion_id")
    FROM "template_criterion" c WHERE c."template_id" = t."template_id"
  ), '[]'::jsonb),
  'commentPrompts', t."comment_prompts",
  'signatureLabels', t."signature_labels"
)
FROM "observation_template" t
WHERE t."template_id" = a."template_id"
  AND (a."observer_signed_at" IS NOT NULL OR a."observee_signed_at" IS NOT NULL OR a."is_locked" = true);

-- Destructive workflow permissions remain separate from read/generation grants.
INSERT INTO "permission" ("permission_id", "permission_name") VALUES
  ('e41e693b-8976-4a86-a2df-059812b3bdc7', 'signups.delete'),
  ('e49e47d9-5c4e-47fa-9289-fae016f09b0a', 'observations.delete')
ON CONFLICT ("permission_name") DO NOTHING;

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."role_id", p."permission_id"
FROM "role" r CROSS JOIN "permission" p
WHERE r."role_name" IN ('AC', 'Admin')
  AND p."permission_name" IN ('signups.delete', 'observations.delete')
ON CONFLICT DO NOTHING;
