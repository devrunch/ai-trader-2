-- A fired task waits in a work queue: run_state idle/queued/running, and pending_fire is what the worker runs (kept so a lost job can be queued again).
ALTER TABLE agent_tasks ADD COLUMN run_state text NOT NULL DEFAULT 'idle';
ALTER TABLE agent_tasks ADD COLUMN run_state_at timestamptz;
ALTER TABLE agent_tasks ADD COLUMN pending_fire jsonb;
