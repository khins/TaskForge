ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS parent_task_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_tasks_parent_task'
    ) THEN
        ALTER TABLE tasks
            ADD CONSTRAINT fk_tasks_parent_task
            FOREIGN KEY (parent_task_id)
            REFERENCES tasks(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
