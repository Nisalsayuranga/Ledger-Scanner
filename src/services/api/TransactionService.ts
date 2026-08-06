import { supabase } from "../supabaseClient";
import { Transaction } from "../../types/ledger";

export class TransactionService {
  /**
   * Upsert an array of transactions idempotently using (daily_ledger_id, row_order)
   */
  static async upsertTransactions(ledgerId: string, transactions: Transaction[], isOcrUpdate: boolean = false): Promise<void> {
    if (!transactions || transactions.length === 0) return;

    // Fetch existing transactions for this ledger to protect human edits
    const { data: existingRows } = await supabase
      .from("ledger_transactions")
      .select("*")
      .eq("daily_ledger_id", ledgerId);

    const existingMap = new Map((existingRows || []).map(row => [row.row_order, row]));

    const txRows = transactions.map((tx, idx) => {
      const rowOrder = idx + 1;
      const existing = existingMap.get(rowOrder);

      let payload: any = {
        daily_ledger_id: ledgerId,
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
        row_order: rowOrder,
        ocr_raw_data: tx.ocr_raw_data || null,
        human_edited_fields: tx.human_edited_fields || []
      };

      if (existing && isOcrUpdate) {
        const editedFields = existing.human_edited_fields || [];
        for (const field of editedFields) {
          if (field in existing) {
            payload[field] = existing[field];
          }
        }
        payload.ocr_raw_data = tx.ocr_raw_data || existing.ocr_raw_data;
        payload.human_edited_fields = editedFields;
      } else if (existing && !isOcrUpdate) {
        const existingEdits = existing.human_edited_fields || [];
        const newEdits = tx.human_edited_fields || [];
        payload.human_edited_fields = Array.from(new Set([...existingEdits, ...newEdits]));
        payload.ocr_raw_data = existing.ocr_raw_data;
      }

      return payload;
    });

    const { error } = await supabase
      .from("ledger_transactions")
      .upsert(txRows, {
        onConflict: 'daily_ledger_id, row_order',
        ignoreDuplicates: false
      });

    if (error) {
      throw error;
    }
  }
}
