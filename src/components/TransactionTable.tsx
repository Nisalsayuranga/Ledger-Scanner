import React from "react";
import { Transaction } from "../types/ledger";

interface Props {
  transactions: Transaction[];
  onChange: (updated: Transaction[]) => void;
}

export const TransactionTable: React.FC<Props> = ({ transactions, onChange }) => {
  const handleCellChange = (index: number, field: keyof Transaction, value: string | number) => {
    const updated = [...transactions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleAddRow = () => {
    const newTx: Transaction = {
      loan_code: "",
      loan_number: "",
      cash_loan: 0,
      insurance: 0,
      wt_g: 0,
      wt_mg: 0,
      item_code: "",
      redeem_code: "",
      redeem_number: "",
      interest: 0,
      cash_rdm: 0,
      transaction_type: "",
      fs_status: "",
      row_order: transactions.length + 1
    };
    onChange([...transactions, newTx]);
  };

  const handleDeleteRow = (index: number) => {
    const updated = transactions.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  return (
    <div className="overflow-x-auto border rounded-lg shadow-sm bg-white">
      <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
        <h4 className="font-semibold text-gray-700 text-sm">Transactions ({transactions.length})</h4>
        <button
          onClick={handleAddRow}
          className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded text-xs font-semibold hover:bg-blue-100"
        >
          + Add Row
        </button>
      </div>
      <table className="w-full text-xs text-left text-gray-700 border-collapse">
        <thead className="bg-gray-100 uppercase text-gray-600 border-b">
          <tr>
            <th className="p-2 border">Loan Code</th>
            <th className="p-2 border">Loan No</th>
            <th className="p-2 border">Cash (Loan)</th>
            <th className="p-2 border">Insurance</th>
            <th className="p-2 border">WT.G</th>
            <th className="p-2 border">WT.MG</th>
            <th className="p-2 border">Item Code</th>
            <th className="p-2 border">Rdm Code</th>
            <th className="p-2 border">Rdm No</th>
            <th className="p-2 border">Interest</th>
            <th className="p-2 border">Cash (RDM)</th>
            <th className="p-2 border">Type</th>
            <th className="p-2 border text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, idx) => (
            <tr key={idx} className="border-b hover:bg-gray-50">
              <td className="p-1 border"><input className="w-full p-1 text-xs outline-none" value={t.loan_code || ''} onChange={(e) => handleCellChange(idx, "loan_code", e.target.value)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs outline-none" value={t.loan_number || ''} onChange={(e) => handleCellChange(idx, "loan_number", e.target.value)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs font-mono text-right outline-none" value={t.cash_loan ?? 0} onChange={(e) => handleCellChange(idx, "cash_loan", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs font-mono text-right outline-none" value={t.insurance ?? 0} onChange={(e) => handleCellChange(idx, "insurance", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs outline-none" value={t.wt_g ?? 0} onChange={(e) => handleCellChange(idx, "wt_g", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs outline-none" value={t.wt_mg ?? 0} onChange={(e) => handleCellChange(idx, "wt_mg", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs outline-none" value={t.item_code || ''} onChange={(e) => handleCellChange(idx, "item_code", e.target.value)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs outline-none" value={t.redeem_code || ''} onChange={(e) => handleCellChange(idx, "redeem_code", e.target.value)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs outline-none" value={t.redeem_number || ''} onChange={(e) => handleCellChange(idx, "redeem_number", e.target.value)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs font-mono text-right outline-none" value={t.interest ?? 0} onChange={(e) => handleCellChange(idx, "interest", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs font-mono text-right outline-none" value={t.cash_rdm ?? 0} onChange={(e) => handleCellChange(idx, "cash_rdm", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs outline-none" value={t.transaction_type || ''} onChange={(e) => handleCellChange(idx, "transaction_type", e.target.value)} /></td>
              <td className="p-1 border text-center">
                <button
                  onClick={() => handleDeleteRow(idx)}
                  className="text-red-500 hover:text-red-700 text-xs px-1"
                  title="Remove row"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
