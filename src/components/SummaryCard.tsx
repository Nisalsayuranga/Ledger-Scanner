import React from "react";
import { DailyLedger, ValidationResult } from "../types/ledger";
import { Shield, Banknote, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  ledger: DailyLedger;
  validation: ValidationResult;
  onChange: (updated: DailyLedger) => void;
}

export const SummaryCard: React.FC<Props> = ({ ledger, validation, onChange }) => {
  const updateSummaryField = (field: keyof DailyLedger, value: number | string) => {
    onChange({ ...ledger, [field]: value });
  };

  return (
    <div className="space-y-4">
      {/* 1. Vault Capital (CP) Balance Section */}
      <div className="p-4 border border-blue-200 rounded-xl bg-blue-50/50 shadow-sm space-y-3">
        <div className="flex justify-between items-center border-b border-blue-200 pb-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-700" />
            <h4 className="font-bold text-slate-800 text-sm">Vault Capital (CP) Balance</h4>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
              Pledged Assets in Safe
            </span>
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded flex items-center gap-1 ${
            validation.cpMismatch ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300"
          }`}>
            {validation.cpMismatch ? <AlertCircle className="h-3 w-3 text-amber-700" /> : <CheckCircle2 className="h-3 w-3 text-emerald-700" />}
            {validation.cpMismatch ? "CP Mismatch!" : "CP Balanced"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-600 font-semibold mb-1">Opening CP Balance</label>
            <input
              type="number"
              className="w-full p-1.5 border border-slate-300 rounded font-mono font-bold bg-white text-slate-800 focus:ring-2 focus:ring-blue-400 outline-none"
              value={ledger.opening_cp ?? ledger.cp_balance ?? 0}
              onChange={(e) => updateSummaryField("opening_cp", parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">+ Loans Added to Safe</label>
            <div className="p-1.5 border border-slate-200 rounded font-mono font-bold bg-slate-100 text-slate-700">
              +{ledger.total_loan || 0}
            </div>
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">- Redeems Released</label>
            <div className="p-1.5 border border-slate-200 rounded font-mono font-bold bg-slate-100 text-slate-700">
              -{ledger.total_redeem || 0}
            </div>
          </div>

          <div>
            <label className={`block font-bold mb-1 ${validation.cpMismatch ? "text-amber-800" : "text-slate-700"}`}>
              = Closing CP Balance {validation.cpMismatch && `(Calc: ${validation.formulaClosingCp})`}
            </label>
            <input
              type="number"
              className={`w-full p-1.5 border rounded font-mono font-black text-slate-900 ${
                validation.cpMismatch ? "border-amber-500 bg-amber-50 text-amber-900" : "border-slate-300 bg-white"
              }`}
              value={ledger.cp_balance ?? 0}
              onChange={(e) => updateSummaryField("cp_balance", parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      {/* 2. Daily Cash Summary (Cash in Hand) Section */}
      <div className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm space-y-3">
        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-600" />
            <h4 className="font-bold text-slate-800 text-sm">Daily Cash Summary (Cash in Hand)</h4>
          </div>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${validation.isValid ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
            {validation.isValid ? "Valid" : "Validation Warnings"}
          </span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-500 font-medium">1. Opening Balance</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.opening_balance} onChange={(e) => updateSummaryField("opening_balance", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-slate-500 font-medium">2. Cash In (+)</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.cash_in} onChange={(e) => updateSummaryField("cash_in", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-slate-500 font-medium">3. Cash Out (-)</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.cash_out} onChange={(e) => updateSummaryField("cash_out", parseFloat(e.target.value) || 0)} />
          </div>
          
          <div>
            <label className={`block font-bold ${validation.loanMismatch ? "text-red-600" : "text-slate-500"}`}>
              4. Loan (-) {validation.loanMismatch && `(Calc: ${validation.calculatedTotalLoan})`}
            </label>
            <input type="number" className={`w-full p-1.5 border rounded font-mono ${validation.loanMismatch ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"}`} value={ledger.total_loan} onChange={(e) => updateSummaryField("total_loan", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className={`block font-bold ${validation.redeemMismatch ? "text-red-600" : "text-slate-500"}`}>
              5. Redeem (+) {validation.redeemMismatch && `(Calc: ${validation.calculatedTotalRedeem})`}
            </label>
            <input type="number" className={`w-full p-1.5 border rounded font-mono ${validation.redeemMismatch ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"}`} value={ledger.total_redeem} onChange={(e) => updateSummaryField("total_redeem", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-slate-500 font-medium">6. Receive (+)</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.receive} onChange={(e) => updateSummaryField("receive", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-slate-500 font-medium">7. Recovery (+)</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.recovery} onChange={(e) => updateSummaryField("recovery", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-slate-500 font-medium">8. Insurance (+)</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.insurance} onChange={(e) => updateSummaryField("insurance", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-slate-500 font-medium">9. Expenses (-)</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.expenses} onChange={(e) => updateSummaryField("expenses", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className={`block font-bold ${validation.balanceMismatch ? "text-red-600" : "text-slate-500"}`}>
              10. Closing Balance {validation.balanceMismatch && `(Formula: ${validation.formulaClosingBalance})`}
            </label>
            <input type="number" className={`w-full p-1.5 border rounded font-bold font-mono ${validation.balanceMismatch ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"}`} value={ledger.calculated_closing_balance} onChange={(e) => updateSummaryField("calculated_closing_balance", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-slate-500 font-medium">11. Actual Cash Count</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.actual_cash_count} onChange={(e) => updateSummaryField("actual_cash_count", parseFloat(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-slate-500 font-medium">12. Variance</label>
            <input type="number" className="w-full p-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white" value={ledger.variance} onChange={(e) => updateSummaryField("variance", parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </div>
    </div>
  );
};
