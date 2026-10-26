-- Preserve existing semester records; unknown boundaries remain unset.
ALTER TABLE semester ADD COLUMN starts_on date, ADD COLUMN ends_on date,
  ADD COLUMN time_zone text NOT NULL DEFAULT 'America/Chicago', ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE semester ADD CONSTRAINT semester_dates_order CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on);
ALTER TABLE evaluation_cycle ADD COLUMN revision integer NOT NULL DEFAULT 0;
-- Fails safely if legacy data has duplicate semesters; never deletes cycles.
CREATE UNIQUE INDEX evaluation_cycle_semester_id_key ON evaluation_cycle(semester_id);
ALTER TABLE observation_template ADD COLUMN revision integer NOT NULL DEFAULT 0,
  ADD COLUMN status text NOT NULL DEFAULT 'draft', ADD COLUMN published_at timestamptz,
  ADD COLUMN comment_prompts jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN signature_labels jsonb NOT NULL DEFAULT '{"observer":"Observer","observee":"Observee"}';
UPDATE observation_template SET status = 'published', published_at = created_at AT TIME ZONE 'UTC' WHERE is_active;
ALTER TABLE observation_template ADD CONSTRAINT observation_template_status CHECK (status IN ('draft', 'published'));
ALTER TABLE template_criterion ADD COLUMN criterion_key text, ADD COLUMN options jsonb;
UPDATE template_criterion SET criterion_key = criterion_id::text;
UPDATE template_criterion c SET options = (
  SELECT jsonb_agg(jsonb_build_object('value', n, 'label', n::text) ORDER BY n)
  FROM generate_series(c.min_rating, c.max_rating) n
) WHERE question_type = 'RATING';
ALTER TABLE template_criterion ALTER COLUMN criterion_key SET NOT NULL;
CREATE UNIQUE INDEX template_criterion_template_id_criterion_key_key ON template_criterion(template_id, criterion_key);
