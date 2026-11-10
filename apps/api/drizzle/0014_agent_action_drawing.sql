-- Server-computed geometry for drawing cards (FR-AG-6).
ALTER TABLE agent_actions ADD COLUMN drawing jsonb;
