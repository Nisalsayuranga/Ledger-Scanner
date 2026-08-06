import { supabase } from "../supabaseClient";
import { DailyLedger } from "../../types/ledger";

export class LedgerService {
  /**
   * Upsert a daily ledger idempotently based on (batch_id, day_number)
   */
  static async upsertLedger(batchId: string, ledger: DailyLedger, isOcrUpdate: boolean = false): Promise<string> {
    // Check for existing ledger to protect human edits
    const { data: existing } = await supabase
      .from("daily_ledgers")
      .select("*")
      .eq("batch_id", batchId)
      .eq("day_number", ledger.day_number)
      .maybeSingle();

    let payload: any = {
      batch_id: batchId,
      day_number: ledger.day_number,
      date: ledger.date,
      staff_name: ledger.staff_name || "Staff",
      cp_balance: ledger.cp_balance || 0,
      opening_balance: ledger.opening_balance || 0,
      cash_in: ledger.cash_in || 0,
      cash_out: ledger.cash_out || 0,
      total_loan: ledger.total_loan || 0,
      total_redeem: ledger.total_redeem || 0,
      receive: ledger.receive || 0,
      recovery: ledger.recovery || 0,
      insurance: ledger.insurance || 0,
      expenses: ledger.expenses || 0,
      calculated_closing_balance: ledger.calculated_closing_balance || 0,
      actual_cash_count: ledger.actual_cash_count || 0,
      variance: ledger.variance || 0,
      is_validated: ledger.is_validated || false,
      page_image_url: ledger.page_image_url || "",
      ocr_raw_data: ledger.ocr_raw_data || null,
      human_edited_fields: ledger.human_edited_fields || []
    };

    if (existing && isOcrUpdate) {
      // It's an OCR update and row exists. We must NOT overwrite human_edited_fields
      const editedFields = existing.human_edited_fields || [];
      for (const field of editedFields) {
        if (field in existing) {
          payload[field] = existing[field];
        }
      }
      payload.ocr_raw_data = ledger.ocr_raw_data || existing.ocr_raw_data;
      payload.human_edited_fields = editedFields;
    } else if (existing && !isOcrUpdate) {
      // It's a human update (autosave/explicit save)
      const existingEdits = existing.human_edited_fields || [];
      const newEdits = ledger.human_edited_fields || [];
      payload.human_edited_fields = Array.from(new Set([...existingEdits, ...newEdits]));
      payload.ocr_raw_data = existing.ocr_raw_data;
    }

    const { data, error } = await supabase
      .from("daily_ledgers")
      .upsert(payload, {
        onConflict: 'batch_id, day_number',
        ignoreDuplicates: false
      })
      .select("id")
      .single();

    if (error || !data) {
      throw error || new Error("Failed to upsert ledger");
    }

    return data.id;
  }
}
