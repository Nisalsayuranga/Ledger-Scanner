import React, { useState, useEffect } from "react";
import { Calendar, CheckCircle2, Zap, ArrowLeft, RefreshCw } from "lucide-react";
import { BatchItem } from "./MainDashboard";
import { extractDateFromPageImage } from "../services/ocrService";

interface Props {
  batch: BatchItem;
  pageImages: string[]; // Base64 or Data URLs for each PDF page
  onConfirmAndScan: (updatedPages: { pageIndex: number; date: string; imageUrl: string }[]) => void;
  onCancel: () => void;
}

interface PageItemState {
  pageIndex: number;
  date: string;
  imageUrl: string;
  isCaptured: boolean;
  isCapturing: boolean;
}

export const PageDateOrganizer: React.FC<Props> = ({
  batch,
  pageImages,
  onConfirmAndScan,
  onCancel
}) => {
  // Helper to format default sequential date (Day 1 -> 1st date of month)
  const getDefaultDateForPage = (idx: number) => {
    const y = batch.year || 2025;
    const m = String(batch.month || 10).padStart(2, "0");
    const d = String(Math.min(idx + 1, 31)).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const [pagesData, setPagesData] = useState<PageItemState[]>(() => {
    return pageImages.map((img, idx) => ({
      pageIndex: idx,
      date: getDefaultDateForPage(idx),
      imageUrl: img,
      isCaptured: false,
      isCapturing: false
    }));
  });

  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState<number>(0);
  const [isDetectingAll, setIsDetectingAll] = useState<boolean>(false);
  const [detectProgress, setDetectProgress] = useState<string>("");

  // Optional background date stamp verification via Gemini
  useEffect(() => {
    let isMounted = true;

    const autoDetectDates = async () => {
      setIsDetectingAll(true);

      for (let i = 0; i < pageImages.length; i++) {
        if (!isMounted) break;

        setDetectProgress(`Checking handwritten date stamp on Page ${i + 1} of ${pageImages.length}...`);

        setPagesData((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, isCapturing: true } : p))
        );

        try {
          const detectedDate = await extractDateFromPageImage(pageImages[i]);

          if (isMounted && detectedDate) {
            setPagesData((prev) =>
              prev.map((p, idx) =>
                idx === i
                  ? {
                      ...p,
                      date: detectedDate,
                      isCaptured: true,
                      isCapturing: false
                    }
                  : p
              )
            );
          } else if (isMounted) {
            setPagesData((prev) =>
              prev.map((p, idx) => (idx === i ? { ...p, isCapturing: false } : p))
            );
          }
        } catch (err) {
          console.error(`Error checking date for page ${i + 1}:`, err);
          if (isMounted) {
            setPagesData((prev) =>
              prev.map((p, idx) => (idx === i ? { ...p, isCapturing: false } : p))
            );
          }
        }
      }

      if (isMounted) {
        setIsDetectingAll(false);
        setDetectProgress("");
      }
    };

    autoDetectDates();

    return () => {
      isMounted = false;
    };
  }, [pageImages]);

  const handleDateChange = (idx: number, newDate: string) => {
    setPagesData((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, date: newDate } : p))
    );
  };

  const handleScanClick = () => {
    onConfirmAndScan(pagesData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* Header Bar */}
      <header className="bg-slate-900 text-white px-8 py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors font-bold text-xs flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Page Date Assignment &amp; Preview - {batch.filename} ({batch.bookCategory === "lr_book" ? "L/R Books" : "M Books"})
            </h2>
            <p className="text-xs text-slate-400">
              Dates automatically default sequentially starting from Day 1. Edit any date before starting OCR scan.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleScanClick}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-lg inline-flex items-center gap-2 transition-all transform hover:scale-105"
          >
            <Zap className="h-4 w-4" />
            Start OCR Scan for {pagesData.length} Pages
          </button>
        </div>
      </header>

      {/* Auto-Detection Progress Banner */}
      {isDetectingAll && (
        <div className="bg-slate-800 text-slate-200 px-8 py-2 border-b border-slate-700 flex justify-between items-center text-xs font-bold shadow">
          <span className="flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
            {detectProgress || "Checking page dates..."}
          </span>
          <span className="text-[11px] font-mono text-slate-400">Gemini Vision OCR</span>
        </div>
      )}

      {/* Main Split Layout: Left Thumbnail Grid & Date Picker | Right Full Image Zoom Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Thumbnail Cards & Date Assigners */}
        <div className="w-1/2 p-6 overflow-y-auto border-r border-slate-800 bg-slate-950 space-y-4">
          <div className="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 pb-3">
            <span>Total Pages Extracted: <strong className="text-white">{pageImages.length} Pages</strong></span>
            <span>Click thumbnail to inspect full page image on right</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pagesData.map((item, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedPreviewIdx(idx)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                  selectedPreviewIdx === idx
                    ? "bg-slate-900 border-blue-500 ring-2 ring-blue-500/50 shadow-lg"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Thumbnail */}
                <div className="w-20 h-24 bg-slate-800 rounded-lg overflow-hidden shrink-0 border border-slate-700 relative">
                  <img
                    src={item.imageUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1 right-1 bg-black/75 text-white font-mono font-bold text-[9px] px-1 rounded">
                    P.{idx + 1}
                  </span>
                </div>

                {/* Date Selection Control */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 block">
                      Page {idx + 1} of {pagesData.length} (Day {idx + 1})
                    </span>

                    <label className="text-xs font-semibold text-slate-300 block mt-1">
                      Assigned Date:
                    </label>
                    <input
                      type="date"
                      className="w-full mt-1 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold outline-none text-white focus:ring-2 focus:ring-blue-500"
                      value={item.date}
                      onChange={(e) => handleDateChange(idx, e.target.value)}
                    />
                  </div>

                  <div className="mt-2">
                    {item.isCapturing ? (
                      <span className="text-[10px] text-blue-400 font-bold flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Verifying Date...
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Date Ready
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Full Image Preview */}
        <div className="w-1/2 p-6 bg-slate-900 flex flex-col items-center justify-center">
          {pageImages[selectedPreviewIdx] ? (
            <div className="w-full h-full flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-300">
                  Inspecting Page {selectedPreviewIdx + 1} - Assigned Date: {pagesData[selectedPreviewIdx]?.date}
                </span>
              </div>
              <div className="flex-1 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 p-2 flex items-center justify-center">
                <img
                  src={pageImages[selectedPreviewIdx]}
                  alt={`Full Page ${selectedPreviewIdx + 1}`}
                  className="max-h-full max-w-full object-contain rounded-lg"
                />
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-500">Select a page thumbnail to preview</span>
          )}
        </div>
      </div>
    </div>
  );
};
