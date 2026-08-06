# Ledger Scanner Database Design

## 1. Tables Overview

The system strictly isolates each ledger upload into a unique `ledger_batch`, which propagates down to `daily_ledgers` and `ledger_transactions`. 

### `branches`
- **Purpose**: A reference table representing the 11-13 physical company branches.
- **Key Fields**: `id` (UUID), `branch_name` (Unique TEXT).
- **Constraints**: `UNIQUE(branch_name)`.

### `ledger_batches`
- **Purpose**: Represents a single independent document/scan session. Serves as the authoritative parent record for all extracted data from that PDF.
- **Key Fields**: 
  - `id`: Permanent UUID identifier for the scan.
  - `branch_id`: Foreign Key to `branches`.
  - `batch_month`, `year`, `month`: Temporal classification.
  - `book_category`: Physical ledger classification (e.g., `lr_book`, `m_book`).
  - `original_pdf_url`: The link to the raw document in Supabase Storage.
  - `status`: The processing lifecycle state.
  - `verified_at`: Timestamp for human validation.
  - `verified_by`: Auditor tracking (when auth is implemented).
- **Relationships**: Parent of `daily_ledgers`.

### `daily_ledgers`
- **Purpose**: Represents a single summarized day (page) within the batch.
- **Key Fields**: `day_number`, `date`, `cp_balance`, cash metrics, `page_image_url`, `is_validated`.
- **Relationships**: Child of `ledger_batches`. Parent of `ledger_transactions`.

### `ledger_transactions`
- **Purpose**: Line-item level details parsed via OCR.
- **Key Fields**: `loan_code`, `loan_number`, `cash_loan`, `redeem_number`, `transaction_type`.
- **Relationships**: Child of `daily_ledgers`.

---

## 2. Relationships & Cascading Deletes

- `ledger_batches.branch_id` → `branches(id)` (ON DELETE CASCADE)
- `daily_ledgers.batch_id` → `ledger_batches(id)` (ON DELETE CASCADE)
- `ledger_transactions.daily_ledger_id` → `daily_ledgers(id)` (ON DELETE CASCADE)

*Note: If a batch is explicitly deleted, all corresponding daily sheets and transactions are safely purged via CASCADE.*

---

## 3. Status Lifecycle (`ledger_batches.status`)

We explicitly track the health of a document through 5 precise states:

1. **`uploaded`**: The PDF has reached Cloud Storage successfully. (Formerly `pending`).
2. **`processing`**: The background OCR (Gemini) is actively running chunk by chunk.
3. **`needs_review`**: OCR has finished and data is populated in the database. A human MUST review it. (Formerly `completed`).
4. **`verified`**: A human has reviewed the UI, corrected any OCR mistakes, and confirmed the data is 100% accurate. 
5. **`failed`**: The OCR proxy timed out or failed to parse the document. (Formerly `error`).

---

## 4. Isolation & Duplication Constraints

### Removal of Unique Constraint on Batches
Previously, the database forced `UNIQUE(branch_id, year, month, book_category)`. This meant two uploads for the same month/branch would conflict. 

This has been **removed**. The system now allows infinite distinct `ledger_batches` to exist for the same month and branch, perfectly fulfilling the **One-By-One Scanning Requirement**. Concurrent scans from different laptops simply generate new distinct UUIDs and populate their own isolated tree of data.

---

## 5. Migration Strategy

The migration (`001_stabilize_ledger_batches.sql`) operates in place to preserve all historical data:
1. Drop the restricting `UNIQUE` constraint.
2. Drop the restrictive old `status` check constraint.
3. Use safe `UPDATE` statements to shift existing historical status strings to the new schema (`completed` -> `needs_review`, `pending` -> `uploaded`).
4. Apply the strict new `CHECK` constraint.
5. Add `verified_at` and `verified_by` columns without dropping tables.

## 6. Rollback Strategy
If the migration causes application failure:
1. `UPDATE` statuses back to their legacy strings (`needs_review` -> `completed`, `uploaded` -> `pending`).
2. Restore the original constraint: `ALTER TABLE ledger_batches ADD CONSTRAINT ledger_batches_status_check CHECK (status IN ('pending', 'processing', 'completed', 'error'));`
3. If necessary, re-apply the `UNIQUE(branch_id, year, month, book_category)` constraint (though this will fail if concurrent duplicates have since been inserted).
