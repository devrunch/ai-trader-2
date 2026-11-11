-- User alerts are tasks in 'notify' mode: the same edge-triggered conditions, but a fire writes a notification and runs no model.
ALTER TABLE agent_tasks ADD COLUMN mode text NOT NULL DEFAULT 'agent' CHECK (mode IN ('agent', 'notify'));
--> statement-breakpoint
ALTER TABLE agent_tasks ALTER COLUMN thread_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_thread_for_agent CHECK (mode = 'notify' OR thread_id IS NOT NULL);
--> statement-breakpoint
ALTER TABLE agent_tasks DROP CONSTRAINT agent_tasks_instruction_check;
--> statement-breakpoint
ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_instruction_check CHECK (length(instruction) <= 2000 AND (mode = 'notify' OR length(instruction) >= 1));
--> statement-breakpoint
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
--> statement-breakpoint
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('task', 'fill', 'system', 'alert'));
