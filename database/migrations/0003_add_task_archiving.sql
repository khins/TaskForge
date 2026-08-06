ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at);
