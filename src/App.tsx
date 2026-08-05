import React, { useState, useEffect } from "react";
import { MainDashboard, BatchItem } from "./components/MainDashboard";
import { SideBySideDashboard } from "./components/SideBySideDashboard";
import { UploadMetadata } from "./components/PdfUploader";
import { convertPdfToImages } from "./services/pdfProcessor";
import { extractLedgerFromImage } from "./services/ocrService";
import { exportBatchToExcel } from "./services/excelExportService";
import { saveBatchToSupabase, fetchBatchesFromSupabase, deleteBatchFromSupabase } from "./services/supabaseStorageService";
import { getAllBatchesFromIndexedDb, saveBatchToIndexedDb, saveAllBatchesToIndexedDb, deleteBatchFromIndexedDb } from "./services/indexedDbStorage";
import { detectBranchAndCategoryFromFilename } from "./utils/filenameDetector";
import { DailyLedger } from "./types/ledger";
import { BranchName } from "./constants/branches";

export const App: React.FC = () => {
  const [batches, setBatches] = useState<BatchItem[]>([]);

  const [activeBatch, setActiveBatch] = useState<BatchItem | null>(null);
  const [secondaryBatch, setSecondaryBatch] = useState<BatchItem | null>(null);
  const [activeLedgers, setActiveLedgers] = useState<DailyLedger[]>([]);
  const [secondaryLedgers, setSecondaryLedgers] = useState<DailyLedger[]>([]);
  const [activeDayIndex, setActiveDayIndex] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");

  // Restore batches from IndexedDB + Supabase DB on app mount
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      const idbBatches = await getAllBatchesFromIndexedDb();
      if (isMounted && idbBatches && idbBatches.length > 0) {
        setBatches(idbBatches);
      }

      const dbBatches = await fetchBatchesFromSupabase();
      if (isMounted && dbBatches && dbBatches.length > 0) {
        setBatches((prev) => {
          const existingMap = new Map(prev.map((b) => [b.id, b]));
          for (const dbB of dbBatches) {
            if (!existingMap.has(dbB.id)) {
              existingMap.set(dbB.id, dbB);
            }
          }
          const merged = Array.from(existingMap.values());
          saveAllBatchesToIndexedDb(merged);
          return merged;
        });
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Save batches state to IndexedDB whenever updated
  useEffect(() => {
    if (batches && batches.length > 0) {
      saveAllBatchesToIndexedDb(batches);
    }
  }, [batches]);

  const ensureLedgerDays = (batch: BatchItem): DailyLedger[] => {
    if (batch.data && batch.data.length > 0) return batch.data;
    const count = batch.pageCount > 0 ? batch.pageCount : 31;
    const yearStr = batch.year || 2025;
    const monthStr = String(batch.month || 10).padStart(2, "0");

    return Array.from({ length: count }, (_, idx) => ({
      day_number: idx + 1,
      date: `${yearStr}-${monthStr}-${String(idx + 1).padStart(2, "0")}`,
      staff_name: "Staff",
      cp_balance: 0,
      opening_balance: 0,
      cash_in: 0,
      cash_out: 0,
      total_loan: 0,
      total_redeem: 0,
      receive: 0,
      recovery: 0,
      insurance: 0,
      expenses: 0,
      calculated_closing_balance: 0,
      actual_cash_count: 0,
      variance: 0,
      is_validated: false,
      page_image_url: (batch.pageImages && batch.pageImages[idx]) || "",
      transactions: []
    }));
  };

  const handleSelectBatch = (selectedBatch: BatchItem, dayIndex: number = 0) => {
    const monthBatches = batches.filter(
      (b) =>
        b.branchName === selectedBatch.branchName &&
        b.year === selectedBatch.year &&
        b.month === selectedBatch.month
    );

    const mainBook = monthBatches.find((b) => b.bookCategory === "lr_book") || selectedBatch;
    const minorBook = monthBatches.find((b) => b.bookCategory === "m_book" && b.id !== mainBook.id);

    const mainLedgers = ensureLedgerDays(mainBook);
    const minorLedgers = minorBook ? ensureLedgerDays(minorBook) : [];

    setActiveBatch(mainBook);
    setActiveLedgers(mainLedgers);
    setSecondaryBatch(minorBook || null);
    setSecondaryLedgers(minorLedgers);
    setActiveDayIndex(dayIndex);
  };

  const handleExportBatch = (batch: BatchItem) => {
    const dataToExport = batch.data && batch.data.length > 0 ? batch.data : [];
    exportBatchToExcel(`${batch.branchName}_${batch.year}_${batch.month}_${batch.bookCategory}_Ledger`, dataToExport);
  };

  const handleSaveActiveBatchToDb = async () => {
    if (activeBatch && activeLedgers.length > 0) {
      const res = await saveBatchToSupabase({
        branchName: activeBatch.branchName,
        year: activeBatch.year,
        month: activeBatch.month,
        bookCategory: activeBatch.bookCategory,
        batchName: activeBatch.filename,
        ledgers: activeLedgers
      });
      if (res.success) {
        alert(`Batch for ${activeBatch.branchName} (${activeBatch.bookCategory === 'lr_book' ? 'L/R Book' : 'M Book'}) successfully saved to Supabase Database!`);
      } else {
        alert("Saved to database with warnings. Check Supabase connection.");
      }
    }
  };

  // STEP 1: Upload PDF files (NO OCR). Only extract page images and store batch as Pending.
  const handleBulkUploadPdfs = async (files: File[]) => {
    setIsProcessing(true);
    setProgressText(`Extracting PDF page images for ${files.length} files...`);

    const newBatches: BatchItem[] = [];

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      setProgressText(`Extracting pages for ${file.name} (${idx + 1}/${files.length})...`);
      const detected = detectBranchAndCategoryFromFilename(file.name);

      let imgs: string[] = [];
      try {
        imgs = await convertPdfToImages(file);
      } catch (e) {
        console.error(`Failed to convert PDF ${file.name}:`, e);
      }

      const item: BatchItem = {
        id: `batch-bulk-${Date.now()}-${idx}`,
        filename: file.name,
        branchName: detected.branchName,
        year: detected.year,
        month: detected.month,
        bookCategory: detected.bookCategory,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        pageCount: imgs.length,
        extractedDate: `${detected.year}-${detected.month}`,
        status: "Pending",
        data: [],
        rawFile: file,
        pageImages: imgs
      };

      newBatches.push(item);
      saveBatchToIndexedDb(item);
    }

    setBatches((prev) => [...newBatches, ...prev]);
    setIsProcessing(false);
  };

  // STEP 1 (Single File): Upload PDF (NO OCR). Save batch as Pending with page images.
  const handleProcessPdf = async (file: File, metadata: UploadMetadata) => {
    try {
      setIsProcessing(true);
      setProgressText(`Extracting PDF page images for ${metadata.branchName}...`);

      const pageImages = await convertPdfToImages(file);

      const newBatchItem: BatchItem = {
        id: `batch-${Date.now()}`,
        filename: file.name,
        branchName: metadata.branchName,
        year: metadata.year,
        month: metadata.month,
        bookCategory: metadata.bookCategory,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        pageCount: pageImages.length,
        extractedDate: `${metadata.year}-${metadata.month}`,
        status: "Pending",
        data: [],
        rawFile: file,
        pageImages: pageImages
      };

      saveBatchToIndexedDb(newBatchItem);
      setBatches((prev) => [newBatchItem, ...prev]);
    } catch (err) {
      console.error(err);
      alert("Failed to process PDF file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMoveBranchBatch = (batchId: string, newBranch: BranchName) => {
    setBatches((prev) =>
      prev.map((b) => (b.id === batchId ? { ...b, branchName: newBranch } : b))
    );
  };

  // DIRECT OCR SCANNING: Run Gemini Vision OCR directly on all pages -> Populate tables -> Save to Supabase DB -> Open Dashboard!
  const handleRunOcrOnBatch = async (targetBatch: BatchItem) => {
    try {
      setIsProcessing(true);
      setProgressText(`Preparing PDF pages for ${targetBatch.filename}...`);

      let pageImages: string[] = targetBatch.pageImages || [];

      if (!pageImages || pageImages.length === 0) {
        if (targetBatch.rawFile) {
          pageImages = await convertPdfToImages(targetBatch.rawFile);
        } else if (targetBatch.filename) {
          const pdfUrl = targetBatch.filename.startsWith("http") || targetBatch.filename.startsWith("/")
            ? targetBatch.filename
            : `/${targetBatch.filename}`;
          try {
            pageImages = await convertPdfToImages(pdfUrl);
          } catch (urlErr) {
            console.warn("Could not render directly from URL, opening file picker...", urlErr);
            setIsProcessing(false);
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "application/pdf";
            input.onchange = async (e: any) => {
              const selectedFile = e.target?.files?.[0];
              if (selectedFile) {
                const imgs = await convertPdfToImages(selectedFile);
                const updated = { ...targetBatch, rawFile: selectedFile, pageImages: imgs, pageCount: imgs.length };
                handleRunOcrOnBatch(updated);
              }
            };
            input.click();
            return;
          }
        }
      }

      if (pageImages.length === 0) {
        alert("Could not load PDF page images. Please re-upload the PDF file.");
        return;
      }

      const yearStr = targetBatch.year || 2025;
      const monthStr = String(targetBatch.month || 10).padStart(2, "0");
      const parsedLedgers: DailyLedger[] = [];

      // Parallel scanning in chunks of 5 pages — PAID API key has 2000 RPM
      const CHUNK_SIZE = 5;
      for (let i = 0; i < pageImages.length; i += CHUNK_SIZE) {
        const chunk = pageImages.slice(i, i + CHUNK_SIZE);
        const startPage = i + 1;
        const endPage = Math.min(i + CHUNK_SIZE, pageImages.length);

        setProgressText(`Scanning Pages ${startPage}–${endPage} of ${pageImages.length} with Gemini Vision OCR...`);

        const chunkResults = await Promise.all(
          chunk.map(async (imgUrl, chunkIdx) => {
            const pageNum = i + chunkIdx + 1;
            const defaultDate = `${yearStr}-${monthStr}-${String(pageNum).padStart(2, "0")}`;

            try {
              const extracted = await extractLedgerFromImage(imgUrl);
              return {
                day_number: pageNum,
                date: extracted.meta?.date || defaultDate,
                staff_name: extracted.meta?.staff || "Staff",
                cp_balance: extracted.meta?.cp_balance || 0,
                opening_balance: extracted.summary?.opening_balance || 0,
                cash_in: extracted.summary?.cash_in || 0,
                cash_out: extracted.summary?.cash_out || 0,
                total_loan: extracted.summary?.total_loan || 0,
                total_redeem: extracted.summary?.total_redeem || 0,
                receive: extracted.summary?.receive || 0,
                recovery: extracted.summary?.recovery || 0,
                insurance: extracted.summary?.insurance || 0,
                expenses: extracted.summary?.expenses || 0,
                calculated_closing_balance: extracted.summary?.closing_balance || 0,
                actual_cash_count: extracted.summary?.actual_cash_count || 0,
                variance: extracted.summary?.variance || 0,
                is_validated: false,
                page_image_url: imgUrl,
                transactions: extracted.transactions || []
              } as DailyLedger;
            } catch (ocrErr) {
              console.error(`Page ${pageNum} OCR error:`, ocrErr);
              throw new Error(`Page ${pageNum} failed to scan: ${ocrErr instanceof Error ? ocrErr.message : String(ocrErr)}`);
            }
          })
        );

        parsedLedgers.push(...chunkResults);
      }

      const updatedBatch: BatchItem = {
        ...targetBatch,
        pageImages,
        pageCount: parsedLedgers.length,
        status: "Completed",
        data: parsedLedgers
      };

      setBatches((prev) => prev.map((b) => (b.id === targetBatch.id ? updatedBatch : b)));
      saveBatchToIndexedDb(updatedBatch);

      // Auto save to Supabase Database
      await saveBatchToSupabase({
        branchName: updatedBatch.branchName,
        year: updatedBatch.year,
        month: updatedBatch.month,
        bookCategory: updatedBatch.bookCategory,
        batchName: updatedBatch.filename,
        ledgers: parsedLedgers
      }).catch((e) => console.error("Auto DB save warn:", e));

      // Directly open SideBySideDashboard
      setActiveBatch(updatedBatch);
      setActiveLedgers(parsedLedgers);
      setActiveDayIndex(0);
    } catch (err) {
      console.error(err);
      alert(`OCR batch scan failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBatch = async (batchToDelete: BatchItem) => {
    try {
      setIsProcessing(true);
      setProgressText(`Deleting ${batchToDelete.filename} from database...`);

      // 1. Delete from Supabase Database
      await deleteBatchFromSupabase(batchToDelete.id, batchToDelete.branchName, batchToDelete.year, batchToDelete.month, batchToDelete.bookCategory);

      // 2. Delete from IndexedDB
      await deleteBatchFromIndexedDb(batchToDelete.id);

      // 3. Remove from local state
      setBatches((prev) => prev.filter((b) => b.id !== batchToDelete.id));

      if (activeBatch?.id === batchToDelete.id) {
        setActiveBatch(null);
        setSecondaryBatch(null);
      }
    } catch (err) {
      console.error("Error deleting batch:", err);
      alert("Failed to delete batch.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {activeBatch === null ? (
        <MainDashboard
          batches={batches}
          onSelectBatch={handleSelectBatch}
          onExportBatch={handleExportBatch}
          onDeleteBatch={handleDeleteBatch}
          onProcessStart={handleProcessPdf}
          onBulkUploadPdfs={handleBulkUploadPdfs}
          onMoveBranchBatch={handleMoveBranchBatch}
          onRunOcrOnBatch={handleRunOcrOnBatch}
          isProcessing={isProcessing}
          progressText={progressText}
        />
      ) : (
        <SideBySideDashboard
          batchName={`${activeBatch.branchName} - ${activeBatch.filename} (${activeBatch.bookCategory === 'lr_book' ? 'L/R Book' : 'M Book'})`}
          pdfUrl={`/${activeBatch.filename}`}
          secondaryPdfUrl={secondaryBatch ? `/${secondaryBatch.filename}` : undefined}
          initialDayIndex={activeDayIndex}
          ledgers={activeLedgers}
          secondaryLedgers={secondaryLedgers.length > 0 ? secondaryLedgers : (secondaryBatch?.data || [])}
          onUpdateLedger={(idx, updated) => {
            const updatedLedgers = [...activeLedgers];
            updatedLedgers[idx] = updated;
            setActiveLedgers(updatedLedgers);

            if (activeBatch) {
              const updatedBatch = { ...activeBatch, data: updatedLedgers };
              setActiveBatch(updatedBatch);
              setBatches((prev) => prev.map((b) => (b.id === activeBatch.id ? updatedBatch : b)));
              saveBatchToIndexedDb(updatedBatch);
              saveBatchToSupabase({
                branchName: updatedBatch.branchName,
                year: updatedBatch.year,
                month: updatedBatch.month,
                bookCategory: updatedBatch.bookCategory,
                batchName: updatedBatch.filename,
                ledgers: updatedLedgers
              }).catch((e) => console.error("Auto Supabase update warn:", e));
            }
          }}
          onExport={() => exportBatchToExcel(`${activeBatch.branchName}_${activeBatch.year}_${activeBatch.month}_${activeBatch.bookCategory}`, activeLedgers)}
          onSaveToSupabase={handleSaveActiveBatchToDb}
          onReset={() => {
            setActiveBatch(null);
            setSecondaryBatch(null);
          }}
        />
      )}
    </div>
  );
};

export default App;
