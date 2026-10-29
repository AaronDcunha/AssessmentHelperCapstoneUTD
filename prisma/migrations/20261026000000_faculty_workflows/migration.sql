-- Additive only. Existing records and assessment/template links are retained.
ALTER TABLE observation ADD COLUMN workflow_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN recommendation_generation_id uuid,
  ADD COLUMN recommendations_released_at timestamptz,
  ADD COLUMN scheduled_ends_at timestamptz;
ALTER TABLE observation_time_option ADD COLUMN starts_at timestamptz,
  ADD COLUMN ends_at timestamptz, ADD COLUMN time_zone text, ADD COLUMN location text;
ALTER TABLE observation_time_option ADD CONSTRAINT option_time_order CHECK
  ((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at));
ALTER TABLE observation_candidate ADD COLUMN accepted_option_id uuid
  REFERENCES observation_time_option(time_option_id) ON DELETE RESTRICT;
CREATE TABLE invitation_attempt (
  attempt_id uuid PRIMARY KEY, candidate_id uuid NOT NULL REFERENCES observation_candidate(candidate_id) ON DELETE RESTRICT,
  number integer NOT NULL, invited_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  responded_at timestamptz, status text NOT NULL DEFAULT 'PENDING',
  CONSTRAINT invitation_attempt_candidate_id_number_key UNIQUE(candidate_id, number),
  CHECK (number > 0), CHECK (expires_at > invited_at)
);
-- Retain the pre-migration invitation window as attempt 1 where it is valid.
INSERT INTO invitation_attempt(attempt_id,candidate_id,number,invited_at,expires_at,responded_at,status)
SELECT candidate_id,candidate_id,1,invited_at AT TIME ZONE 'UTC',expires_at AT TIME ZONE 'UTC',responded_at AT TIME ZONE 'UTC',status
FROM observation_candidate WHERE invited_at IS NOT NULL AND expires_at > invited_at;
CREATE TABLE late_acceptance_approval (
  approval_id uuid PRIMARY KEY, attempt_id uuid NOT NULL UNIQUE REFERENCES invitation_attempt(attempt_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING', reason text, requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz, decided_by uuid
);
CREATE TABLE faculty_issue (
  issue_id uuid PRIMARY KEY, observation_id uuid NOT NULL REFERENCES observation(observation_id) ON DELETE RESTRICT,
  reported_by uuid NOT NULL REFERENCES app_user(user_id) ON DELETE RESTRICT, kind text NOT NULL,
  reason text NOT NULL, details text NOT NULL, status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_issue_observation_id_reported_by_kind_key UNIQUE(observation_id,reported_by,kind),
  CHECK (kind IN ('ALERT','NOT_OCCURRED'))
);
CREATE TABLE feedback_attachment (
  attachment_id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES app_user(user_id) ON DELETE RESTRICT,
  observation_id uuid NOT NULL REFERENCES observation(observation_id) ON DELETE RESTRICT,
  feedback_id uuid REFERENCES process_feedback(feedback_id) ON DELETE RESTRICT,
  original_name text NOT NULL, content_type text NOT NULL, size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  storage_key uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
