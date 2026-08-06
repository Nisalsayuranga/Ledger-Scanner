import React, { useState, useMemo } from "react";
import { Filter, Loader2, FileText, CheckCircle2, AlertTriangle, ArrowRight, RefreshCcw, Zap } from "lucide-react";
import { BatchItem } from "./MainDashboard";
import { BRANCHES, BranchName, MONTHS, YEARS } from "../constants/branches";
import { BookCategory } from "../types/ledger";

interface Props {
  batches: BatchItem[];
  onProcessBatch: (batch: BatchItem) => void;
  onReviewBatch: (batch: BatchItem) => void;
  onVerifyBatch: (batch: BatchItem) => void;
  isProcessing: boolean;
  activeProcessingId?: string;
  processingProgress?: number;
  processingTotal?: number;
  processingText?: string;
}

export const ProcessingQueue: React.FC<Props> = ({
  batches,
  onProcessBatch,
  onReviewBatch,
  onVerifyBatch,
  isProcessing,
  activeProcessingId,
  processingProgress,
  processingTotal,
  processingText
}) => {
  const [filterBranch, setFilterBranch] = useState<BranchName | "All">("All");
  const [filterYear, setFilterYear] = useState<number | "All">("All");
  const [filterMonth, setFilterMonth] = useState<number | "All">("All");
  const [filterCategory, setFilterCategory] = useState<BookCategory | "All">("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (filterBranch !== "All" && b.branchName !== filterBranch) return false;
      if (filterYear !== "All" && b.year !== filterYear) return false;
      if (filterMonth !== "All" && b.month !== filterMonth) return false;
      if (filterCategory !== "All" && b.bookCategory !== filterCategory) return false;
      
      if (filterStatus !== "All") {
        if (filterStatus === "uploaded" && b.status !== "uploaded") return false;
        if (filterStatus === "processing" && b.status !== "processing") return false;
        if (filterStatus === "needs_review" && b.status !== "needs_review") return false;
        if (filterStatus === "verified" && b.status !== "verified") return false;
        if (filterStatus === "failed" && b.status !== "failed") return false;
      }
      return true;
    });
  }, [batches, filterBranch, filterYear, filterMonth, filterCategory, filterStatus]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "upload":
      case "uploaded":
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Ready to Process</span>;
      case "processing":
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit"><Loader2 className="h-3 w-3 animate-spin"/> Processing OCR</span>;
      case "needs_review":
        return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Needs Review</span>;
      case "verified":
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit"><CheckCircle2 className="h-3 w-3"/> Verified</span>;
      case "failed":
        return <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit"><AlertTriangle className="h-3 w-3"/> Failed</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">OCR Processing Queue</h2>
            <p className="text-xs text-slate-500 mt-1">Select documents sequentially to process OCR and verify extracted ledgers.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 px-3 w-fit">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select className="bg-transparent text-xs font-semibold text-slate-700 outline-none" value={filterBranch} onChange={(e) => setFilterBranch(e.target.value as any)}>
              <option value="All">All Branches</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 px-3 w-fit">
            <select className="bg-transparent text-xs font-semibold text-slate-700 outline-none" value={filterYear} onChange={(e) => setFilterYear(e.target.value === "All" ? "All" : parseInt(e.target.value))}>
              <option value="All">All Years</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 px-3 w-fit">
            <select className="bg-transparent text-xs font-semibold text-slate-700 outline-none" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value === "All" ? "All" : parseInt(e.target.value))}>
              <option value="All">All Months</option>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 px-3 w-fit">
            <select className="bg-transparent text-xs font-semibold text-slate-700 outline-none" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as any)}>
              <option value="All">All Books</option>
              <option value="lr_book">L/R Book</option>
              <option value="m_book">M Book</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 px-3 w-fit">
            <select className="bg-transparent text-xs font-semibold text-slate-700 outline-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="uploaded">Ready to Process</option>
              <option value="processing">Processing OCR</option>
              <option value="needs_review">Needs Review</option>
              <option value="verified">Verified</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 pl-6 font-semibold">Document</th>
                <th className="p-4 font-semibold">Branch</th>
                <th className="p-4 font-semibold">Period</th>
                <th className="p-4 font-semibold">Category</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 pr-6 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-sm">
                    No documents found matching the current filters.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const isActive = activeProcessingId === batch.id;
                  
                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">{batch.filename}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{batch.fileSize} &bull; {batch.pageCount} Pages</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm font-semibold text-slate-700">{batch.branchName}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm font-semibold text-slate-700">{MONTHS.find(m => m.value === batch.month)?.label} {batch.year}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm font-semibold text-slate-700">{batch.bookCategory === 'lr_book' ? 'L/R Book' : 'M Book'}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-2">
                          {getStatusBadge(batch.status)}
                          
                          {isActive && (
                            <div className="w-full min-w-[120px]">
                              <div className="flex justify-between text-[10px] text-slate-500 font-semibold mb-1">
                                <span className="truncate pr-2 max-w-[150px]" title={processingText}>{processingText}</span>
                                <span>{processingProgress}/{processingTotal}</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-600 transition-all duration-300"
                                  style={{ width: `${(processingProgress! / processingTotal!) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 pr-6 text-right align-middle">
                        <div className="flex items-center justify-end gap-2">
                          
                          {/* Actions based on state */}
                          {(batch.status === "upload" || batch.status === "uploaded") && (
                            <button
                              onClick={() => onProcessBatch(batch)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5"
                            >
                              <Zap className="h-3.5 w-3.5" /> Start OCR
                            </button>
                          )}
                          
                          {batch.status === "failed" && (
                            <button
                              onClick={() => onProcessBatch(batch)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5"
                            >
                              <RefreshCcw className="h-3.5 w-3.5" /> Retry OCR
                            </button>
                          )}
                          
                          {(batch.status === "needs_review" || batch.status === "verified") && (
                            <>
                              <button
                                onClick={() => onProcessBatch(batch)}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5"
                                title="Run OCR again (WARNING: Overwrites unverified manual edits)"
                              >
                                <RefreshCcw className="h-3.5 w-3.5" /> Reprocess
                              </button>
                              <button
                                onClick={() => onReviewBatch(batch)}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5"
                              >
                                Review &amp; Edit <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => onVerifyBatch(batch)}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5"
                                title="Mark as Verified directly"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
