# OCR Review and Human Verification Flow

The Ledger Scanner application prioritizes human-reviewed data as the ultimate source of truth, while treating automated OCR output as an initial draft. This document outlines how the system manages the intersection of machine predictions and human corrections.

## Core Principles

1. **OCR is Not Final**: The system never assumes the AI's output is 100% accurate.
2. **Human Edits are Protected**: Once a user modifies a field, it becomes "locked" to that user's input. Subsequent OCR re-runs will skip that field rather than overwriting it.
3. **Continuous Draft Saving**: As a user reviews and edits the data, changes are saved constantly to prevent data loss on browser refresh or navigation.
4. **Data Lineage Separation**: The raw JSON output of the OCR engine is preserved alongside the final dataset.

## The `isOcrUpdate` Lifecycle

The `LedgerService` and `TransactionService` implement a crucial parameter: `isOcrUpdate`.

### Scenario A: Background OCR Job (`isOcrUpdate = true`)
When the background queue processes a PDF and sends data to Supabase:
- The backend fetches the existing `daily_ledgers` or `ledger_transactions` row.
- It inspects the `human_edited_fields` JSONB array on that row.
- It constructs an update payload that **excludes** any keys present in `human_edited_fields`.
- It writes the raw OCR payload into the `ocr_raw_data` column for debugging/diffing.
- *Result*: Unedited fields are updated with fresh OCR results. Human corrections are safely preserved.

### Scenario B: Human Edits / Autosave (`isOcrUpdate = false`)
When a user interacts with an input field in the `SideBySideDashboard`:
- The frontend computes the difference between the old ledger state and the new ledger state.
- The changed field names (e.g., `['cash_in', 'expenses']`) are appended to the `human_edited_fields` array.
- A debounced autosave timer (1.5 seconds) triggers an upsert with `isOcrUpdate = false`.
- The backend overwrites all provided fields (since the human is explicitly saving them) and saves the expanded `human_edited_fields` list.
- *Result*: The user's changes become the new source of truth and are protected from future AI runs.

## Review States

- **`needs_review`**: The batch has been OCR'd and is ready for human validation. Drafts save automatically while the user works. The data is safely persisted in the database.
- **`verified`**: The user has clicked **"Complete Verification"**. This indicates the human has fully reviewed the document and explicitly approved the values. The batch moves out of the active review queue.

## Failure Resilience

Because autosaves are debounced and pushed to Supabase continually:
- **Browser Refresh**: If the user accidentally hits F5, they can navigate back to the batch and resume exactly where they left off.
- **Lost Connection**: The `SideBySideDashboard` will show an error if an autosave fails, and the user can click "Complete Verification" later to trigger a final explicit save of all data.
