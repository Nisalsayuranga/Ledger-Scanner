import { supabase } from "./supabaseClient";
import { DailyLedger, BookCategory } from "../types/ledger";

const BUCKET = "ledger-documents";

interface SaveBatchOptions {
  branchName: string;
  year: number;
  month: number;
  bookCategory: BookCategory;
  batchName: string;
  ledgers: DailyLedger[];
}

const getStoragePathFromUrl = (url: string) => {
  const marker = `/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    return decodeURIComponent(url.substring(idx + marker.length));
  }
  return null;
};

// ---------- Phase 2: Immutable Document Storage ----------

/**
 * Build the immutable storage path for a document.
 * Pattern: {branchId}/{year}/{MM}/{batchId}/original/{batchId}.pdf
 */
const buildStoragePath = (
  branchId: string,
  year: number,
  month: number,
  batchId: string
): string => {
  const mm = String(month).padStart(2, "0");
  return `${branchId}/${year}/${mm}/${batchId}/original/${batchId}.pdf`;
};

/**
 * Step 1 of the upload lifecycle: Create the database record FIRST.
 * Returns the Supabase-generated UUID (batchId) which becomes the
 * permanent anchor for both the DB row and the Storage object.
 */
export const createBatchRecord = async (opts: {
  branchName: string;
  year: number;
  month: number;
  bookCategory: BookCategory;
  originalFilename: string;
  fileSizeBytes: number;
}): Promise<{ batchId: string; branchId: string }> => {
  // 1. Resolve branch
  const { data: branchData } = await supabase
    .from("branches")
    .select("id")
    .eq("branch_name", opts.branchName)
    .maybeSingle();

  let branchId = branchData?.id;
  if (!branchId) {
    const { data: newBranch } = await supabase
      .from("branches")
      .insert({ branch_name: opts.branchName })
      .select("id")
      .single();
    branchId = newBranch?.id;
  }
  if (!branchId) throw new Error("Could not resolve branch ID");

  // 2. Insert batch record with status = 'uploaded', NO pdf_url yet
  const formattedMonthStr = `${opts.year}-${String(opts.month).padStart(2, "0")}-01`;
  const { data: batchData, error: batchErr } = await supabase
    .from("ledger_batches")
    .insert({
      branch_id: branchId,
      batch_month: formattedMonthStr,
      year: opts.year,
      month: opts.month,
      book_category: opts.bookCategory,
      status: "uploaded",
      original_filename: opts.originalFilename,
      mime_type: "application/pdf",
      file_size_bytes: opts.fileSizeBytes,
      storage_bucket: BUCKET,
      uploaded_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (batchErr || !batchData) {
    console.error("Batch record creation failed:", batchErr);
    throw batchErr || new Error("Batch insert returned no data");
  }

  return { batchId: batchData.id, branchId };
};

/**
 * Step 2 of the upload lifecycle: Upload the file to Storage using
 * the batch UUID as the path anchor. Then update the DB record.
 *
 * If the upload succeeds but the DB update fails, the orphaned
 * Storage file is cleaned up before throwing.
 */
export const uploadDocumentForBatch = async (
  file: File,
  batchId: string,
  branchId: string,
  year: number,
  month: number
): Promise<string> => {
  const storagePath = buildStoragePath(branchId, year, month, batchId);

  // Upload with upsert: false — never overwrite
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (uploadErr) {
    console.error("Storage upload failed:", uploadErr);
    // Mark the DB record as failed so the user can retry
    await supabase
      .from("ledger_batches")
      .update({ status: "failed" })
      .eq("id", batchId);
    throw uploadErr;
  }

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  // Update DB record with the storage path and URL
  const { error: updateErr } = await supabase
    .from("ledger_batches")
    .update({
      original_pdf_url: publicUrl,
      storage_path: storagePath
    })
    .eq("id", batchId);

  if (updateErr) {
    // DB update failed after upload succeeded → clean up orphaned file
    console.error("DB update failed after upload, cleaning up orphan:", updateErr);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw updateErr;
  }

  return publicUrl;
};

/**
 * Check whether a Storage object exists for a given batch.
 */
export const checkDocumentExists = async (batchId: string): Promise<boolean> => {
  const { data } = await supabase
    .from("ledger_batches")
    .select("storage_path")
    .eq("id", batchId)
    .maybeSingle();

  if (!data?.storage_path) return false;

  const { data: fileList } = await supabase.storage
    .from(BUCKET)
    .list(data.storage_path.substring(0, data.storage_path.lastIndexOf("/")));

  const filename = data.storage_path.substring(data.storage_path.lastIndexOf("/") + 1);
  return (fileList || []).some((f: any) => f.name === filename);
};

/**
 * Delete the Storage object for a given batch (used in batch deletion).
 */
export const deleteDocumentFromStorage = async (batchId: string): Promise<void> => {
  const { data } = await supabase
    .from("ledger_batches")
    .select("storage_path")
    .eq("id", batchId)
    .maybeSingle();

  if (data?.storage_path) {
    await supabase.storage.from(BUCKET).remove([data.storage_path]);
  }
};

// ---------- Legacy wrapper for backward compatibility ----------

/**
 * Combined upload function: creates DB record first, then uploads file.
 * Returns the public URL. This replaces the old uploadPdfToSupabase.
 */
export const uploadPdfToSupabase = async (
  file: File,
  branchName: string,
  year: number,
  month: number,
  bookCategory: BookCategory
): Promise<{ publicUrl: string; batchId: string }> => {
  const { batchId, branchId } = await createBatchRecord({
    branchName,
    year,
    month,
    bookCategory,
    originalFilename: file.name,
    fileSizeBytes: file.size
  });

  const publicUrl = await uploadDocumentForBatch(
    file, batchId, branchId, year, month
  );

  return { publicUrl, batchId };
};


export const deleteBatchFromSupabase = async (
  batchIdOrFilename: string,
  branchName?: string,
  year?: number,
  month?: number,
  bookCategory?: BookCategory
) => {
  try {
    // 1. Delete by exact batch ID if provided
    if (batchIdOrFilename && batchIdOrFilename.includes("-") && !batchIdOrFilename.includes(".")) {
      // Find existing batch first to delete its storage object
      const { data } = await supabase
        .from("ledger_batches")
        .select("original_pdf_url")
        .eq("id", batchIdOrFilename)
        .maybeSingle();

      if (data?.original_pdf_url) {
        const storagePath = getStoragePathFromUrl(data.original_pdf_url);
        if (storagePath) {
          await supabase.storage.from("ledger-documents").remove([storagePath]);
        }
      }

      await supabase.from("ledger_batches").delete().eq("id", batchIdOrFilename);
    }

    // 2. Delete by matching branch, year, month, book_category
    if (branchName && year && month && bookCategory) {
      const { data: branchData } = await supabase
        .from("branches")
        .select("id")
        .eq("branch_name", branchName)
        .maybeSingle();

      if (branchData) {
        // Find existing batch first to delete its storage object
        const { data: batchToDel } = await supabase
          .from("ledger_batches")
          .select("original_pdf_url")
          .eq("branch_id", branchData.id)
          .eq("year", year)
          .eq("month", month)
          .eq("book_category", bookCategory)
          .maybeSingle();

        if (batchToDel?.original_pdf_url) {
          const storagePath = getStoragePathFromUrl(batchToDel.original_pdf_url);
          if (storagePath) {
            await supabase.storage.from("ledger-documents").remove([storagePath]);
          }
        }

        await supabase
          .from("ledger_batches")
          .delete()
          .eq("branch_id", branchData.id)
          .eq("year", year)
          .eq("month", month)
          .eq("book_category", bookCategory);
      }
    }

    return { success: true };
  } catch (err) {
    console.error("Failed to delete batch from Supabase DB:", err);
    return { success: false, error: err };
  }
};

export const saveBatchToSupabase = async (options: SaveBatchOptions) => {
  const { branchName, year, month, bookCategory, batchName, ledgers } = options;

  try {
    // 1. Get or create branch
    let branchId = null;
    const { data: branchData } = await supabase
      .from("branches")
      .select("id")
      .eq("branch_name", branchName)
      .maybeSingle();

    if (branchData) {
      branchId = branchData.id;
    } else {
      const { data: newBranch } = await supabase
        .from("branches")
        .insert({ branch_name: branchName })
        .select("id")
        .single();
      if (newBranch) branchId = newBranch.id;
    }

    if (!branchId) {
      throw new Error("Could not resolve branch ID in Supabase DB");
    }

    // 3. Insert fresh clean ledger batch
    const formattedMonthStr = `${year}-${month < 10 ? '0' + month : month}-01`;
    const { data: batchData, error: batchErr } = await supabase
      .from("ledger_batches")
      .insert({
        branch_id: branchId,
        batch_month: formattedMonthStr,
        year: year,
        month: month,
        book_category: bookCategory,
        original_pdf_url: batchName,
        status: "needs_review"
      })
      .select("id")
      .single();

    if (batchErr || !batchData) {
      console.error("Supabase Batch Insert Error:", batchErr);
      throw batchErr;
    }

    const batchId = batchData.id;

    // 4. Insert daily ledgers & transactions
    for (const l of ledgers) {
      const { data: dailyData, error: dailyErr } = await supabase
        .from("daily_ledgers")
        .insert({
          batch_id: batchId,
          day_number: l.day_number,
          date: l.date && l.date.includes("-") ? l.date : formattedMonthStr,
          staff_name: l.staff_name || "Staff",
          cp_balance: l.cp_balance || 0,
          opening_balance: l.opening_balance || 0,
          cash_in: l.cash_in || 0,
          cash_out: l.cash_out || 0,
          total_loan: l.total_loan || 0,
          total_redeem: l.total_redeem || 0,
          receive: l.receive || 0,
          recovery: l.recovery || 0,
          insurance: l.insurance || 0,
          expenses: l.expenses || 0,
          calculated_closing_balance: l.calculated_closing_balance || 0,
          actual_cash_count: l.actual_cash_count || 0,
          variance: l.variance || 0,
          is_validated: true,
          page_image_url: l.page_image_url || ""
        })
        .select("id")
        .single();

      if (dailyErr || !dailyData) {
        console.error("Daily ledger insert error:", dailyErr);
        continue;
      }

      const dailyId = dailyData.id;

      if (l.transactions && l.transactions.length > 0) {
        const txRows = l.transactions.map((tx, idx) => ({
          daily_ledger_id: dailyId,
          loan_code: tx.loan_code || "",
          loan_number: tx.loan_number || "",
          cash_loan: tx.cash_loan || 0,
          insurance: tx.insurance || 0,
          wt_g: tx.wt_g || 0,
          wt_mg: tx.wt_mg || 0,
          item_code: tx.item_code || "",
          redeem_code: tx.redeem_code || "",
          redeem_number: tx.redeem_number || "",
          interest: tx.interest || 0,
          cash_rdm: tx.cash_rdm || 0,
          transaction_type: tx.transaction_type || "",
          fs_status: tx.fs_status || "",
          row_order: idx + 1
        }));

        await supabase.from("ledger_transactions").insert(txRows);
      }
    }

    return { success: true, batchId };
  } catch (err) {
    console.error("Failed to save to Supabase DB:", err);
    return { success: false, error: err };
  }
};

export const fetchBatchesFromSupabase = async () => {
  try {
    const { data: batchesData, error } = await supabase
      .from("ledger_batches")
      .select(`
        id,
        batch_month,
        year,
        month,
        book_category,
        original_filename,
        original_pdf_url,
        status,
        branches ( branch_name ),
        daily_ledgers (
          id,
          day_number,
          date,
          staff_name,
          cp_balance,
          opening_balance,
          cash_in,
          cash_out,
          total_loan,
          total_redeem,
          receive,
          recovery,
          insurance,
          expenses,
          calculated_closing_balance,
          actual_cash_count,
          variance,
          page_image_url,
          ledger_transactions (
            id,
            loan_code,
            loan_number,
            cash_loan,
            insurance,
            wt_g,
            wt_mg,
            item_code,
            redeem_code,
            redeem_number,
            interest,
            cash_rdm,
            transaction_type,
            fs_status,
            row_order
          )
        )
      `);

    if (error || !batchesData) {
      console.error("Error fetching batches from Supabase:", error);
      return [];
    }

    return batchesData.map((b: any) => {
      const isCloudUrl = b.original_pdf_url && b.original_pdf_url.startsWith("http");
      // Prefer the dedicated original_filename column; fall back to URL parsing
      const cleanFilename = b.original_filename
        || (isCloudUrl
          ? b.original_pdf_url.substring(b.original_pdf_url.lastIndexOf("/") + 1)
          : (b.original_pdf_url || "Ledger_Book.pdf"));

      // Map DB status to UI status
      const mapStatus = (s: string): "Completed" | "Processing" | "Pending" => {
        if (s === "needs_review" || s === "verified" || s === "completed") return "Completed";
        if (s === "processing") return "Processing";
        return "Pending";
      };

      return {
        id: b.id,
        filename: cleanFilename,
        branchName: b.branches?.branch_name || "Kiribathgoda",
        year: b.year || 2025,
        month: b.month || 10,
        bookCategory: (b.book_category || "lr_book") as BookCategory,
        fileSize: "Uploaded",
        pageCount: b.daily_ledgers?.length || 0,
        extractedDate: b.batch_month || "2025-10",
        status: mapStatus(b.status || "uploaded"),
        pdfUrl: isCloudUrl ? b.original_pdf_url : undefined,
        data: (b.daily_ledgers || []).map((dl: any) => ({
        id: dl.id,
        day_number: dl.day_number,
        date: dl.date,
        staff_name: dl.staff_name,
        cp_balance: dl.cp_balance,
        opening_balance: dl.opening_balance,
        cash_in: dl.cash_in,
        cash_out: dl.cash_out,
        total_loan: dl.total_loan,
        total_redeem: dl.total_redeem,
        receive: dl.receive,
        recovery: dl.recovery,
        insurance: dl.insurance,
        expenses: dl.expenses,
        calculated_closing_balance: dl.calculated_closing_balance,
        actual_cash_count: dl.actual_cash_count,
        variance: dl.variance,
        is_validated: true,
        page_image_url: dl.page_image_url,
        transactions: (dl.ledger_transactions || []).map((tx: any) => ({
          id: tx.id,
          loan_code: tx.loan_code,
          loan_number: tx.loan_number,
          cash_loan: tx.cash_loan,
          insurance: tx.insurance,
          wt_g: tx.wt_g,
          wt_mg: tx.wt_mg,
          item_code: tx.item_code,
          redeem_code: tx.redeem_code,
          redeem_number: tx.redeem_number,
          interest: tx.interest,
          cash_rdm: tx.cash_rdm,
          transaction_type: tx.transaction_type,
          fs_status: tx.fs_status,
          row_order: tx.row_order
        }))
      }))
    };
  });
  } catch (err) {
    console.error("Failed to fetch batches from Supabase DB:", err);
    return [];
  }
};

export const updateBatchBranchInSupabase = async (
  batchId: string,
  newBranchName: string,
  filename: string,
  year: number,
  month: number,
  bookCategory: BookCategory
) => {
  try {
    // 1. Get or create new branch
    let branchId = null;
    const { data: branchData } = await supabase
      .from("branches")
      .select("id")
      .eq("branch_name", newBranchName)
      .maybeSingle();

    if (branchData) {
      branchId = branchData.id;
    } else {
      const { data: newBranch } = await supabase
        .from("branches")
        .insert({ branch_name: newBranchName })
        .select("id")
        .single();
      if (newBranch) branchId = newBranch.id;
    }

    if (!branchId) {
      throw new Error("Could not resolve new branch ID");
    }

    // 2. Check if batch exists by ID first
    let targetDbBatchId = null;
    if (batchId && batchId.includes("-") && !batchId.startsWith("batch-")) {
      targetDbBatchId = batchId;
    } else {
      // Find matching batch in database
      const { data: foundBatch } = await supabase
        .from("ledger_batches")
        .select("id")
        .eq("original_pdf_url", filename)
        .eq("year", year)
        .eq("month", month)
        .eq("book_category", bookCategory)
        .maybeSingle();
      if (foundBatch) {
        targetDbBatchId = foundBatch.id;
      }
    }

    if (targetDbBatchId) {
      const { error } = await supabase
        .from("ledger_batches")
        .update({ branch_id: branchId })
        .eq("id", targetDbBatchId);
      if (error) throw error;
    }

    return { success: true };
  } catch (err) {
    console.error("Failed to update branch in Supabase DB:", err);
    return { success: false, error: err };
  }
};

export const updateBatchPdfUrlInSupabase = async (
  batchId: string,
  newPdfUrl: string,
  filename: string,
  year: number,
  month: number,
  bookCategory: BookCategory,
  branchName?: string
) => {
  try {
    let targetDbBatchId = null;
    if (batchId && batchId.includes("-") && !batchId.startsWith("batch-")) {
      targetDbBatchId = batchId;
    }

    if (!targetDbBatchId && branchName) {
      // Find branch ID
      const { data: branchData } = await supabase
        .from("branches")
        .select("id")
        .eq("branch_name", branchName)
        .maybeSingle();

      if (branchData) {
        const { data: foundBatch } = await supabase
          .from("ledger_batches")
          .select("id")
          .eq("branch_id", branchData.id)
          .eq("year", year)
          .eq("month", month)
          .eq("book_category", bookCategory)
          .maybeSingle();
        if (foundBatch) {
          targetDbBatchId = foundBatch.id;
        }
      }
    }

    if (!targetDbBatchId) {
      // Fallback: Find matching batch in database by original_pdf_url
      const { data: foundBatch } = await supabase
        .from("ledger_batches")
        .select("id")
        .eq("original_pdf_url", filename)
        .eq("year", year)
        .eq("month", month)
        .eq("book_category", bookCategory)
        .maybeSingle();
      if (foundBatch) {
        targetDbBatchId = foundBatch.id;
      }
    }

    if (targetDbBatchId) {
      const { error } = await supabase
        .from("ledger_batches")
        .update({ original_pdf_url: newPdfUrl, status: "needs_review" })
        .eq("id", targetDbBatchId);
      if (error) throw error;
    } else if (branchName) {
      // If batch does not exist in Supabase DB yet, INSERT IT so it syncs across all devices!
      let branchId = null;
      const { data: branchData } = await supabase
        .from("branches")
        .select("id")
        .eq("branch_name", branchName)
        .maybeSingle();

      if (branchData) {
        branchId = branchData.id;
      } else {
        const { data: newBranch } = await supabase
          .from("branches")
          .insert({ branch_name: branchName })
          .select("id")
          .single();
        if (newBranch) branchId = newBranch.id;
      }

      if (branchId) {
        const formattedMonthStr = `${year}-${month < 10 ? '0' + month : month}-01`;
        const { error: insErr } = await supabase
          .from("ledger_batches")
          .insert({
            branch_id: branchId,
            batch_month: formattedMonthStr,
            year: year,
            month: month,
            book_category: bookCategory,
            original_pdf_url: newPdfUrl,
            status: "needs_review"
          });
        if (insErr) {
          console.error("Error inserting batch into Supabase DB:", insErr);
        }
      }
    }

    return { success: true };
  } catch (err) {
    console.error("Failed to update original_pdf_url in Supabase DB:", err);
    return { success: false, error: err };
  }
};
