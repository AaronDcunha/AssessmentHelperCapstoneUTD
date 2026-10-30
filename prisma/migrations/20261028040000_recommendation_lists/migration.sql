-- Coordinate deployment of all readers/writers and pause the invitation scheduler.
-- No existing candidate, invitation, response, approval, selection or assessment
-- is deleted or rewritten. List identity below is an import identity, not proof
-- of an original generation time or of any lost historical generations.
BEGIN;
LOCK TABLE observation, observation_candidate IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE observation ADD COLUMN current_draft_list_id uuid,
  ADD COLUMN current_released_list_id uuid;
ALTER TABLE observation_candidate ADD COLUMN recommendation_list_id uuid;

CREATE TABLE recommendation_list (
  list_id uuid PRIMARY KEY,
  observation_id uuid NOT NULL,
  generation_id uuid,
  generated_at timestamptz(6),
  published_at timestamptz(6),
  origin text NOT NULL DEFAULT 'GENERATED',
  recorded_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX recommendation_list_list_id_observation_id_key ON recommendation_list(list_id, observation_id);
CREATE INDEX recommendation_list_observation_id_idx ON recommendation_list(observation_id);
CREATE INDEX recommendation_list_generation_id_idx ON recommendation_list(generation_id);

-- One surviving set per observation, including known generated/released empty
-- lists. Missing release markers never become released merely due to invitations.
INSERT INTO recommendation_list(list_id, observation_id, generation_id, published_at, origin)
SELECT o.observation_id, o.observation_id, o.recommendation_generation_id,
  o.recommendations_released_at, 'LEGACY_IMPORT'
FROM observation o
WHERE o.recommendation_generation_id IS NOT NULL OR o.recommendations_released_at IS NOT NULL
  OR EXISTS (SELECT 1 FROM observation_candidate c WHERE c.observation_id = o.observation_id);

UPDATE observation_candidate SET recommendation_list_id = observation_id;
UPDATE observation SET current_released_list_id = observation_id
WHERE recommendations_released_at IS NOT NULL;
UPDATE observation SET current_draft_list_id = observation_id
WHERE recommendations_released_at IS NULL AND recommendation_generation_id IS NOT NULL;
-- Candidate-only sets without generation/release evidence remain imported but
-- unpointed. AC can review them explicitly by listId; no Faculty access is added.

ALTER TABLE observation_candidate ALTER COLUMN recommendation_list_id SET NOT NULL;
DROP INDEX observation_candidate_observation_id_professor_id_key;
CREATE UNIQUE INDEX observation_candidate_recommendation_list_id_professor_id_key ON observation_candidate(recommendation_list_id, professor_id);
CREATE INDEX observation_candidate_observation_id_idx ON observation_candidate(observation_id);
CREATE UNIQUE INDEX observation_current_draft_list_id_observation_id_key ON observation(current_draft_list_id, observation_id);
CREATE UNIQUE INDEX observation_current_released_list_id_observation_id_key ON observation(current_released_list_id, observation_id);

ALTER TABLE recommendation_list ADD CONSTRAINT recommendation_list_observation_id_fkey
  FOREIGN KEY (observation_id) REFERENCES observation(observation_id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE observation_candidate ADD CONSTRAINT observation_candidate_recommendation_list_id_observation_i_fkey
  FOREIGN KEY (recommendation_list_id, observation_id) REFERENCES recommendation_list(list_id, observation_id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE observation ADD CONSTRAINT observation_current_draft_list_id_observation_id_fkey
  FOREIGN KEY (current_draft_list_id, observation_id) REFERENCES recommendation_list(list_id, observation_id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE observation ADD CONSTRAINT observation_current_released_list_id_observation_id_fkey
  FOREIGN KEY (current_released_list_id, observation_id) REFERENCES recommendation_list(list_id, observation_id) ON DELETE RESTRICT ON UPDATE NO ACTION;
COMMIT;
