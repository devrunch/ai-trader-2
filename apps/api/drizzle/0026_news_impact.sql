-- Rule-based impact tagging for headlines; rows stored before this keep impact 'low' with no moves.
ALTER TABLE news_items ADD COLUMN impact text NOT NULL DEFAULT 'low';
ALTER TABLE news_items ADD COLUMN moves text[] NOT NULL DEFAULT '{}';
ALTER TABLE news_items ADD COLUMN direction text;
