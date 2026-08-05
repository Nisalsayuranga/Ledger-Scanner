import { supabase } from "./supabaseClient";
import { DailyLedger, BookCategory } from "../types/ledger";

interface SaveBatchOptions {
  branchName: string;
  year: number;
  month: number;
  bookCategory: BookCategory;
  batchName: string;
  ledgers: DailyLedger[];
}

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

    // 2. PREVENT DUPLICATES: Delete existing batch for same branch, year, month, category if it exists
    await deleteBatchFromSupabase("", branchName, year, month, bookCategory);

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
        status: "completed"
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

    return batchesData.map((b: any) => ({
      id: b.id,
      filename: b.original_pdf_url || "Ledger_Book.pdf",
      branchName: b.branches?.branch_name || "Kiribathgoda",
      year: b.year || 2025,
      month: b.month || 10,
      bookCategory: (b.book_category || "lr_book") as BookCategory,
      fileSize: "Uploaded",
      pageCount: b.daily_ledgers?.length || 0,
      extractedDate: b.batch_month || "2025-10",
      status: (b.status === "completed" ? "Completed" : "Pending") as "Completed" | "Pending",
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
    }));
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
