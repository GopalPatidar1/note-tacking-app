-- Add GIN expression index for PostgreSQL full-text search on notes
CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_fts_idx
  ON notes
  USING GIN (to_tsvector('english', title || ' ' || content));
