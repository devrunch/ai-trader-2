-- News and event watches remember the headline and release ids they already reported; every run records how it ended.
ALTER TABLE agent_tasks ADD COLUMN last_outcome text;
ALTER TABLE agent_tasks ADD COLUMN seen text[] NOT NULL DEFAULT '{}';
