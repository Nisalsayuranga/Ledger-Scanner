import React, { useState } from "react";
import { BRANCH_LIST, MONTHS, YEARS } from "../constants/branches";
import { BatchItem } from "./MainDashboard";
import { Layers, RefreshCw, Building2, Calendar, ArrowRight, X, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { exportBatchToExcel } from "../services/excelExportService";

interface Props {
  batches: BatchItem[];
  _onCellClick?: (branchName: string, monthVal: number, yearVal: number) => void;
  onSelectBatchDay?: (batch: BatchItem, dayIndex: number) => void;
}

export const CompletionProgressMatrix: React.FC<Props> = ({ batches, _onCellClick, onSelectBatchDay }) => {
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Modal states for drill-down
  const [activeBranchModal, setActiveBranchModal] = useState<string | null>(null);
  const [activeMonthModal, setActiveMonthModal] = useState<{ branchName: string; monthVal: number } | null>(null);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // Helper to compute completed days count for a branch & month in the selected year
  const getMatrixCellData = (branchName: string, monthVal: number) => {
    const matchingBatches = batches.filter(
      (b) => b.branchName === branchName && b.year === selectedYear && b.month === monthVal
    );

    if (matchingBatches.length === 0) {
      return { count: 0, status: null, batches: [] };
    }

    const maxDays = Math.max(...matchingBatches.map((b) => b.pageCount || 0));
    
    let status: "Completed" | "Processing" | "Pending" = "Completed";
    if (matchingBatches.some((b) => b.status === "processing")) {
      status = "Processing";
    } else if (matchingBatches.some((b) => b.status === "needs_review" || b.status === "uploaded" || b.status === "upload")) {
      status = "Pending";
    }

    return { count: maxDays, status, batches: matchingBatches };
  };

  // Get all days data for a specific branch & month
  const getMonthDaysList = (branchName: string, monthVal: number): { batch: BatchItem | null; days: any[] } => {
    const matchingBatches = batches.filter(
      (b) => b.branchName === branchName && b.year === selectedYear && b.month === monthVal
    );

    if (matchingBatches.length === 0) return { batch: null, days: [] };

    const primaryBatch = matchingBatches[0];
    return {
      batch: primaryBatch,
      days: primaryBatch.data || []
    };
  };

  return (
    <div key={refreshKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Matrix Header Controls */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              Completion Progress Matrix ({selectedYear})
            </h2>
            <p className="text-xs text-slate-500">
              Click any Branch Name for Monthly Summary, or click a Month Circle to view daily date details.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Year Selector */}
          <select
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-slate-400"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </select>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            Refresh
          </button>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4 border-r border-slate-200 w-44">Branch</th>
              {MONTHS.map((m) => (
                <th key={m.value} className="py-3 px-2 text-center w-16">
                  {m.shortLabel}
                </th>
              ))}
              <th className="py-3 px-4 text-right border-l border-slate-200 w-28">Total Days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BRANCH_LIST.map((branch) => {
              let rowTotalDays = 0;

              return (
                <tr key={branch.name} className="hover:bg-slate-50/80 transition-colors">
                  {/* Branch Name Column (Clickable for Branch Summary) */}
                  <td
                    onClick={() => setActiveBranchModal(branch.name)}
                    className="py-2.5 px-4 font-bold text-slate-800 border-r border-slate-200 whitespace-nowrap cursor-pointer hover:bg-blue-50/60 transition-colors"
                    title={`Click to view ${branch.name} Branch Monthly Summary`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-blue-900 underline decoration-blue-300 decoration-2 underline-offset-2 hover:text-blue-600">
                        {branch.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium ml-2">({branch.code})</span>
                    </div>
                  </td>

                  {/* 12 Months Columns (Clickable Pills for Daily Breakdown) */}
                  {MONTHS.map((m) => {
                    const cell = getMatrixCellData(branch.name, m.value);
                    rowTotalDays += cell.count;

                    return (
                      <td
                        key={m.value}
                        onClick={() => {
                          if (_onCellClick) _onCellClick(branch.name, m.value, selectedYear);
                          if (cell.count > 0) {
                            setActiveMonthModal({ branchName: branch.name, monthVal: m.value });
                          }
                        }}
                        className={`py-2 px-1 text-center ${
                          cell.count > 0 ? "cursor-pointer hover:bg-emerald-50/70" : "cursor-default"
                        } transition-colors`}
                        title={cell.count > 0 ? `Click to view daily date details for ${branch.name} - ${m.label}` : "No ledgers uploaded"}
                      >
                        <div className="flex justify-center items-center">
                          {cell.count === 0 ? (
                            <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 font-semibold text-[11px] flex items-center justify-center border border-slate-200">
                              0
                            </span>
                          ) : cell.status === "Completed" ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center border border-emerald-300 gap-1 shadow-sm hover:scale-105 transition-transform">
                              {cell.count}
                            </span>
                          ) : cell.status === "Processing" ? (
                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center border border-amber-300 gap-1 shadow-sm hover:scale-105 transition-transform">
                              {cell.count} <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-1" />
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-bold text-xs flex items-center justify-center border border-red-300 gap-1 shadow-sm hover:scale-105 transition-transform">
                              {cell.count}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  {/* Total Days Row Column */}
                  <td className="py-2.5 px-4 text-right font-extrabold text-slate-900 border-l border-slate-200">
                    <span className={rowTotalDays > 0 ? "text-blue-600 font-black text-sm" : "text-slate-400 font-bold"}>
                      {rowTotalDays}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL 1: BRANCH MONTHLY SUMMARY MODAL (Clicked Branch Name) */}
      {activeBranchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 text-white rounded-lg">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {activeBranchModal} Branch Monthly Summary ({selectedYear})
                  </h3>
                  <p className="text-xs text-slate-400">Monthly breakdown for all 12 months</p>
                </div>
              </div>
              <button
                onClick={() => setActiveBranchModal(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content - Monthly Summary Grid */}
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {MONTHS.map((m) => {
                  const cell = getMatrixCellData(activeBranchModal, m.value);
                  const monthData = getMonthDaysList(activeBranchModal, m.value);

                  return (
                    <div
                      key={m.value}
                      className={`p-4 rounded-xl border transition-all ${
                        cell.count > 0
                          ? "bg-slate-50 border-slate-300 hover:border-slate-400"
                          : "bg-slate-50/40 border-slate-200 opacity-60"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-slate-800 text-sm">
                          {m.label} {selectedYear}
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                            cell.count > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {cell.count > 0 ? `${cell.count} Days Archived` : "No Data"}
                        </span>
                      </div>

                      {cell.count > 0 && monthData.batch && (
                        <div className="space-y-2 mt-3 text-xs border-t border-slate-200 pt-2">
                          <div className="flex justify-between text-slate-600">
                            <span>Books Available:</span>
                            <span className="font-bold text-slate-800">{cell.batches.length} Books</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>File Size:</span>
                            <span className="font-semibold text-slate-800">{monthData.batch.fileSize}</span>
                          </div>

                          <div className="pt-2 flex gap-2">
                            <button
                              onClick={() => {
                                setActiveBranchModal(null);
                                setActiveMonthModal({ branchName: activeBranchModal, monthVal: m.value });
                              }}
                              className="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold text-xs flex items-center justify-center gap-1"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              View Daily Details
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setActiveBranchModal(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MONTHLY DAILY BREAKDOWN MODAL (Clicked Circle Pill) */}
      {activeMonthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[88vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600 text-white rounded-lg">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {activeMonthModal.branchName} - {MONTHS.find((m) => m.value === activeMonthModal.monthVal)?.label} {selectedYear} (Daily Breakdown)
                  </h3>
                  <p className="text-xs text-slate-400">All daily ledger records for this month sorted by date</p>
                </div>
              </div>
              <button
                onClick={() => setActiveMonthModal(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content - Table of Days */}
            <div className="p-6 overflow-y-auto flex-1">
              {(() => {
                const monthData = getMonthDaysList(activeMonthModal.branchName, activeMonthModal.monthVal);
                if (!monthData.days || monthData.days.length === 0) {
                  return (
                    <div className="p-12 text-center text-slate-500 font-bold">
                      No daily ledger records found for this month.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {/* Header Action Bar */}
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                      <span className="font-bold text-slate-700">
                        Total {monthData.days.length} Daily Ledger Sheets Available
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveMonthModal(null);
                            if (onSelectBatchDay && monthData.batch) {
                              onSelectBatchDay(monthData.batch, 0);
                            }
                          }}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-lg flex items-center gap-1.5 shadow-sm text-xs transition-colors"
                        >
                          <ArrowRight className="h-4 w-4" />
                          GO (Start Verification)
                        </button>
                        <button
                          onClick={() => exportBatchToExcel(`${activeMonthModal.branchName}_${activeMonthModal.monthVal}_${selectedYear}`, monthData.days)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-sm"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Export Month to Excel
                        </button>
                      </div>
                    </div>

                    {/* Table of Daily Records */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-800 text-white font-bold uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-3">Day</th>
                            <th className="py-3 px-3">Date</th>
                            <th className="py-3 px-3">Staff</th>
                            <th className="py-3 px-3 text-right">Vault CP</th>
                            <th className="py-3 px-3 text-right">Opening Cash</th>
                            <th className="py-3 px-3 text-right">Total Loan</th>
                            <th className="py-3 px-3 text-right">Total Redeem</th>
                            <th className="py-3 px-3 text-right">Closing Cash</th>
                            <th className="py-3 px-3 text-center">Status</th>
                            <th className="py-3 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {monthData.days.map((dayItem: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-3 font-extrabold text-slate-900">Day {dayItem.day_number || idx + 1}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700">{dayItem.date || `2025-10-${idx + 1}`}</td>
                              <td className="py-2.5 px-3 text-slate-600 font-medium">{dayItem.staff_name || "Staff"}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-900">
                                {(dayItem.cp_balance || 0).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                {(dayItem.opening_balance || 0).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                                {(dayItem.total_loan || 0).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                                {(dayItem.total_redeem || 0).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900">
                                {(dayItem.calculated_closing_balance || 0).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  Validated
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => {
                                    setActiveMonthModal(null);
                                    if (onSelectBatchDay && monthData.batch) {
                                      onSelectBatchDay(monthData.batch, idx);
                                    }
                                  }}
                                  className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-[11px] rounded flex items-center gap-1 ml-auto shadow-sm"
                                >
                                  Open Day
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">Click "Open Day" to view side-by-side handwritten image and edit transactions</span>
              <button
                onClick={() => setActiveMonthModal(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors"
              >
                Close Daily Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
