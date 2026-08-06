# Data Integrity & Diagnostic Procedures

The Ledger Automation system manages thousands of interconnected records spanning PDFs, batches, ledgers, and transactions. Maintaining strict referential integrity is critical. 

This document outlines the common data integrity checks performed by the system's Diagnostic Audit Tool, and how to handle any anomalies that are detected.

## The Diagnostic Tool

The built-in Diagnostic Dashboard performs a **safe, read-only** audit of the Supabase PostgreSQL database and the Supabase Storage buckets. 

**It will never automatically delete or modify records.** It solely identifies orphans, mismatches, or corruptions and flags them for an admin to resolve manually.

## Analyzed Conditions

### 1. Duplicate Batches
- **Description:** Multiple batch records exist with the exact same Branch ID, Year, Month, and Book Category.
- **Impact:** Causes duplicate ledgers to appear in reports and matrix UI.
- **Resolution:** An admin should manually review the duplicates in Supabase. Identify the correct, fully-processed batch (usually the one with `status: verified`) and manually delete the duplicate from the `ledger_batches` table. Deletion will cascade to ledgers and transactions.

### 2. Missing Daily Ledgers
- **Description:** A batch marked as `verified` contains fewer than 28 daily ledger records. (A normal month contains 28–31 days).
- **Impact:** Reports will have missing data for that month.
- **Resolution:** The document may have been scanned incompletely. Use the application UI to find the batch and click "Reprocess" to run OCR on the missing pages, or manually verify them in the Review view.

### 3. Orphaned Transactions
- **Description:** A record in `ledger_transactions` exists but its parent `ledger_id` does not exist in `daily_ledgers`.
- **Impact:** Clutters database; transaction will never surface in the UI.
- **Resolution:** Can be safely deleted from Supabase. (Normally prevented by Foreign Key constraints, but can happen if constraints were temporarily dropped).

### 4. Orphaned Ledgers
- **Description:** A record in `daily_ledgers` exists but its parent `batch_id` does not exist in `ledger_batches`.
- **Impact:** Will never surface in the UI. 
- **Resolution:** Can be safely deleted.

### 5. Storage Mismatches
- **Database record without PDF:** A batch references a PDF URL in Supabase Storage, but the file no longer exists in the bucket.
  - **Resolution:** The user will need to re-upload the PDF document via the UI.
- **PDF without Database record:** A PDF file exists in the Supabase Storage bucket, but no batch record references it.
  - **Resolution:** Safe to manually delete from Storage to free up space.

### 6. Invalid Data Signatures
- **Description:** A batch has a year out of bounds (e.g. `< 2000` or `> 2100`), or a month out of bounds (e.g. `< 1` or `> 12`).
- **Impact:** Matrix UI will break or fail to render the batch.
- **Resolution:** Manually edit the `year` or `month` column in the `ledger_batches` table via the Supabase dashboard.

## Security Considerations
The Diagnostic Tool executes queries client-side using the authenticated user's session.
To successfully list files in the Storage bucket (checking for orphans), the Supabase Storage bucket `documents` must have a permissive `SELECT` policy allowing `bucket_id = 'documents'`. If restricted, the Storage check will gracefully skip and report an access warning.
