import React, { useState, useRef, useEffect } from "react";
import { DailyLedger } from "../types/ledger";
import { TransactionTable } from "./TransactionTable";
import { SummaryCard } from "./SummaryCard";
import { validateLedgerDay } from "../utils/validation";
import { getPdfPageImageDataUrl } from "../services/pdfPageRenderer";
import { extractLedgerFromImage } from "../services/ocrService";
import { FileSpreadsheet, ArrowLeft, ArrowRight, RotateCcw, RotateCw, RefreshCw, ZoomIn, ZoomOut, Move, Database, Check, Flag, AlertTriangle, BookOpen, Zap, Loader2 } from "lucide-react";

interface Props {
  batchName?: string;
  pdfUrl?: string;
  secondaryPdfUrl?: string;
  initialDayIndex?: number;
  ledgers: DailyLedger[];
  secondaryLedgers?: DailyLedger[];
  onUpdateLedger: (index: number, updated: DailyLedger) => void;
  onExport: () => void;
  onReset?: () => void;
  onSaveToSupabase?: () => Promise<void>;
}

export const SideBySideDashboard: React.FC<Props> = ({
  batchName = "Daily Ledger",
  pdfUrl,
  secondaryPdfUrl,
  initialDayIndex = 0,
  ledgers,
  secondaryLedgers = [],
  onUpdateLedger,
  onExport,
  onReset,
  onSaveToSupabase
}) => {
  const [selectedDayIndex, setSelectedDayIndex] = useState(initialDayIndex);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeBookTab, setActiveBookTab] = useState<"book1" | "book2">("book1");

  // Rendered Data URLs for Book 1 and Book 2
  const [renderedImageBook1, setRenderedImageBook1] = useState<string>("");
  const [renderedImageBook2, setRenderedImageBook2] = useState<string>("");

  // Image Mismatch Flag state per day
  const [flaggedDays, setFlaggedDays] = useState<{ [dayIdx: number]: boolean }>({});

  const [isSavingDb, setIsSavingDb] = useState(false);
  const [dbSavedSuccess, setDbSavedSuccess] = useState(false);

  // Mouse pan/drag state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [isDraggingUI, setIsDraggingUI] = useState(false);

  const currentLedgerBook1 = ledgers[selectedDayIndex];

  // Match Book 2 sheet by EXACT SAME DATE or day_number as Book 1
  const targetDate = currentLedgerBook1?.date;
  const targetDayNumber = currentLedgerBook1?.day_number;

  const matchingLedgerBook2 = secondaryLedgers.find(
    (l) => (targetDate && l.date && l.date === targetDate) || l.day_number === targetDayNumber
  );

  const isDualBook = secondaryLedgers.length > 0;

  // Render Book 1 PDF Page Image
  useEffect(() => {
    let isMounted = true;
    if (currentLedgerBook1) {
      if (currentLedgerBook1.page_image_url && currentLedgerBook1.page_image_url.startsWith("data:image")) {
        setRenderedImageBook1(currentLedgerBook1.page_image_url);
      } else if (pdfUrl) {
        getPdfPageImageDataUrl(pdfUrl, currentLedgerBook1.day_number).then((url) => {
          if (isMounted && url) setRenderedImageBook1(url);
        });
      }
    }
    return () => {
      isMounted = false;
    };
  }, [pdfUrl, selectedDayIndex, currentLedgerBook1]);

  // Render Book 2 PDF Page Image for the EXACT SAME MATCHING DATE
  useEffect(() => {
    let isMounted = true;
    if (matchingLedgerBook2) {
      if (matchingLedgerBook2.page_image_url && matchingLedgerBook2.page_image_url.startsWith("data:image")) {
        setRenderedImageBook2(matchingLedgerBook2.page_image_url);
      } else if (secondaryPdfUrl) {
        getPdfPageImageDataUrl(secondaryPdfUrl, matchingLedgerBook2.day_number).then((url) => {
          if (isMounted && url) setRenderedImageBook2(url);
        });
      }
    } else {
      setRenderedImageBook2("");
      if (activeBookTab === "book2") {
        setActiveBookTab("book1");
      }
    }
    return () => {
      isMounted = false;
    };
  }, [secondaryPdfUrl, selectedDayIndex, matchingLedgerBook2, activeBookTab]);

  if (!currentLedgerBook1) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-md w-full space-y-4">
          <BookOpen className="h-12 w-12 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Ledger Data Available</h3>
          <p className="text-xs text-slate-500">
            This book does not have daily ledger pages created yet. Click below to return to the Main Dashboard and run OCR scan.
          </p>
          <button
            onClick={onReset}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Active ledger being edited
  const activeLedger = currentLedgerBook1;
  const validation = validateLedgerDay(activeLedger, activeLedger.transactions);

  const handleRotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };

  const handleRotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(parseFloat((prev + 0.25).toFixed(2)), 4.0));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(parseFloat((prev - 0.25).toFixed(2)), 0.5));
  };

  const handleResetView = () => {
    setRotation(0);
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleToggleImageFlag = () => {
    setFlaggedDays((prev) => ({
      ...prev,
      [selectedDayIndex]: !prev[selectedDayIndex]
    }));
  };

  const [isSinglePageScanning, setIsSinglePageScanning] = useState(false);

  const handleSaveDb = async () => {
    if (onSaveToSupabase) {
      setIsSavingDb(true);
      await onSaveToSupabase();
      setIsSavingDb(false);
      setDbSavedSuccess(true);
      setTimeout(() => setDbSavedSuccess(false), 3000);
    }
  };

  const handleScanCurrentPageOcr = async () => {
    let activeImgToScan = activeBookTab === "book1"
      ? renderedImageBook1 || currentLedgerBook1.page_image_url || ""
      : renderedImageBook2 || (matchingLedgerBook2 ? matchingLedgerBook2.page_image_url : "") || "";

    if (!activeImgToScan && pdfUrl) {
      activeImgToScan = await getPdfPageImageDataUrl(pdfUrl, currentLedgerBook1.day_number);
    }

    if (!activeImgToScan) {
      alert("No page image available to scan for this page.");
      return;
    }

    try {
      setIsSinglePageScanning(true);
      const extracted = await extractLedgerFromImage(activeImgToScan);

      const updatedLedger: DailyLedger = {
        ...activeLedger,
        staff_name: extracted.meta?.staff || activeLedger.staff_name || "Staff",
        cp_balance: extracted.meta?.cp_balance ?? activeLedger.cp_balance,
        opening_balance: extracted.summary?.opening_balance ?? activeLedger.opening_balance,
        cash_in: extracted.summary?.cash_in ?? activeLedger.cash_in,
        cash_out: extracted.summary?.cash_out ?? activeLedger.cash_out,
        total_loan: extracted.summary?.total_loan ?? activeLedger.total_loan,
        total_redeem: extracted.summary?.total_redeem ?? activeLedger.total_redeem,
        receive: extracted.summary?.receive ?? activeLedger.receive,
        recovery: extracted.summary?.recovery ?? activeLedger.recovery,
        insurance: extracted.summary?.insurance ?? activeLedger.insurance,
        expenses: extracted.summary?.expenses ?? activeLedger.expenses,
        calculated_closing_balance: extracted.summary?.closing_balance ?? activeLedger.calculated_closing_balance,
        actual_cash_count: extracted.summary?.actual_cash_count ?? activeLedger.actual_cash_count,
        variance: extracted.summary?.variance ?? activeLedger.variance,
        transactions: extracted.transactions || activeLedger.transactions || []
      };

      onUpdateLedger(selectedDayIndex, updatedLedger);
    } catch (err) {
      console.error("Single page OCR error:", err);
      alert(`OCR scan failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSinglePageScanning(false);
    }
  };

  // 2D Mouse Drag & Pan Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
    setIsDraggingUI(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDraggingUI(false);
  };

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(parseFloat((prev + 0.15).toFixed(2)), 4.0));
    } else {
      setZoom((prev) => Math.max(parseFloat((prev - 0.15).toFixed(2)), 0.5));
    }
  };

  // Active displayed image based on tab selection
  const activeImage =
    activeBookTab === "book1"
      ? renderedImageBook1 || currentLedgerBook1.page_image_url || ""
      : renderedImageBook2 || (matchingLedgerBook2 ? matchingLedgerBook2.page_image_url : "") || "";

  const isCurrentDayFlagged = !!flaggedDays[selectedDayIndex];

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Header bar */}
      <header className="px-6 py-3.5 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          {onReset && (
            <button
              onClick={onReset}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Return to Main Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">{batchName}</h1>
            <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>Day {activeLedger.day_number} of {ledgers.length}</span>
              <span className="text-slate-400">•</span>
              <span className="font-bold text-slate-700">Date:</span>
              <input
                type="date"
                className="px-2 py-0.5 border border-slate-300 rounded text-xs font-bold text-slate-800 bg-slate-50 outline-none focus:ring-1 focus:ring-blue-500"
                value={activeLedger.date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  if (newDate) {
                    onUpdateLedger(selectedDayIndex, {
                      ...activeLedger,
                      date: newDate
                    });
                  }
                }}
                title="Re-assign or correct date for this page image if misaligned"
              />
              {isDualBook && (
                <span className="bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded text-[10px] ml-1">
                  L/R Books &amp; M Books
                </span>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex gap-3 items-center">
          {/* Day Selector Dropdown */}
          <select
            className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 font-semibold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-400 max-w-xs"
            value={selectedDayIndex}
            onChange={(e) => {
              setSelectedDayIndex(parseInt(e.target.value));
              handleResetView();
            }}
          >
            {ledgers.map((l, idx) => (
              <option key={idx} value={idx}>
                Day {l.day_number} ({l.date || `2025-10-${l.day_number}`})
              </option>
            ))}
          </select>

          {/* Run Page OCR Scan Button */}
          <button
            onClick={handleScanCurrentPageOcr}
            disabled={isSinglePageScanning}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg shadow inline-flex items-center gap-1.5 transition-colors"
            title="Scan this handwritten page with Gemini Vision OCR to populate tables"
          >
            {isSinglePageScanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                Scanning Page...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Scan Page OCR
              </>
            )}
          </button>

          {/* Export Excel Button */}
          <button
            onClick={onExport}
            className="px-4 py-2 bg-emerald-600 text-white font-medium text-sm rounded-lg shadow hover:bg-emerald-700 inline-flex items-center gap-2 transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export to Excel
          </button>
        </div>
      </header>

      {/* Flag Warning Banner if Image is Marked Mismatch */}
      {isCurrentDayFlagged && (
        <div className="bg-amber-500 text-white px-6 py-2 flex justify-between items-center text-xs font-bold shadow-md z-30">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-white" />
            Page Image Marked as Incorrect / Needs Manual Data Input! Please verify and enter correct values manually in the form on the right.
          </span>
          <button
            onClick={handleToggleImageFlag}
            className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded text-[11px] font-bold"
          >
            Unflag Mismatch
          </button>
        </div>
      )}

      {/* Split Viewer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Original PDF Image Viewer with Exact Date-Matched Dual Book Tabs & 2D Pan/Zoom */}
        <div className="w-1/2 flex flex-col border-r border-slate-200 bg-slate-300 relative">
          {/* Dual Book Image Selector Tabs Bar */}
          <div className="px-4 py-2 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800 select-none z-20">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-300">View Page Image ({activeLedger.date}):</span>
            </div>

            {/* Toggle Tabs for L/R Book and M Book with Date Matching */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setActiveBookTab("book1");
                  handleResetView();
                }}
                className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeBookTab === "book1"
                    ? "bg-blue-600 text-white shadow"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                }`}
              >
                L/R Book
              </button>

              {isDualBook && (
                <button
                  disabled={!matchingLedgerBook2}
                  onClick={() => {
                    if (matchingLedgerBook2) {
                      setActiveBookTab("book2");
                      handleResetView();
                    }
                  }}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                    !matchingLedgerBook2
                      ? "bg-slate-800 text-slate-500 opacity-50 cursor-not-allowed border border-slate-700"
                      : activeBookTab === "book2"
                      ? "bg-amber-600 text-white shadow"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                  }`}
                  title={matchingLedgerBook2 ? `View M Book image for ${activeLedger.date}` : `No M Book page image for date ${activeLedger.date}`}
                >
                  M Book {!matchingLedgerBook2 && "(No page for date)"}
                </button>
              )}
            </div>

            {/* Mark Image Mismatch Button */}
            <button
              onClick={handleToggleImageFlag}
              className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                isCurrentDayFlagged
                  ? "bg-amber-500 text-white shadow animate-pulse"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
              }`}
              title="Flag if page image is incorrect or misaligned"
            >
              <Flag className="h-3.5 w-3.5" />
              {isCurrentDayFlagged ? "Image Flagged" : "Mark Image Mismatch"}
            </button>
          </div>

          {/* Image Controls Toolbar */}
          <div className="px-4 py-2 bg-slate-800 text-white flex justify-between items-center shadow-md z-20 select-none">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">
                {activeBookTab === "book1" ? "L/R Book" : "M Book"} - Date: {activeLedger.date} ({rotation}° | {Math.round(zoom * 100)}%)
              </span>
              <span className="text-[11px] bg-slate-700 px-2 py-0.5 rounded text-slate-300 flex items-center gap-1">
                <Move className="h-3 w-3" />
                Drag to pan
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRotateLeft}
                className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 text-xs font-medium transition-colors"
                title="Rotate 90° Left"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleRotateRight}
                className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 text-xs font-medium transition-colors"
                title="Rotate 90° Right"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>

              <div className="h-3 w-px bg-slate-600 mx-1" />

              <button
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                className="p-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded text-slate-200 text-xs font-medium transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-mono w-10 text-center font-bold text-slate-200">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 4.0}
                className="p-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded text-slate-200 text-xs font-medium transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>

              {(rotation !== 0 || zoom !== 1.0 || pan.x !== 0 || pan.y !== 0) && (
                <button
                  onClick={handleResetView}
                  className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 text-xs font-medium transition-colors ml-1"
                  title="Reset View"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Interactive Pan Canvas Area */}
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className={`flex-1 relative overflow-hidden flex items-center justify-center bg-slate-900/10 select-none ${
              isDraggingUI ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            <div
              className="will-change-transform flex items-center justify-center pointer-events-none"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
                transition: isDraggingUI ? 'none' : 'transform 100ms cubic-bezier(0, 0, 0.2, 1)'
              }}
            >
              {activeImage ? (
                <img
                  src={activeImage}
                  alt={`Page ${activeLedger.day_number} (${activeLedger.date})`}
                  className="max-h-[82vh] max-w-[85%] shadow-2xl rounded border border-slate-400 bg-white block object-contain"
                />
              ) : (
                <div className="p-12 bg-white rounded-xl shadow-lg border border-slate-300 text-center">
                  <p className="text-slate-600 font-bold">Ledger Page for {activeLedger.date}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {activeBookTab === "book2" && !matchingLedgerBook2
                      ? "No Book 2 (<10k) page recorded for this date"
                      : "Rendering image..."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Extracted Editable Form & Bottom Action Footer */}
        <div className="w-1/2 flex flex-col bg-slate-50 overflow-hidden">
          {/* Form Scroll Area */}
          <div className="flex-1 p-4 overflow-auto space-y-4">
            <SummaryCard
              ledger={activeLedger}
              validation={validation}
              onChange={(updated) => onUpdateLedger(selectedDayIndex, updated)}
            />

            <TransactionTable
              transactions={activeLedger.transactions}
              onChange={(updatedTx) =>
                onUpdateLedger(selectedDayIndex, { ...activeLedger, transactions: updatedTx })
              }
            />
          </div>

          {/* Sticky Bottom Action Footer Bar */}
          <div className="bg-white border-t border-slate-200 p-4 shadow-lg flex items-center justify-between z-30 shrink-0">
            <div className="text-xs text-slate-500 font-medium">
              Editing Day <strong className="text-slate-800">{activeLedger.day_number}</strong> of <strong className="text-slate-800">{ledgers.length}</strong> ({activeLedger.date})
            </div>

            <div className="flex items-center gap-3">
              {/* Save Button */}
              {onSaveToSupabase && (
                <button
                  onClick={handleSaveDb}
                  disabled={isSavingDb}
                  className={`px-5 py-2.5 text-white font-extrabold text-xs rounded-xl shadow inline-flex items-center gap-2 transition-all ${
                    dbSavedSuccess ? "bg-slate-800 hover:bg-slate-900" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {dbSavedSuccess ? <Check className="h-4 w-4 text-emerald-400" /> : <Database className="h-4 w-4" />}
                  {isSavingDb ? "Saving..." : dbSavedSuccess ? "Saved to DB!" : "Save"}
                </button>
              )}

              {/* Next Day Button */}
              <button
                onClick={() => {
                  if (selectedDayIndex < ledgers.length - 1) {
                    setSelectedDayIndex((prev) => prev + 1);
                    handleResetView();
                  }
                }}
                disabled={selectedDayIndex >= ledgers.length - 1}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow inline-flex items-center gap-2 transition-all"
              >
                Next Day
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
