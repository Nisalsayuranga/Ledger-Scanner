# Persistence Flow Architecture

## Single Source of Truth
The Ledger Scanner application uses Supabase as the exclusive, single source of truth for all permanent records. We have formally removed all dependencies on IndexedDB for permanent storage. IndexedDB or local memory is only used for temporary application state that can be safely discarded upon refresh.

## Modular Service Architecture
All database interactions run through a clean, layered service architecture located in `src/services/api/`:
- **BranchService**: Maps legacy branch names to database Branch UUIDs.
- **BatchService**: Manages the overarching Ledger Batches, updating their statuses and handling document URLs.
- **DocumentService**: Handles the Supabase Storage upload, associating PDFs with a specific Batch.
- **LedgerService**: Handles idempotent `UPSERT` operations for daily ledger summary data.
- **TransactionService**: Handles idempotent `UPSERT` operations for individual line-item transactions.
- **VerificationService**: Orchestrates the final transition when a user reviews and validates a processed batch.

## Reliability and Idempotency Strategy
- All batch creation is idempotent, using a `UNIQUE(branch_id, batch_month, book_category)`. If a user clicks Save twice, no duplicate batch is created.
- All ledger pages are idempotent, using `UNIQUE(batch_id, day_number)`. Repeated OCR scans overwrite the existing row without duplication.
- All transactions are idempotent, using `UNIQUE(daily_ledger_id, row_order)`.

## Processing Lifecycle States
The system models batch processing with an explicit state machine, managed via the `status` column constrained by Postgres:

1. **`upload`**: A new batch is registered in the database, but no files are attached yet.
2. **`uploaded`**: The PDF document has been successfully placed into Supabase Storage. The background processor picks it up here.
3. **`processing`**: The background queue is actively running Gemini OCR on this batch.
4. **`needs_review`**: OCR has completed successfully. Data is safely stored in Supabase, but must be checked.
5. **`verified`**: The user has explicitly completed manual verification and saved the results. Data is now locked/confirmed.
6. **`failed`**: The background OCR process threw an exception, or the network failed midway. The user can safely retry without corrupting existing data.

## Failure Scenarios
- **Network fails during save**: No data is corrupted. Idempotent keys mean retrying will simply overwrite partially saved fields correctly.
- **OCR fails halfway**: The batch state transitions to `failed`. Since ledgers are upserted sequentially, the data already saved remains intact, preserving enough information to resume or debug.
- **Verification guarantees**: A batch is *never* marked `verified` automatically. Manual completion is strictly required.
