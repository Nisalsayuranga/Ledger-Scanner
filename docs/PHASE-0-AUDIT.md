# PHASE 0 AUDIT: Ledger Scanner

## 1. Current Architecture
- **Frontend**: React SPA using Vite, TypeScript, and Tailwind CSS.
- **Backend/Database**: Supabase (PostgreSQL, Storage, Edge Functions).
- **Local Persistence**: IndexedDB (using raw `indexedDB` API) for caching batches.
- **OCR Engine**: Google Gemini via a Supabase Edge Function (`ocr-proxy`).

## 2. Current Data Flow
1. User selects PDF(s) on the frontend.
2. File is uploaded to Supabase Storage immediately.
3. Batch is cached in IndexedDB as `Pending`.
4. Background loop picks up `Pending` batches, fetches the PDF from Storage, and extracts pages to images.
5. Images are sent in parallel chunks to the Supabase Edge Function (`ocr-proxy`).
6. Edge Function passes images to Gemini and returns structured JSON.
7. Frontend updates state with OCR data and auto-saves to the Supabase Database.
8. User reviews the data in the UI and can perform manual updates.

## 3. Current PDF Upload Flow
- Governed by `handleBulkUploadPdfs` in `App.tsx`.
- Extracts basic metadata (branch, year, month) from the filename.
- Uploads the PDF to Supabase Storage bucket `ledger-documents` using `upsert: true`.
- Caches the batch into IndexedDB with `pdfUrl` pointing to the cloud storage, explicitly omitting the `rawFile` (File object) to bypass IndexedDB serialization limitations.

## 4. Current OCR Flow
- A background `useEffect` loop automatically processes batches with status `Pending`.
- Uses `pdfjs-dist` to download the `pdfUrl` from cloud storage and render pages into base64 images (currently at 1.5x scale).
- Processes images in chunks of 2 (`CHUNK_SIZE = 2`) to avoid 413 Payload Too Large and Edge Function timeouts.
- Marks batch as `Completed` in local state upon success.

## 5. Current Database Save Flow
- Regulated by `saveBatchToSupabase` in `supabaseStorageService.ts`.
- Resolves or creates a `branch_id`.
- Inserts a record into `ledger_batches`.
- Iterates over `ledgers` array and inserts into `daily_ledgers`.
- Iterates over `transactions` and inserts into `ledger_transactions`.

## 6. Current IndexedDB Flow
- Handled in `indexedDbStorage.ts`.
- Uses the `OCR_Ledger_Database` database.
- Explicitly strips out the physical `rawFile` (`const { rawFile, ...serializable } = batch;`) before storing.
- Primarily used as a session-recovery mechanism to preserve `Pending` queues across page reloads.

## 7. Current Supabase Storage Flow
- Stores PDFs in the `ledger-documents` bucket.
- Path format: `{branchName}/{year}/{month}/{bookCategory}/{cleanFilename}`.
- Uses `upsert: true` allowing duplicate path uploads to overwrite existing files.

## 8. Current Vercel Deployment Flow
- Standard Vercel deployment running `npm run build` (`tsc && vite build`).
- No separate backend build; entirely dependent on Supabase infrastructure.

---

## Identified Issues & Risks

### 9. Every identified persistence problem
- **[CRITICAL]** The `UNIQUE(branch_id, year, month, book_category)` constraint in `ledger_batches` blocks saving multiple independent scans for the same branch and month. Because the previous auto-delete logic was removed (to preserve one-by-one isolation), the database will outright reject subsequent independent uploads for the same month/category with a Postgres unique constraint violation.
- **[HIGH]** The frontend auto-save mechanism catches exceptions (`.catch((e) => console.error(...))`) but does not inform the user that the background save failed. The batch stays in React state, but upon refresh, it reverts or disappears because it never made it to the DB.

### 10. Every data-loss risk
- **[CRITICAL]** If the initial `uploadPdfToSupabase` fails (e.g., network error), `cloudUrl` is undefined, but the batch is still saved to IndexedDB as `Pending`. Because IndexedDB strips `rawFile`, if the user refreshes, the PDF file is permanently lost from memory, leaving an unprocessable "ghost" batch.
- **[HIGH]** `upsert: true` in Supabase Storage combined with a predictable path structure means if two laptops upload a file named `Ledger.pdf` for the same branch and month, Laptop B will overwrite Laptop A's file in cloud storage, breaking Laptop A's file association permanently.

### 11. Every duplicate/overwrite risk
- **[CRITICAL]** As stated above, Storage objects are overwritten due to `upsert: true` and filename collisions.
- **[CRITICAL]** Database schema explicitly prevents duplicates via the Unique constraint, directly violating the business requirement of isolating multiple scan batches for the same month.

### 12. Every database consistency problem
- **[HIGH]** `saveBatchToSupabase` executes multiple independent `insert` statements (`ledger_batches`, `daily_ledgers`, `ledger_transactions`) sequentially. If the `ledger_transactions` insert fails midway (e.g., malformed data), the operation does not rollback. The database is left in a corrupted, partial state.
- **[MEDIUM]** If a `ledger_batch` is deleted via the API, the associated PDF in the Storage bucket is not automatically deleted, creating orphaned files and inflating storage costs.

### 13. Every security problem
- **[CRITICAL]** Row Level Security (RLS) policies on all tables (`branches`, `ledger_batches`, `daily_ledgers`, `ledger_transactions`) explicitly grant unauthenticated public `INSERT`, `UPDATE`, and `DELETE` access using `WITH CHECK (true)`. Anyone possessing the anonymous API key can wipe or alter the entire database.
- **[CRITICAL]** Storage policies grant public `INSERT`, `UPDATE`, and `DELETE` access to the `ledger-documents` bucket. Anyone can overwrite or delete critical historical PDF records.

### 14. Every race condition you can identify
- **[HIGH]** The background OCR loop processes `Pending` batches automatically. If a user manually clicks "Preview & Scan OCR" on a batch just as the background loop picks it up, both routines will process the exact same file in parallel, triggering duplicate Edge Function costs and potentially duplicating local state inserts.

### 15. Every error-handling problem
- **[MEDIUM]** Edge Function timeout/413 errors are caught locally via the newly added modal, but if the Vercel execution context freezes, batches remain permanently stuck in "Processing" state in IndexedDB.
- **[LOW]** Filename parsing (`detectBranchAndCategoryFromFilename`) heavily assumes a specific naming convention. If a user uploads "Untitled.pdf", it falls back to defaults, which may incorrectly route documents to the wrong branch or year.

---

## Schema Overview

### 16. Current database relationships
- `branches (1)` ↔ `(N) ledger_batches`
- `ledger_batches (1)` ↔ `(N) daily_ledgers` (ON DELETE CASCADE)
- `daily_ledgers (1)` ↔ `(N) ledger_transactions` (ON DELETE CASCADE)

### 17. Current unique constraints
- `branches(branch_name)`
- `ledger_batches(branch_id, year, month, book_category)` (**CRITICAL FLAW**)
- `daily_ledgers(batch_id, day_number)`

### 18. Current RLS policies
- Unauthenticated (Public): Full `SELECT`, `INSERT`, `UPDATE`, `DELETE` across all schema tables.

### 19. Current Storage policies
- Unauthenticated (Public): Full `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `ledger-documents` bucket.

---

## 20. Recommended Target Architecture & Implementation Order

1. **[CRITICAL] Database Schema Fix (Persistence Isolation)**
   - Drop the `UNIQUE(branch_id, year, month, book_category)` constraint on `ledger_batches` to allow independent, one-by-one batch uploads for the same month/branch without rejection.
2. **[CRITICAL] Storage Path Isolation**
   - Modify the Storage path construction in `supabaseStorageService.ts` to prepend the local batch ID (or a UUID) to the filename (e.g., `Branch/2026/01/lr_book/{uuid}_filename.pdf`). This entirely prevents `upsert` overwriting files from concurrent laptops.
3. **[HIGH] Transactional Safety**
   - Refactor `saveBatchToSupabase` to either execute a single Supabase RPC (Stored Procedure) for atomic inserts, or manually issue compensatory `DELETE` commands if a nested transaction fails midway.
4. **[HIGH] Frontend State Integrity**
   - Reintroduce `rawFile` to local persistence via an upgraded IndexedDB mechanism (e.g., storing as a `Blob` or `ArrayBuffer` instead of stripping it), ensuring offline resilience if the initial cloud upload fails.
5. **[CRITICAL] Security Overhaul (Deferred)**
   - Implement Supabase Auth (or a basic application-level authentication gateway).
   - Re-write RLS policies and Storage policies to restrict `DELETE` and `UPDATE` commands to authenticated administrators only, preventing malicious or accidental data wiping.
