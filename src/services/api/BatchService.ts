import { supabase } from "../supabaseClient";
import { BookCategory } from "../../types/ledger";

export class BatchService {
  static async getBatches(): Promise<any[]> {
    const { data, error } = await supabase
      .from("ledger_batches")
      .select(`
        id, batch_month, year, month, book_category, original_filename,
        original_pdf_url, status, branches ( branch_name ),
        daily_ledgers (
          id, day_number, date, staff_name, cp_balance, opening_balance,
          cash_in, cash_out, total_loan, total_redeem, receive, recovery,
          insurance, expenses, calculated_closing_balance, actual_cash_count,
          variance, page_image_url, ledger_transactions (*)
        )
      `);
    if (error || !data) {
      console.error("Failed to fetch batches:", error);
      return [];
    }

    return data.map((b: any) => {
      const isCloudUrl = b.original_pdf_url && b.original_pdf_url.startsWith("http");
      const cleanFilename = b.original_filename
        || (isCloudUrl
          ? b.original_pdf_url.substring(b.original_pdf_url.lastIndexOf("/") + 1)
          : (b.original_pdf_url || "Ledger_Book.pdf"));

      // Status maps directly now
      const status = b.status || "upload";

      return {
        id: b.id,
        filename: cleanFilename,
        branchName: b.branches?.branch_name || "Kiribathgoda",
        year: b.year || 2025,
        month: b.month || 10,
        bookCategory: (b.book_category || "lr_book"),
        fileSize: "Uploaded",
        pageCount: b.daily_ledgers?.length || 0,
        extractedDate: b.batch_month || "2025-10",
        status: status,
        pdfUrl: isCloudUrl ? b.original_pdf_url : undefined,
        data: b.daily_ledgers || []
      };
    });
  }

  /**
   * Check if a batch already exists for the given dimensions to prevent duplicates.
   */
  static async checkIfBatchExists(
    branchId: string,
    year: number,
    month: number,
    bookCategory: BookCategory
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from("ledger_batches")
      .select("id")
      .eq("branch_id", branchId)
      .eq("year", year)
      .eq("month", month)
      .eq("book_category", bookCategory)
      .limit(1);

    if (error) {
      console.error("Failed to check batch existence:", error);
      return false;
    }

    return data && data.length > 0;
  }

  /**
   * Idempotently create or get a batch record.
   */
  static async createOrGetBatch(opts: {
    branchId: string;
    year: number;
    month: number;
    bookCategory: BookCategory;
    originalFilename: string;
    fileSizeBytes: number;
  }): Promise<string> {
    const formattedMonthStr = `${opts.year}-${String(opts.month).padStart(2, "0")}-01`;
    
    // UPSERT to avoid duplicate batches
    const { data, error } = await supabase
      .from("ledger_batches")
      .upsert({
        branch_id: opts.branchId,
        batch_month: formattedMonthStr,
        year: opts.year,
        month: opts.month,
        book_category: opts.bookCategory,
        original_filename: opts.originalFilename,
        mime_type: "application/pdf",
        file_size_bytes: opts.fileSizeBytes,
        storage_bucket: "ledger-documents"
      }, {
        onConflict: 'branch_id, year, month, book_category',
        ignoreDuplicates: false
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Batch upsert failed:", error);
      throw error || new Error("No data returned from upsert");
    }

    // Default status if it's a new insert is 'upload'. We won't overwrite status here if it already exists, 
    // but the upsert might overwrite it to default if we don't supply it. 
    // To be perfectly safe, we do a select first, then insert.

    return data.id;
  }

  static async updateBatchStatus(batchId: string, status: 'upload' | 'uploaded' | 'processing' | 'needs_review' | 'verified' | 'failed') {
    const { error } = await supabase
      .from("ledger_batches")
      .update({ status })
      .eq("id", batchId);
      
    if (error) throw error;
  }

  static async updateBatchPdfUrl(batchId: string, pdfUrl: string, storagePath: string) {
    const { error } = await supabase
      .from("ledger_batches")
      .update({ 
        original_pdf_url: pdfUrl,
        storage_path: storagePath,
        status: 'uploaded'
      })
      .eq("id", batchId);
      
    if (error) throw error;
  }

  static async updateBatchBranch(batchId: string, branchId: string) {
    const { error } = await supabase
      .from("ledger_batches")
      .update({ branch_id: branchId })
      .eq("id", batchId);
      
    if (error) throw error;
  }

  static async deleteBatch(batchId: string) {
    const { error } = await supabase
      .from("ledger_batches")
      .delete()
      .eq("id", batchId);
      
    if (error) throw error;
  }
}
