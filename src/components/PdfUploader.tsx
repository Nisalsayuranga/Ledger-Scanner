import React, { useState } from "react";
import { Upload, FileText, Loader2, Building2, Calendar, BookOpen } from "lucide-react";
import { BRANCHES, MONTHS, YEARS, BranchName } from "../constants/branches";
import { BookCategory } from "../types/ledger";

export interface UploadMetadata {
  branchName: BranchName;
  year: number;
  month: number;
  bookCategory: BookCategory;
}

interface Props {
  onProcessStart: (file: File, metadata: UploadMetadata) => void;
  isProcessing: boolean;
  progressText: string;
  defaultBranch?: BranchName;
  defaultYear?: number;
  defaultMonth?: number;
  defaultBookCategory?: BookCategory;
}

export const PdfUploader: React.FC<Props> = ({
  onProcessStart,
  isProcessing,
  progressText,
  defaultBranch = "Kiribathgoda",
  defaultYear = 2025,
  defaultMonth = 10,
  defaultBookCategory = "lr_book"
}) => {
  const [selectedBranch, setSelectedBranch] = useState<BranchName>(defaultBranch);
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultMonth);
  const [selectedBookCategory, setSelectedBookCategory] = useState<BookCategory>(defaultBookCategory);

  const handleFileSelected = (file: File) => {
    onProcessStart(file, {
      branchName: selectedBranch,
      year: selectedYear,
      month: selectedMonth,
      bookCategory: selectedBookCategory
    });
  };

  return (
    <div className="max-w-xl mx-auto my-6 p-8 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-6">
      {/* Upload Metadata Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left border-b border-slate-100 pb-6">
        {/* Branch Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-slate-500" />
            Branch Location
          </label>
          <select
            className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-slate-400"
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value as BranchName)}
            disabled={isProcessing}
          >
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* Year & Month Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            Year &amp; Month
          </label>
          <div className="flex gap-2">
            <select
              className="w-1/2 p-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-slate-400"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              disabled={isProcessing}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <select
              className="w-1/2 p-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-slate-400"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              disabled={isProcessing}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Book Classification Selector */}
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-slate-500" />
            Ledger Book Classification
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedBookCategory("lr_book")}
              disabled={isProcessing}
              className={`p-3 rounded-lg border text-xs font-bold transition-all text-left flex flex-col gap-0.5 ${
                selectedBookCategory === "lr_book"
                  ? "bg-slate-800 text-white border-slate-800 shadow"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span className="text-sm font-extrabold">L/R Books</span>
              <span className="text-[11px] opacity-80">Main Daily Ledger Book</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedBookCategory("m_book")}
              disabled={isProcessing}
              className={`p-3 rounded-lg border text-xs font-bold transition-all text-left flex flex-col gap-0.5 ${
                selectedBookCategory === "m_book"
                  ? "bg-slate-800 text-white border-slate-800 shadow"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span className="text-sm font-extrabold">M Books</span>
              <span className="text-[11px] opacity-80">Minor Daily Ledger Book</span>
            </button>
          </div>
        </div>
      </div>

      {/* File Drop & Upload Zone */}
      <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-slate-400 transition-colors">
        <Upload className="mx-auto h-10 w-10 text-slate-400 mb-3" />
        <h4 className="text-sm font-bold text-slate-800">Select PDF File for {selectedBranch}</h4>
        <p className="text-xs text-slate-500 mb-4">
          Uploading for <strong className="text-slate-700">{MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}</strong> ({selectedBookCategory === "lr_book" ? "L/R Books" : "M Books"})
        </p>

        <input
          type="file"
          accept="application/pdf"
          id="pdfInput"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
          disabled={isProcessing}
        />

        <label
          htmlFor="pdfInput"
          className="px-6 py-2.5 bg-slate-800 text-white font-bold text-xs rounded-lg shadow hover:bg-slate-900 cursor-pointer inline-flex items-center gap-2 transition-colors"
        >
          {isProcessing ? <Loader2 className="animate-spin h-4 w-4" /> : <FileText className="h-4 w-4" />}
          {isProcessing ? "Processing Document..." : "Choose PDF Document"}
        </label>

        {isProcessing && (
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-xs text-slate-700 font-medium">{progressText}</p>
          </div>
        )}
      </div>
    </div>
  );
};
