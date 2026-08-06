# Phase 3 Security Audit: Supabase RLS & Storage

This document outlines the security mechanisms implemented during Phase 3 to lock down the Ledger-Scanner database. All overly permissive public access rules have been removed and replaced with proper Row Level Security (RLS).

## 1. Authentication Assumptions & Strategy
**Current State**: The React frontend currently operates without a user login mechanism. 
**Requirement**: To prevent unauthorized access while not exposing administrative credentials, the application MUST transition to an **Authenticated User Model**. 
**Implementation Strategy**:
- All anonymous access to ledger tables and storage buckets is strictly blocked.
- Supabase Auth (`auth.users`) is required for database access.
- Users are mapped to specific branches via a new `user_branches` join table.
- **Frontend Action Required**: A Login UI using `supabase.auth.signInWithPassword` must be integrated into `src/App.tsx`. Until this is implemented, users will receive RLS errors when attempting to view or upload ledgers.

## 2. Row Level Security (RLS) Policies
All core tables (`branches`, `ledger_batches`, `daily_ledgers`, `ledger_transactions`, `user_branches`) have RLS enabled.

### Branch Authorization (`user_branches`)
- Maps a Supabase `auth.uid()` to a `branch_id`.
- **Policy**: `Users can view their own branch mappings`. A user can only see which branches they are authorized to access.

### Branches (`branches`)
- **Policy**: `Users can view assigned branches`. Users can only query and view branches that have a corresponding entry in `user_branches`.

### Ledgers & Transactions
- **Policy**: Read, Insert, Update, and Delete operations for `ledger_batches`, `daily_ledgers`, and `ledger_transactions` are restricted.
- Users can ONLY perform these operations if the underlying data belongs to a branch they are explicitly authorized for in `user_branches`.
- This ensures cross-branch data contamination or unauthorized snooping is impossible at the database level.

## 3. Storage Policies
The `ledger-documents` bucket is secured using the following rules:
- Public access (`USING (true)`) has been revoked.
- **Policies**: `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `storage.objects` now require `auth.role() = 'authenticated'`.
- This ensures that only logged-in staff can view or upload handwritten ledger PDFs.
- *Future Enhancement*: Add path-based matching (`(storage.foldername(name))[1] = branch_id::text`) combined with `user_branches` for absolute strictness.

## 4. Credential Handling
- **Frontend Keys**: The frontend ONLY uses `VITE_SUPABASE_ANON_KEY`, which is safely exposed to the client. The anon key is powerless on its own due to our strict RLS policies; it requires a valid user JWT.
- **Service Role Keys**: `SUPABASE_SERVICE_ROLE_KEY` has been completely eliminated from frontend source code and configuration. 
- **Backend/Test Scripts**: `test-storage.mjs` was updated to read credentials dynamically from `.env.local` rather than hardcoding. It relies on the service role key (for administrative bypass) or test user credentials, ensuring no secrets are committed to Git.
- **Vercel / Hosting Variables**: Ensure that Vercel is only configured with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 5. Remaining Risks & Action Items
- **[URGENT] Frontend Authentication UI**: The frontend requires a login screen. Without it, the application will not function under the new RLS policies.
- **User Provisioning**: An administrative dashboard or script is needed to invite users and populate the `user_branches` table.
- **Storage Path Strictness**: While Storage is locked to authenticated users, a malicious authenticated user could theoretically upload a document to another branch's folder path. This can be mitigated in the future by adding a custom PostgreSQL function to the Storage policy that cross-references the user's `user_branches` with the folder path array.
