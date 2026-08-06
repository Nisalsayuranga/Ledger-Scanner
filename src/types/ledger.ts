export type BookCategory = "lr_book" | "m_book";

export interface Transaction {
  id?: string;
  daily_ledger_id?: string;
  loan_code: string;
  loan_number: string;
  cash_loan: number;
  insurance: number;
  wt_g: number;
  wt_mg: number;
  item_code: string;
  redeem_code: string;
  redeem_number: string;
  interest: number;
  cash_rdm: number;
  transaction_type: string;
  fs_status: string;
  row_order: number;
  ocr_raw_data?: Record<string, any>;
  human_edited_fields?: string[];
}

export interface DailyLedger {
  id?: string;
  batch_id?: string;
  day_number: number;
  date: string;
  staff_name: string;
  opening_cp?: number;   // Opening Vault Capital Balance (Optional)
  cp_balance: number;   // Closing Vault Capital Balance (CP = Opening CP + Loans - Redeems)
  opening_balance: number;
  cash_in: number;
  cash_out: number;
  total_loan: number;
  total_redeem: number;
  receive: number;
  recovery: number;
  insurance: number;
  expenses: number;
  calculated_closing_balance: number;
  actual_cash_count: number;
  variance: number;
  is_validated: boolean;
  page_image_url: string;
  transactions: Transaction[];
  ocr_raw_data?: Record<string, any>;
  human_edited_fields?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  loanMismatch: boolean;
  redeemMismatch: boolean;
  balanceMismatch: boolean;
  cpMismatch: boolean;
  calculatedTotalLoan: number;
  calculatedTotalRedeem: number;
  formulaClosingBalance: number;
  formulaClosingCp: number;
}
