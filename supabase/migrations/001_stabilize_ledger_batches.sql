-- Migration 001: Stabilize Ledger Batches
-- 1. Drop problematic unique constraint that prevents multiple batches for same month
ALTER TABLE ledger_batches 
DROP CONSTRAINT IF EXISTS ledger_batches_branch_id_year_month_book_category_key;

-- 2. Expand status ENUM/CHECK constraint
ALTER TABLE ledger_batches DROP CONSTRAINT IF EXISTS ledger_batches_status_check;

UPDATE ledger_batches SET status = 'uploaded' WHERE status = 'pending';
UPDATE ledger_batches SET status = 'failed' WHERE status = 'error';
UPDATE ledger_batches SET status = 'needs_review' WHERE status = 'completed';

ALTER TABLE ledger_batches ADD CONSTRAINT ledger_batches_status_check 
CHECK (status IN ('uploaded', 'processing', 'needs_review', 'verified', 'failed'));

-- 3. Add verification tracking fields
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS verified_by TEXT;
