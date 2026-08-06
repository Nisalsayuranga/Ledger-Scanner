import React, { useState } from "react";
import { FileText, FileSpreadsheet, CheckCircle2, Layers, Calendar, ArrowRight, Upload, Building2, BookOpen, ArrowLeft, Plus, Zap, ArrowRightLeft, FolderArchive, Loader2, Trash2, X } from "lucide-react";
import { Sidebar, ActiveTab } from "./Sidebar";
import { PdfUploader, UploadMetadata } from "./PdfUploader";
import { BulkPdfUploader } from "./BulkPdfUploader";
import { CompletionProgressMatrix } from "./CompletionProgressMatrix";
import { BRANCH_LIST, MONTHS, BranchName } from "../constants/branches";
import { BookCategory } from "../types/ledger";

export interface BatchItem {
  id: string;
  filename: string;
  branchName: BranchName;
  year: number;
  month: number;
  bookCategory: BookCategory;
  fileSize: string;
  pageCount: number;
  extractedDate: string;
  status: "upload" | "uploaded" | "processing" | "needs_review" | "verified" | "failed";
  data?: any[];
  rawFile?: File;
  pageImages?: string[];
  pdfUrl?: string;
}

interface Props {
  batches: BatchItem[];
  onSelectBatch: (batch: BatchItem, dayIndex?: number) => void;
  onExportBatch: (batch: BatchItem) => void;
  onDeleteBatch: (batch: BatchItem) => void;
  onProcessStart: (file: File, metadata: UploadMetadata) => void;
  onRefreshData: () => void;
  onMoveBranchBatch: (batchId: string, newBranch: BranchName) => void;
  onRunOcrOnBatch: (batch: BatchItem) => void;
  isProcessing: boolean;
  progressText: string;
  bgTask?: any;
  onMigrateBatches?: (files: File[]) => Promise<void>;
  isMigrating?: boolean;
  migrationProgress?: string;
}

export const MainDashboard: React.FC<Props> = ({
  batches,
  onSelectBatch,
  onExportBatch: _onExportBatch,
  onDeleteBatch,
  onProcessStart,
  onRefreshData,
  onMoveBranchBatch,
  onRunOcrOnBatch,
  isProcessing,
  progressText,
  bgTask = null,
  onMigrateBatches,
  isMigrating = false,
  migrationProgress = "",
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("archive");
  const [selectedBookTab, setSelectedBookTab] = useState<BookCategory>("lr_book");

  // Archive Branch Grid selection state
  const [selectedArchiveBranch, setSelectedArchiveBranch] = useState<BranchName | null>(null);

  // Upload Modals state
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState<boolean>(false);

  // Moving branch dropdown state per batch ID
  const [movingBranchId, setMovingBranchId] = useState<string | null>(null);
  const [viewingPdfUrl, setViewingPdfUrl] = useState<string | null>(null);
  const [viewingPdfName, setViewingPdfName] = useState<string>("");

  const totalDays = batches.reduce((acc, b) => acc + (b.pageCount || 0), 0);

  const handleMatrixCellClick = (branchName: string, _monthVal: number, _yearVal: number) => {
    setSelectedArchiveBranch(branchName as BranchName);
    setActiveTab("archive");
  };

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 overflow-hidden">
      {/* Side Navigation Bar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        totalBatchesCount={batches.length}
        isProcessing={isProcessing}
        progressText={progressText}
        bgTask={bgTask}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Bar Header */}
        <header className="bg-slate-900 text-white px-8 py-4 shadow-sm border-b border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              {activeTab === "overview" && "System Overview"}
              {activeTab === "matrix" && "Completion Progress Matrix (2025)"}
              {activeTab === "archive" && "Ledger Book Archives & Branch Repository"}
              {activeTab === "upload" && "Upload & Scan Ledger PDF Document"}
              {activeTab === "supabase" && "Supabase PostgreSQL Database Management"}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Multi-Branch Daily Ledger Management System (13 Locations)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 bg-emerald-950 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Supabase Connected
            </span>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <main className="p-8 space-y-6 flex-1">
          {/* TAB 1: SYSTEM OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-slate-100 rounded-lg text-slate-700">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Company Branches</p>
                    <h3 className="text-2xl font-bold text-slate-800 mt-0.5">13 Locations</h3>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-slate-100 rounded-lg text-slate-700">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Book Categories</p>
                    <h3 className="text-2xl font-bold text-slate-800 mt-0.5">L/R Books &amp; M Books</h3>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-slate-100 rounded-lg text-slate-700">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Archived Days</p>
                    <h3 className="text-2xl font-bold text-slate-800 mt-0.5">{totalDays} Days</h3>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-lg text-emerald-700">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Excel Exporter</p>
                    <h3 className="text-2xl font-bold text-slate-800 mt-0.5">Ready</h3>
                  </div>
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div
                  onClick={() => setActiveTab("matrix")}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-400 cursor-pointer transition-all space-y-3"
                >
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl w-fit">
                    <Layers className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">Completion Matrix (2025)</h3>
                  <p className="text-xs text-slate-500">View 13-branch completion grid by month</p>
                  <span className="text-xs font-bold text-blue-600 inline-flex items-center gap-1">
                    Open Matrix &rarr;
                  </span>
                </div>

                <div
                  onClick={() => setActiveTab("archive")}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-400 cursor-pointer transition-all space-y-3"
                >
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl w-fit">
                    <FileText className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">Branch Book Boxes</h3>
                  <p className="text-xs text-slate-500">Select any of 13 branch boxes to upload books</p>
                  <span className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1">
                    Select Branch Box &rarr;
                  </span>
                </div>

                <div
                  onClick={() => setActiveTab("upload")}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-400 cursor-pointer transition-all space-y-3"
                >
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl w-fit">
                    <Upload className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">Upload New PDF</h3>
                  <p className="text-xs text-slate-500">Scan and process new handwritten daily ledger</p>
                  <span className="text-xs font-bold text-amber-600 inline-flex items-center gap-1">
                    Upload File &rarr;
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPLETION PROGRESS MATRIX */}
          {activeTab === "matrix" && (
            <CompletionProgressMatrix
              batches={batches}
              _onCellClick={handleMatrixCellClick}
              onSelectBatchDay={(batch, dayIdx) => onSelectBatch(batch, dayIdx)}
            />
          )}

          {/* TAB 3: LEDGER ARCHIVES - BRANCH BOXES & MONTH BOX CONTAINER REPOSITORY */}
          {activeTab === "archive" && (
            <div className="space-y-6">
              {/* Cloud Migration Banner */}
              {batches.filter((b) => !b.pdfUrl).length > 0 && onMigrateBatches && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-700 mt-0.5">
                      <FolderArchive className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-800">Cloud Storage Migration Available</h4>
                      <p className="text-xs text-amber-600 mt-1">
                        You have **{batches.filter((b) => !b.pdfUrl).length}** previously uploaded ledger batches that are not backed up on Supabase Storage.
                        Select the PDF files from your computer to upload and link them to their respective archives automatically.
                      </p>
                    </div>
                  </div>
                  {isMigrating ? (
                    <div className="px-4 py-2.5 bg-amber-200 text-amber-800 font-extrabold text-xs rounded-xl shadow shrink-0 flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {migrationProgress || "Migrating..."}
                    </div>
                  ) : (
                    <label className="cursor-pointer px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow transition-colors shrink-0 inline-flex items-center gap-1.5">
                      <Upload className="h-4 w-4" />
                      Upload &amp; Link PDFs
                      <input
                        type="file"
                        multiple
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            onMigrateBatches(Array.from(files));
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Primary Book Type Navigation Bar (L/R Books vs M Books) */}
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedBookTab("lr_book")}
                    className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${
                      selectedBookTab === "lr_book"
                        ? "bg-slate-900 text-white shadow-md"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <BookOpen className="h-4 w-4 text-blue-400" />
                    L/R Books Repository
                  </button>

                  <button
                    onClick={() => setSelectedBookTab("m_book")}
                    className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${
                      selectedBookTab === "m_book"
                        ? "bg-slate-900 text-white shadow-md"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <BookOpen className="h-4 w-4 text-emerald-400" />
                    M Books Repository
                  </button>
                </div>

                <div className="text-xs font-bold text-slate-500">
                  Showing {selectedBookTab === "lr_book" ? "L/R Books" : "M Books"} for 13 Branches
                </div>
              </div>

              {/* VIEW LEVEL 1: ALL 13 BRANCH BOXES GRID */}
              {selectedArchiveBranch === null ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-blue-600" />
                        Company Branches Repository ({selectedBookTab === "lr_book" ? "L/R Books" : "M Books"})
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Select a branch box to view uploaded {selectedBookTab === "lr_book" ? "L/R Books" : "M Books"}.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowBulkUploadModal(true)}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow inline-flex items-center gap-2 transition-all shrink-0"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Bulk PDFs
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                    {BRANCH_LIST.map((branch) => {
                      const branchBatches = batches.filter(
                        (b) => b.branchName === branch.name && b.bookCategory === selectedBookTab
                      );
                      const totalBranchDays = branchBatches.reduce((acc, b) => acc + (b.pageCount || 0), 0);

                      return (
                        <div
                          key={branch.name}
                          onClick={() => setSelectedArchiveBranch(branch.name as BranchName)}
                          className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow transition-all cursor-pointer group flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="p-2 bg-slate-800 text-white rounded-lg group-hover:bg-blue-600 transition-colors">
                                <Building2 className="h-4 w-4" />
                              </div>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                                {branch.code}
                              </span>
                            </div>

                            <div>
                              <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                                {branch.name}
                              </h3>
                              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                {branchBatches.length > 0
                                  ? `${branchBatches.length} ${selectedBookTab === "lr_book" ? "L/R" : "M"} Books (${totalBranchDays} Days)`
                                  : "No books uploaded"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center text-[11px] font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                            <span>Open Repository</span>
                            <ArrowRight className="h-3 w-3" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* VIEW LEVEL 2: SELECTED BRANCH MONTH BOXES */
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setSelectedArchiveBranch(null)}
                        className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors font-bold text-xs flex items-center gap-1.5"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        All Branches
                      </button>

                      <div>
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                          <Building2 className="h-6 w-6 text-blue-600" />
                          {selectedArchiveBranch} Branch Repository ({selectedBookTab === "lr_book" ? "L/R Books" : "M Books"})
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Monthly PDF Ledger Book Archives
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow inline-flex items-center gap-2 transition-all"
                    >
                      <Plus className="h-4 w-4" />
                      Upload {selectedBookTab === "lr_book" ? "L/R Book" : "M Book"} PDF
                    </button>
                  </div>

                  {/* Monthly PDF Boxes */}
                  <div className="space-y-4">
                    {(() => {
                      const branchBatches = batches.filter(
                        (b) => b.branchName === selectedArchiveBranch && b.bookCategory === selectedBookTab
                      );

                      if (branchBatches.length === 0) {
                        return (
                          <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm text-center space-y-3">
                            <FolderArchive className="mx-auto h-12 w-12 text-slate-300" />
                            <h3 className="text-sm font-bold text-slate-700">No {selectedBookTab === "lr_book" ? "L/R Books" : "M Books"} Uploaded Yet</h3>
                            <p className="text-xs text-slate-400 max-w-sm mx-auto">
                              There are currently no {selectedBookTab === "lr_book" ? "L/R Books" : "M Books"} archived for {selectedArchiveBranch} branch.
                            </p>
                            <button
                              onClick={() => setShowUploadModal(true)}
                              className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg shadow hover:bg-blue-700 inline-flex items-center gap-1.5 mt-2"
                            >
                              <Plus className="h-4 w-4" />
                              Upload First PDF Book
                            </button>
                          </div>
                        );
                      }

                      return branchBatches.map((book) => {
                        const monthObj = MONTHS.find((m) => m.value === book.month);
                        const monthLabel = monthObj ? monthObj.label : `Month ${book.month}`;

                        return (
                          <div key={book.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex items-start gap-4">
                              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                <BookOpen className="h-6 w-6" />
                              </div>
                              <div>
                                <h4 className="text-base font-bold text-slate-900">
                                  {selectedArchiveBranch} - {monthLabel} {book.year} ({selectedBookTab === "lr_book" ? "L/R Book" : "M Book"})
                                </h4>
                                <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 font-medium">
                                  <strong className="text-slate-800">{book.filename}</strong>
                                  <span>• {book.fileSize}</span>
                                  <span>• {book.pageCount || 31} Days</span>
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                                    {book.status}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Move Branch */}
                              {movingBranchId === book.id ? (
                                <select
                                  className="px-2 py-1 border rounded text-xs"
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      onMoveBranchBatch(book.id, e.target.value as BranchName);
                                      setMovingBranchId(null);
                                    }
                                  }}
                                >
                                  <option value="" disabled>Select Branch...</option>
                                  {BRANCH_LIST.map((b) => (
                                    <option key={b.name} value={b.name}>Move to {b.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  onClick={() => setMovingBranchId(book.id)}
                                  className="p-2 text-slate-500 hover:text-slate-800"
                                  title="Move Branch"
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  const sourceUrl = book.pdfUrl || `/${book.filename}`;
                                  setViewingPdfUrl(sourceUrl);
                                  setViewingPdfName(book.filename);
                                }}
                                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl shadow-sm border border-indigo-200 transition-colors inline-flex items-center gap-1.5 shrink-0"
                              >
                                <FileText className="h-4 w-4" />
                                View PDF
                              </button>

                              <button
                                onClick={() => onSelectBatch(book)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow transition-colors"
                              >
                                View Data Tables
                              </button>

                              <button
                                onClick={() => onRunOcrOnBatch(book)}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow inline-flex items-center gap-1.5 transition-colors"
                              >
                                <Zap className="h-4 w-4" />
                                Preview &amp; Scan OCR
                              </button>

                              <button
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to permanently delete "${book.filename}" and all its data from the database?`)) {
                                    onDeleteBatch(book);
                                  }
                                }}
                                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-slate-200 transition-colors"
                                title="Permanently Delete Book & Data from Database"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: UPLOAD NEW PDF */}
          {activeTab === "upload" && (
            <div className="space-y-6">
              <PdfUploader
                onProcessStart={onProcessStart}
                isProcessing={isProcessing}
                progressText={progressText}
                defaultBookCategory={selectedBookTab}
              />
            </div>
          )}

          {/* TAB 5: SUPABASE DB MANAGEMENT */}
          {activeTab === "supabase" && (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Supabase Database Integration</h2>
                  <p className="text-xs text-slate-500">PostgreSQL cloud storage &amp; document bucket sync status</p>
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-full border border-emerald-300">
                  Active &amp; Connected
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Database Tables</h4>
                  <ul className="text-xs text-slate-600 mt-2 space-y-1 font-mono">
                    <li>• branches</li>
                    <li>• ledger_batches</li>
                    <li>• daily_ledgers</li>
                    <li>• ledger_transactions</li>
                  </ul>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Storage Buckets</h4>
                  <ul className="text-xs text-slate-600 mt-2 space-y-1 font-mono">
                    <li>• ledger-documents (PDFs &amp; Page Images)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Upload Modals */}
      {showUploadModal && !isProcessing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl relative">
            <button
              onClick={() => setShowUploadModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 font-bold text-xs"
            >
              Close
            </button>
            <PdfUploader
              onProcessStart={(file, meta) => {
                onProcessStart(file, meta);
                setShowUploadModal(false);
              }}
              isProcessing={isProcessing}
              progressText={progressText}
              defaultBranch={selectedArchiveBranch || "Kiribathgoda"}
              defaultBookCategory={selectedBookTab}
            />
          </div>
        </div>
      )}

      {showBulkUploadModal && !isProcessing && (
        <BulkPdfUploader
          onRefreshData={onRefreshData}
          onClose={() => setShowBulkUploadModal(false)}
        />
      )}

      {/* Global Processing Progress Overlay Modal */}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center space-y-5 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Uploading PDF &amp; Running Gemini OCR Scan</h3>
              <p className="text-xs text-slate-500 mt-1">Extracting daily ledger sheets, transactions, and cash summaries...</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono font-bold text-blue-700 break-words">
              {progressText || "Analyzing document pages..."}
            </div>
            <p className="text-[11px] text-slate-400">Please do not close or refresh the window.</p>
          </div>
        </div>
      )}

      {/* PDF View Popup Modal */}
      {viewingPdfUrl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold truncate max-w-xl text-white">{viewingPdfName}</h3>
              </div>
              <button
                onClick={() => setViewingPdfUrl(null)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Close Viewer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 bg-slate-100 p-2">
              <iframe
                src={viewingPdfUrl}
                className="w-full h-full rounded-xl border border-slate-200 bg-white"
                title="PDF Viewer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
