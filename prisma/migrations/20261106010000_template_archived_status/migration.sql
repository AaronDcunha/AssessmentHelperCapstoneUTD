-- Used and published templates are retained as archived history rather than
-- permanently deleted. Extend the existing status invariant accordingly.
ALTER TABLE "observation_template"
  DROP CONSTRAINT "observation_template_status";

ALTER TABLE "observation_template"
  ADD CONSTRAINT "observation_template_status"
  CHECK ("status" IN ('draft', 'published', 'archived'));
