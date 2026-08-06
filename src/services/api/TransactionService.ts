import { supabase } from "../supabaseClient";
import { Transaction } from "../../types/ledger";

export class TransactionService {
  /**
   * Upsert an array of transactions idempotently using (daily_ledger_id, row_order)
   */
  static async upsertTransactions(ledgerId: string, transactions: Transaction[]): Promise<void> {
    if (!transactions || transactions.length === 0) return;

    const txRows = transactions.map((tx, idx) => ({
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
      row_order: idx + 1 // Use array index as row order to ensure idempotency
    }));

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
