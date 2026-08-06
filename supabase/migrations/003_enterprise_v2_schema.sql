-- Migration 003: Enterprise V2 Schema Update

-- 1. Create Documents & Pages Hierarchy (Issue 5 & 6)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES ledger_batches(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    checksum TEXT,
    file_size_bytes BIGINT,
    mime_type TEXT DEFAULT 'application/pdf',
    version INT DEFAULT 1,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    status TEXT CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'VERIFIED')) DEFAULT 'QUEUED',
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Isolate OCR Results (Issue 2)
CREATE TABLE IF NOT EXISTS ocr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES document_pages(id) ON DELETE CASCADE,
    raw_json JSONB NOT NULL,
    confidence_scores JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Audit Trail Engine (Issue 3)
CREATE TABLE IF NOT EXISTS ledger_change_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT CHECK (entity_type IN ('ledger', 'transaction')) NOT NULL,
    entity_id UUID NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    edited_by UUID, 
    edited_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    reason TEXT
);

-- 4. Update Batch Lifecycle Statuses (Issue 7 & Enterprise Workflow)
ALTER TABLE ledger_batches DROP CONSTRAINT IF EXISTS ledger_batches_status_check;
ALTER TABLE ledger_batches ADD CONSTRAINT ledger_batches_status_check 
CHECK (status IN (
    'UPLOADED', 'VALIDATING', 'READY_FOR_OCR', 
    'OCR_PROCESSING', 'OCR_COMPLETE', 'HUMAN_REVIEW', 
    'CHANGES_REQUIRED', 'REVIEW_COMPLETE', 'VERIFIED', 
    'LOCKED', 'ARCHIVED'
));

-- 5. Add Soft Delete Columns to existing tables (Issue 14)
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ledger_batches ADD COLUMN IF NOT EXISTS deleted_by UUID;

ALTER TABLE daily_ledgers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE daily_ledgers ADD COLUMN IF NOT EXISTS deleted_by UUID;
-- FK to page_id for mapping
ALTER TABLE daily_ledgers ADD COLUMN IF NOT EXISTS page_id UUID REFERENCES document_pages(id);

ALTER TABLE ledger_transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ledger_transactions ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- 6. Transition Transactions to UUID (Issue 8)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ledger_transactions' AND column_name='id') THEN
    ALTER TABLE ledger_transactions ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
  END IF;
END $$;
