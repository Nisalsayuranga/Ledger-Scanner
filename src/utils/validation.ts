import { DailyLedger, Transaction, ValidationResult } from "../types/ledger";

export const validateLedgerDay = (ledger: DailyLedger, transactions: Transaction[]): ValidationResult => {
  const calculatedTotalLoan = transactions.reduce((acc, t) => acc + (Number(t.cash_loan) || 0), 0);
  const calculatedTotalRedeem = transactions.reduce((acc, t) => acc + (Number(t.cash_rdm) || 0), 0);

  // Cash Closing Balance Formula:
  const formulaClosingBalance = 
    (Number(ledger.opening_balance) || 0) +
    (Number(ledger.cash_in) || 0) +
    (Number(ledger.total_redeem) || 0) +
    (Number(ledger.receive) || 0) +
    (Number(ledger.recovery) || 0) +
    (Number(ledger.insurance) || 0) -
    (Number(ledger.cash_out) || 0) -
    (Number(ledger.total_loan) || 0) -
    (Number(ledger.expenses) || 0);

  // Capital (CP) Balance Formula: Closing CP = Opening CP + Total Loan - Total Redeem
  const openingCpValue = Number(ledger.opening_cp) || 0;
  const formulaClosingCp = openingCpValue + (Number(ledger.total_loan) || 0) - (Number(ledger.total_redeem) || 0);

  const loanMismatch = Math.abs(calculatedTotalLoan - (ledger.total_loan || 0)) > 0.01;
  const redeemMismatch = Math.abs(calculatedTotalRedeem - (ledger.total_redeem || 0)) > 0.01;
  const balanceMismatch = Math.abs(formulaClosingBalance - (ledger.calculated_closing_balance || 0)) > 0.01;
  const cpMismatch = openingCpValue > 0 && Math.abs(formulaClosingCp - (ledger.cp_balance || 0)) > 0.01;

  return {
    isValid: !loanMismatch && !redeemMismatch && !balanceMismatch && !cpMismatch,
    loanMismatch,
    redeemMismatch,
    balanceMismatch,
    cpMismatch,
    calculatedTotalLoan,
    calculatedTotalRedeem,
    formulaClosingBalance,
    formulaClosingCp
  };
};
