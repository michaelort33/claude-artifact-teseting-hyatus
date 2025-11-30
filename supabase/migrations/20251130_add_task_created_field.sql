-- Add task_created field to track when a task has been created for a reward
ALTER TABLE review_rewards ADD COLUMN IF NOT EXISTS task_created BOOLEAN DEFAULT FALSE;
ALTER TABLE review_rewards ADD COLUMN IF NOT EXISTS task_id TEXT;

-- Add index for filtering by task_created status
CREATE INDEX IF NOT EXISTS idx_review_rewards_task_created ON review_rewards(task_created);

COMMENT ON COLUMN review_rewards.task_created IS 'Whether a task has been created for this reward via the Tasks API';
COMMENT ON COLUMN review_rewards.task_id IS 'The ID of the task created via the Tasks API';
