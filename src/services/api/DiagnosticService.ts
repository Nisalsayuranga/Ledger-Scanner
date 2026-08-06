import { supabase } from "../supabaseClient";

export interface DiagnosticIssue {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
  details?: any;
}

export interface DiagnosticReport {
  timestamp: string;
  totalBatches: number;
  totalLedgers: number;
  totalTransactions: number;
  issues: DiagnosticIssue[];
}

export class DiagnosticService {
  static async runCompleteAudit(): Promise<DiagnosticReport> {
    const issues: DiagnosticIssue[] = [];
    
    let totalBatches = 0;
    let totalLedgers = 0;
    let totalTransactions = 0;

    try {
      // 1. Fetch all data
      const [batchesRes, ledgersRes, txRes, storageRes] = await Promise.all([
        supabase.from("ledger_batches").select("*"),
        supabase.from("daily_ledgers").select("*"),
        supabase.from("ledger_transactions").select("*"),
        supabase.storage.from("documents").list()
      ]);

      const batches = batchesRes.data || [];
      const ledgers = ledgersRes.data || [];
      const transactions = txRes.data || [];
      
      totalBatches = batches.length;
      totalLedgers = ledgers.length;
      totalTransactions = transactions.length;

      // Check Storage access
      const storageFiles = storageRes.data || [];
      if (storageRes.error) {
        issues.push({
          type: "STORAGE_ACCESS",
          severity: "medium",
          message: "Could not list storage bucket 'documents'. RLS policies may restrict this operation. Storage vs DB checks skipped.",
          details: storageRes.error.message
        });
      }

      // --- 2. Audit Batches ---
      const batchSignatures = new Set<string>();
      
      batches.forEach(batch => {
        // Duplicate Batches
        const signature = `${batch.branch_id}-${batch.year}-${batch.month}-${batch.book_category}`;
        if (batchSignatures.has(signature)) {
          issues.push({
            type: "DUPLICATE_BATCH",
            severity: "high",
            message: `Duplicate batch detected for Branch ${batch.branch_id}, ${batch.month}/${batch.year} (${batch.book_category})`,
            details: { batchId: batch.id }
          });
        }
        batchSignatures.add(signature);

        // Invalid dates
        if (batch.year < 2000 || batch.year > 2100) {
          issues.push({ type: "INVALID_DATE", severity: "medium", message: `Batch ${batch.id} has invalid year: ${batch.year}` });
        }
        if (batch.month < 1 || batch.month > 12) {
          issues.push({ type: "INVALID_DATE", severity: "medium", message: `Batch ${batch.id} has invalid month: ${batch.month}` });
        }

        // Missing Ledgers check (if verified, should have 28-31 days)
        if (batch.status === "verified") {
          const batchLedgers = ledgers.filter(l => l.batch_id === batch.id);
          if (batchLedgers.length < 28) {
            issues.push({
              type: "MISSING_LEDGERS",
              severity: "high",
              message: `Verified batch ${batch.id} has unusually low ledger count: ${batchLedgers.length}`,
              details: { count: batchLedgers.length }
            });
          }
        }

        // Database records without PDFs (broken storage reference)
        // If it's a supabase URL, we can parse out the filename
        if (batch.original_pdf_url && storageFiles.length > 0) {
          if (batch.original_pdf_url.includes("supabase.co")) {
            const urlParts = batch.original_pdf_url.split("/");
            const filename = urlParts[urlParts.length - 1];
            // Decode URI component in case of spaces
            const decodedFilename = decodeURIComponent(filename);
            const foundInStorage = storageFiles.some(f => f.name === decodedFilename);
            if (!foundInStorage) {
              issues.push({
                type: "MISSING_PDF",
                severity: "high",
                message: `Batch ${batch.id} references a PDF that does not exist in the Storage bucket.`,
                details: { pdfUrl: batch.original_pdf_url }
              });
            }
          }
        }
      });

      // PDFs without database records (Orphaned Documents)
      if (storageFiles.length > 0) {
        // Extract all filenames from DB
        const dbFilenames = batches.map(b => {
          if (!b.original_pdf_url) return "";
          const parts = b.original_pdf_url.split("/");
          return decodeURIComponent(parts[parts.length - 1]);
        }).filter(name => name !== "");

        storageFiles.forEach(file => {
          // ignore placeholders like .emptyFolderPlaceholder
          if (file.name.startsWith(".")) return;
          
          if (!dbFilenames.includes(file.name)) {
            issues.push({
              type: "ORPHANED_DOCUMENT",
              severity: "medium",
              message: `Storage file '${file.name}' has no matching database record.`,
              details: { filename: file.name }
            });
          }
        });
      }

      // --- 3. Audit Ledgers ---
      const validBatchIds = new Set(batches.map(b => b.id));
      ledgers.forEach(ledger => {
        if (!validBatchIds.has(ledger.batch_id)) {
          issues.push({
            type: "ORPHANED_LEDGER",
            severity: "high",
            message: `Ledger ${ledger.id} is attached to a non-existent batch ${ledger.batch_id}.`
          });
        }
      });

      // --- 4. Audit Transactions ---
      const validLedgerIds = new Set(ledgers.map(l => l.id));
      transactions.forEach(tx => {
        if (!validLedgerIds.has(tx.ledger_id)) {
          issues.push({
            type: "ORPHANED_TRANSACTION",
            severity: "high",
            message: `Transaction ${tx.id} is attached to a non-existent ledger ${tx.ledger_id}.`
          });
        }
      });

    } catch (e: any) {
      issues.push({
        type: "SYSTEM_ERROR",
        severity: "high",
        message: "Failed to complete audit due to unexpected error.",
        details: e.message
      });
    }

    return {
      timestamp: new Date().toISOString(),
      totalBatches,
      totalLedgers,
      totalTransactions,
      issues
    };
  }
}
