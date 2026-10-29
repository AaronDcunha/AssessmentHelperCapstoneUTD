-- Preserve existing reports; NOT_OCCURRED retains the fixed initial occurrence.
ALTER TABLE "faculty_issue" ADD COLUMN "occurrence_key" TEXT NOT NULL DEFAULT 'initial';
ALTER TABLE "faculty_issue" DROP CONSTRAINT "faculty_issue_observation_id_reported_by_kind_key";
CREATE UNIQUE INDEX "faculty_issue_observation_reporter_kind_occurrence_key"
  ON "faculty_issue"("observation_id", "reported_by", "kind", "occurrence_key");
