# Bulk Upload Workflow

The Bulk Document Upload Workflow is designed to handle mass ingestion of daily ledger PDF scans across all branches reliably, with high visibility and independent failure domains.

## Architecture

1. **`BulkUploadQueue.ts` (Service Layer)**
   - Acts as a state machine and sequential task runner independent of React rendering cycles.
   - Manages an array of `QueueItem` objects.
   - Publishes updates via a simple pub/sub `subscribe` mechanism to keep the UI in sync without prop-drilling or blocking the main thread.
   - Processes files sequentially.

2. **`BulkPdfUploader.tsx` (UI Layer)**
   - Provides a dual-view interface:
     - **Select View**: For dropping in up to 50 PDFs.
     - **Queue View**: For live monitoring of the upload queue.
   - Subscribes to `BulkUploadQueue` and renders progress bars, status badges, and error messages in real time.
   - Closes and triggers `App.fetchBatches()` to refresh the dashboard when the user is finished.

## File Lifecycle Statuses

- **`QUEUED`**: The file has been selected, metadata parsed, and is waiting its turn to upload.
- **`UPLOADING`**: The file is actively being written to Supabase Storage.
- **`DUPLICATE`**: The system detected an existing batch with the exact same Branch, Year, Month, and Category. The upload was safely aborted to prevent data loss or overwrites.
- **`UPLOADED`**: The file was successfully written to Storage and its metadata recorded in the database. It is now ready for background OCR.
- **`FAILED`**: The upload encountered an error (e.g. network failure). The file remains in the queue.
- **`RETRYING`**: The user clicked the "Retry" button on a failed file. It is placed back in line.

## Duplicate Detection Strategy

Before a file ever touches the network for upload, `BatchService.checkIfBatchExists()` queries the Supabase database. If it finds a match for `(branch_id, year, month, book_category)`, it immediately halts the upload for that specific file and marks it as `DUPLICATE`. 

This guarantees that bulk uploading 50 files where 5 already exist will gracefully skip the 5 and successfully process the other 45.

## OCR Decoupling

Crucially, the Bulk Upload workflow does **not** trigger OCR extraction. It strictly handles Storage uploads and Database batch creation (`status: 'uploaded'`). 

A separate background worker loop in `App.tsx` constantly polls for `uploaded` batches and runs them through the Gemini OCR engine one at a time, ensuring the system does not get rate-limited by bulk drops.
