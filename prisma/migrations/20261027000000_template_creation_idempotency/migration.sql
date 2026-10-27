ALTER TABLE "observation_template"
ADD COLUMN "creation_key" UUID,
ADD COLUMN "creation_hash" TEXT;

CREATE UNIQUE INDEX "observation_template_creation_key_key"
ON "observation_template"("creation_key");
