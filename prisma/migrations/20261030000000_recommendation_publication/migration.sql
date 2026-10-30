-- Additive. Unknown legacy selection/response metadata stays NULL. No historical
-- generations, responses, assignments or actors are inferred or rewritten.
BEGIN;
ALTER TABLE observation ADD COLUMN observer_selected_at timestamptz(6),
  ADD COLUMN observer_selected_by_id uuid;
ALTER TABLE observation_candidate ADD COLUMN cancelled_at timestamptz(6);
ALTER TABLE invitation_attempt ADD COLUMN cancelled_at timestamptz(6),
  ADD COLUMN superseded_by_list_id uuid, ADD COLUMN accepted_option_id uuid;
ALTER TABLE invitation_attempt ADD CONSTRAINT invitation_attempt_accepted_option_id_fkey
  FOREIGN KEY (accepted_option_id) REFERENCES observation_time_option(time_option_id) ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TABLE recommendation_operation (
  request_key uuid PRIMARY KEY, actor_id uuid NOT NULL, scope_id uuid NOT NULL,
  kind text NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL,
  recorded_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX recommendation_operation_scope_id_idx ON recommendation_operation(scope_id);
CREATE TABLE observation_assignment_history (
  history_id uuid PRIMARY KEY, observation_id uuid NOT NULL, professor_id uuid NOT NULL,
  recommendation_list_id uuid, candidate_id uuid, meeting_option_id uuid, time_zone text, location text,
  scheduled_at timestamptz(6), scheduled_ends_at timestamptz(6),
  selected_at timestamptz(6), selected_by_id uuid, ended_at timestamptz(6) NOT NULL,
  ended_by_id uuid NOT NULL, replacement_list_id uuid NOT NULL,
  CONSTRAINT observation_assignment_history_observation_id_fkey FOREIGN KEY (observation_id)
    REFERENCES observation(observation_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX observation_assignment_history_observation_id_ended_at_idx ON observation_assignment_history(observation_id, ended_at);
COMMIT;
