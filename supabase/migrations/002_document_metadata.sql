-- Migration 002: Add document metadata to ledger_batches
-- Stores storage bucket, path, original filename, MIME type, file size, and upload timestamp
-- so the database record and Storage object never become disconnected.

ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'ledger-documents';
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT 'application/pdf';
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE;

-- Create an index on storage_path for fast lookups and orphan detection
CREATE INDEX IF NOT EXISTS idx_ledger_batches_storage_path ON ledger_batches (storage_path);

-- Migrate existing data: extract original_filename from original_pdf_url
UPDATE ledger_batches 
SET original_filename = CASE
  WHEN original_pdf_url IS NOT NULL AND original_pdf_url LIKE 'http%' 
    THEN split_part(original_pdf_url, '/', -1)
  WHEN original_pdf_url IS NOT NULL 
    THEN original_pdf_url
  ELSE NULL
END,
uploaded_at = created_at
WHERE original_filename IS NULL;
