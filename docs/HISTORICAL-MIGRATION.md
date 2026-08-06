# Historical Document Migration

The Historical Migration tool is designed to safely and controllably import a massive backlog of scanned ledger PDFs spanning from January 2025 to June 2026 across all 11 branches.

To prevent overwhelming the system, this tool focuses strictly on **uploading and database registration** (upload status), deferring the actual OCR extraction to the Processing Queue where it can be handled sequentially on-demand.

## How to use the Migration Tool

### 1. Select the Master Folder
Navigate to the "Historical Migration" tab in the application. Click the **Select Master Folder** button. The browser will prompt you to select a directory on your local machine.

Select the root directory containing all your historical PDFs. The system will recursively read all `.pdf` files inside the folder and its subfolders. 

> [!NOTE]
> Filenames must follow a predictable convention for the system to detect the metadata. Ensure the filename contains the **Branch Name** (or code), the **Month** (e.g. `JAN`, `FEB`), the **Year** (e.g. `2025`, `2026`), and an indicator for the **Book Category** (`L`, `R`, or `M`).

### 2. Dry Run & Validation
Once the folder is parsed, a manifest is built in your browser's memory and saved to IndexedDB.
Click **Run Validation (Dry Run)**.

The system will verify:
- Empty/0-byte files.
- Duplicate detection: Queries the Supabase database to ensure a batch for that exact Branch, Year, Month, and Category does not already exist.

### 3. Start Import
Once validated, click **Start Import**. The system will sequentially upload valid documents to the Supabase Storage bucket and create the corresponding `ledger_batches` records.

> [!TIP]
> The progress bar indicates the total success rate. You can click **Pause** at any time to halt the operation safely between files.

### 4. Resumability & Recovery
If your browser crashes, loses network connection, or is accidentally refreshed while at 63% completion:
1. Return to the Historical Migration tab.
2. The manifest state (including the 63% success flags) is automatically reloaded from the browser's persistent storage.
3. Because browser security prevents automatic file access on reload, the filenames will show a red warning `File missing in memory. Reselect folder.`
4. Simply click **Select Master Folder** again and choose the exact same root directory.
5. The system will re-link the local files to the existing manifest, skipping the 63% that already have an `upload_status: 'success'`.
6. Click **Resume Import** to continue from 63%.

## Post-Migration
Once all files are uploaded (Success), they will appear in the **Processing Queue** with a status of `Ready to Process`. You can then process them through OCR one by one at your own pace.
