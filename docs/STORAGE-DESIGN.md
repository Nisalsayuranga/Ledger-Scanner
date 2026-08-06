# Storage Design: Ledger Scanner

## Bucket Structure

All original scanned PDFs are stored in a single Supabase Storage bucket: `ledger-documents`.

```
ledger-documents/
  {branch_id}/
    {year}/
      {month}/
        {batch_id}/
          original/
            {batch_id}.pdf
```

**Key design decisions:**
- The `batch_id` (UUID from the database) is the storage path anchor, NOT the filename.
- Every upload path is globally unique because it contains a UUID.
- Original filenames are preserved in the database only, never in the storage path.
- `upsert: false` is enforced — accidental overwrites are impossible.

## Path Strategy

| Component | Source | Example |
|-----------|--------|---------|
| `branch_id` | UUID from `branches` table | `a1b2c3d4-...` |
| `year` | From upload metadata | `2025` |
| `month` | From upload metadata (zero-padded) | `01` |
| `batch_id` | UUID from `ledger_batches` table | `e5f6g7h8-...` |
| Filename | Always `{batch_id}.pdf` | `e5f6g7h8-....pdf` |

Example full path:
```
a1b2c3d4-.../2025/01/e5f6g7h8-.../original/e5f6g7h8-....pdf
```

## Lifecycle

1. **Database record created FIRST** with status `uploaded` and `original_pdf_url = NULL`.
2. **File uploaded to Storage** using the batch UUID as path anchor.
3. **Database record updated** with the resolved `original_pdf_url` (public URL).
4. If upload fails, the database record exists with `status = 'failed'` and `original_pdf_url = NULL`. The user can retry.
5. If database insert fails after upload succeeds, the orphaned file is cleaned up automatically.

## Failure Handling

| Failure Scenario | Recovery |
|-----------------|----------|
| Upload succeeds, DB insert fails | Delete orphaned Storage object, return error |
| DB insert succeeds, upload fails | Record exists with `status='failed'`, `original_pdf_url=NULL`. User retries upload. |
| Network timeout during upload | Batch stays `uploaded` with no URL. Retry-safe because path uses UUID (no collision). |
| Duplicate upload attempt | Each attempt creates a NEW batch UUID → NEW storage path. No collision possible. |

## Duplicate Handling

Duplicates are impossible by design:
- Every upload generates a fresh `ledger_batches` UUID.
- The Storage path includes this UUID.
- `upsert: false` rejects any path collision (which cannot happen with UUIDs).
- Two laptops uploading the same PDF for the same branch/month simply create two independent batches.

## Recovery Strategy

- **Orphaned Storage files** (file exists but no DB record): Can be detected by listing Storage objects and cross-referencing batch UUIDs against the database. A cleanup script can be run periodically.
- **Ghost DB records** (record exists but file missing): Detected by checking `original_pdf_url IS NULL` where `status != 'failed'`. These can be re-uploaded.
- **Stuck processing**: Records with `status = 'processing'` older than 30 minutes can be reset to `uploaded` for retry.
