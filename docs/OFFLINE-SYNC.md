# Offline Synchronization Strategy

The Ledger Scanner is an offline-resilient web application where **Supabase is the strict single source of truth**. Local storage (IndexedDB) is utilized entirely as a cache layer and an offline safety net.

## Cache Layer Implementation
- **Library**: `idb` (Promisified IndexedDB wrapper).
- **Stores**:
  - `batches`: A cache of the list of batches from the server.
  - `draft_ledgers`: A cache for actively edited days. Tracks a `pendingSync` flag to denote if the draft has successfully reached Supabase.

## Startup Synchronization Rules

1. **Authoritative Fetch**: On application mount, the app attempts to fetch the list of batches directly from `BatchService.getBatches()` (Supabase).
2. **Cache Updating**: If the fetch is successful, the app completely overwrites the local `batches` cache with the authoritative response to prevent stale data.
3. **Offline Fallback**: If the fetch fails due to a network error, the app gracefully falls back to `CacheService.getCachedBatches()` so the user can continue viewing previously loaded metadata.

## Draft Resolution Rules

1. **Immediate Local Save**: As the user types in the `SideBySideDashboard`, their edits are instantly written to `draft_ledgers` with `pendingSync = true`.
2. **Debounced Server Sync**: A debounced mechanism (1.5 seconds) attempts to push the changes to Supabase via `LedgerService.upsertLedger`.
3. **Success**: If Supabase responds with a success, the local draft is marked as `pendingSync = false`.
4. **Failure (Offline)**: If the upload fails, the draft remains `pendingSync = true`, protecting the user's data while they are offline.

## Conflict Resolution & Truth

- **Explicit Resolution**: When a user selects a batch to view, the system checks the `draft_ledgers` cache for any records where `pendingSync == true`. If found, the user is presented with a standard `window.confirm` dialog, forcing an explicit choice:
  - **OK (Keep)**: The offline edits override the data fetched from the server.
  - **Cancel (Discard)**: The offline edits are completely deleted, and the server data is loaded.
- **Server Truth Supremacy**: If a batch has been marked as `verified` on Supabase, any lingering offline drafts for that batch are silently purged. Verified server records can never be overwritten by stale local cache.
