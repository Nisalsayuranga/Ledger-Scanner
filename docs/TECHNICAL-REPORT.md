# Ledger Automation System: Comprehensive Technical Report

## 1. Executive Summary
The Ledger Automation System is an enterprise-grade web application designed to digitize, process, and manage daily financial ledgers across 13 branch locations. The system replaces manual data entry with an automated Optical Character Recognition (OCR) pipeline, utilizing a robust cloud-native architecture to ensure absolute data integrity, idempotency, and disaster recovery.

## 2. Technology Stack
- **Frontend Framework:** React 18 with Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Lucide React (Icons)
- **State & Caching:** localforage (IndexedDB) for resumable bulk uploads
- **Backend/Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage (S3-compatible)
- **Serverless Compute:** Supabase Edge Functions (Deno)
- **AI/OCR Engine:** Google Gemini Pro Vision (via Edge Proxy)
- **Deployment:** Vercel

---

## 3. System Architecture

The architecture follows a strict decoupled, client-server model where **Supabase is the Single Source of Truth**. The frontend acts as a thin client for data presentation and orchestration.

### 3.1 Service Layer (`src/services/api/`)
The frontend communicates with Supabase through domain-specific singleton classes:
- **`BranchService`**: Manages the 13 company branches, resolving IDs and handling branch creation.
- **`BatchService`**: Manages the lifecycle of a PDF document (the "batch"). It relies heavily on `UPSERT` operations constrained by `(branch_id, year, month, book_category)` to enforce deduplication.
- **`DocumentService`**: Handles streaming PDF blobs to Supabase Storage with `upsert: true` enabled for network resiliency.
- **`LedgerService` & `TransactionService`**: Manages the CRUD operations for extracted daily rows. Implements crucial data-protection logic that explicitly merges OCR updates to prevent overwriting `human_edited_fields`.
- **`DiagnosticService`**: Provides read-only integrity auditing to identify orphaned records, missing files, or data anomalies without relying on destructive automation.

### 3.2 OCR Processing Engine (`ocrService.ts`)
To secure the external API keys (Google Gemini) and prevent browser CORS limitations, the OCR engine is offloaded to a Supabase Edge Function (`ocr-proxy`). 
1. The frontend slices the PDF into images.
2. Images are batched (2 pages per chunk to respect rate limits) and sent to the Edge Function.
3. The Edge Function processes the image and returns structured JSON (Daily Ledger + Transactions).
4. Results are streamed idempotently into the database.

---

## 4. Core Workflows

### 4.1 Historical Document Migration (`HistoricalMigration.tsx`)
Designed to import massive backlogs (e.g., Jan 2025 - June 2026), this tool uses an IndexedDB manifest to decouple the UI from the network.
- **Dry-Run Validation:** Parses filenames and queries the database to flag duplicates locally.
- **Resumability:** If the browser crashes, reloading the tab automatically hydrates the exact progress state from local storage. Re-selecting the folder simply remaps the local file objects and resumes instantly.

### 4.2 Standard Upload & OCR Queue (`BulkPdfUploader.tsx` & `ProcessingQueue.tsx`)
- Documents are uploaded to Supabase Storage and registered in the database with a status of `uploaded`.
- The user manually selects a document from the Queue to begin OCR processing, transitioning the status to `processing` -> `needs_review`.
- This decoupling prevents system timeouts when processing hundreds of pages simultaneously.

### 4.3 Human-in-the-Loop Verification
- OCR is inherently probabilistic. The system mandates human review.
- When an administrator modifies a value, `LedgerService` explicitly logs that column in a `human_edited_fields` PostgreSQL array.
- If OCR is accidentally re-run, the backend logic actively merges the payloads, ensuring human overrides are mathematically protected from silent deletion.

---

## 5. Data Model (Supabase PostgreSQL)

The system relies on strict Foreign Key constraints and cascading relationships.

1. **`branches`**: `id`, `branch_name`, `branch_code`.
2. **`ledger_batches`**: Represents a single PDF file (e.g., "Kiribathgoda Jan 2025 L-Book").
   - `id`, `branch_id`, `year`, `month`, `book_category`, `status`, `original_pdf_url`.
   - **Constraint:** Unique `(branch_id, year, month, book_category)`.
3. **`daily_ledgers`**: Represents a single page/day within a batch.
   - `id`, `batch_id`, `day_number`, financial aggregates (e.g., `total_loan`, `cash_in`).
   - `human_edited_fields`: `text[]` (Array tracking human edits).
   - **Constraint:** Unique `(batch_id, day_number)`.
4. **`ledger_transactions`**: Represents individual loan rows within a daily ledger.
   - `id`, `daily_ledger_id`, `row_order`, `loan_code`, `cash_loan`, etc.
   - **Constraint:** Unique `(daily_ledger_id, row_order)`.

---

## 6. Security & Infrastructure

- **Row Level Security (RLS):** Enabled on all Supabase tables. The application uses only the `VITE_SUPABASE_ANON_KEY`, ensuring that the frontend has no elevated administrative privileges by default. All operations require a valid JWT session.
- **Environment Management:** The application strictly avoids `.env` file checking into version control. For production, keys are injected via Vercel Environment Variables.
- **Disaster Recovery:** Safe, manual conflict resolution is prioritized. `DiagnosticService` allows admins to find orphaned/duplicate rows and resolve them manually through the Supabase Dashboard, preventing catastrophic bugs from automated "cleanup" scripts.
