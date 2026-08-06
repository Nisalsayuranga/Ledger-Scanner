import React, { useState, useEffect } from "react";
import { MainDashboard, BatchItem } from "./components/MainDashboard";
import { SideBySideDashboard } from "./components/SideBySideDashboard";
import { UploadMetadata } from "./components/PdfUploader";
import { convertPdfToImages, getPdfPageCount } from "./services/pdfProcessor";
import { extractLedgerFromImage } from "./services/ocrService";
import { exportBatchToExcel } from "./services/excelExportService";
import { saveBatchToSupabase, fetchBatchesFromSupabase, deleteBatchFromSupabase, updateBatchBranchInSupabase, uploadPdfToSupabase, updateBatchPdfUrlInSupabase } from "./services/supabaseStorageService";
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
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState("");

  const [bgTask, setBgTask] = useState<{
    id: string;
    filename: string;
    progress: number;
    total: number;
    progressText: string;
  } | null>(null);

  // Restore batches from IndexedDB + Supabase DB on app mount
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      const dbBatches = await fetchBatchesFromSupabase();
      const idbBatches = await getAllBatchesFromIndexedDb();

      if (isMounted) {
        // Keep only local batches that are not yet saved to DB
        const pendingLocal = (idbBatches || []).filter(
          (b) => b.status === "Pending" || b.status === "Processing"
        );
        const remote = dbBatches || [];

        const merged = [...remote, ...pendingLocal];
        setBatches(merged);
        saveAllBatchesToIndexedDb(merged); // Overwrite cache to clear ghost records
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

  // Background OCR processor queue loop
  useEffect(() => {
    // If a background task is already actively processing, do nothing
    if (bgTask) return;

    // Find the oldest pending batch (oldest first, so reverse batches array)
    const nextPending = [...batches].reverse().find((b) => b.status === "Pending");
    if (!nextPending) return;

    const processBatchInBackground = async (targetBatch: BatchItem) => {
      // 1. Set background task state
      setBgTask({
        id: targetBatch.id,
        filename: targetBatch.filename,
        progress: 0,
        total: targetBatch.pageCount || 1,
        progressText: `Preparing pages for ${targetBatch.filename}...`
      });

      // 2. Set the batch status to "Processing" in local state
      setBatches((prev) =>
        prev.map((b) => (b.id === targetBatch.id ? { ...b, status: "Processing" } : b))
      );

      try {
        let pageImages: string[] = targetBatch.pageImages || [];

        if (!pageImages || pageImages.length === 0) {
          if (targetBatch.rawFile) {
            pageImages = await convertPdfToImages(targetBatch.rawFile);
          } else {
            const pdfUrl = targetBatch.pdfUrl || (
              targetBatch.filename.startsWith("http") || targetBatch.filename.startsWith("/")
                ? targetBatch.filename
                : `/${targetBatch.filename}`
            );
            pageImages = await convertPdfToImages(pdfUrl);
          }
        }

        if (pageImages.length === 0) {
          throw new Error("No page images rendered.");
        }

        const yearStr = targetBatch.year || 2025;
        const monthStr = String(targetBatch.month || 10).padStart(2, "0");
        const parsedLedgers: DailyLedger[] = [];

        const CHUNK_SIZE = 2;
        for (let i = 0; i < pageImages.length; i += CHUNK_SIZE) {
          const chunk = pageImages.slice(i, i + CHUNK_SIZE);
          const startPage = i + 1;
          const endPage = Math.min(i + CHUNK_SIZE, pageImages.length);

          const pendingCount = batches.filter(b => b.status === "Pending" && b.id !== targetBatch.id).length;
          const queueInfo = pendingCount > 0 ? ` (${pendingCount} queued)` : "";

          setBgTask({
            id: targetBatch.id,
            filename: targetBatch.filename,
            progress: startPage - 1,
            total: pageImages.length,
            progressText: `Scanning Pages ${startPage}–${endPage} of ${pageImages.length} with Gemini...${queueInfo}`
          });

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
                throw new Error(`Page ${pageNum} failed: ${ocrErr instanceof Error ? ocrErr.message : String(ocrErr)}`);
              }
            })
          );

          parsedLedgers.push(...chunkResults);
        }

        // Successfully completed scan
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
          batchName: updatedBatch.pdfUrl || updatedBatch.filename,
          ledgers: parsedLedgers
        }).catch((e) => console.error("Auto DB save warn:", e));

      } catch (err: any) {
        console.error("Background OCR error:", err);
        // Reset status to Pending to let user re-queue or see failure
        setBatches((prev) =>
          prev.map((b) => (b.id === targetBatch.id ? { ...b, status: "Pending" } : b))
        );
        alert(`Background OCR failed for ${targetBatch.filename}: ${err?.message || String(err)}`);
      } finally {
        setBgTask(null);
      }
    };

    processBatchInBackground(nextPending);
  }, [batches, bgTask]);

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
        batchName: activeBatch.pdfUrl || activeBatch.filename,
        ledgers: activeLedgers
      });
      if (res.success && res.batchId) {
        // Remove old temporary batch from IndexedDB
        deleteBatchFromIndexedDb(activeBatch.id);
        
        // Create updated batch with new Supabase UUID
        const updatedBatch = { ...activeBatch, id: res.batchId, status: "Completed" as const };
        
        // Update React state
        setBatches(prev => prev.map(b => b.id === activeBatch.id ? updatedBatch : b));
        setActiveBatch(updatedBatch);
        
        // Save to IndexedDB with correct UUID
        saveBatchToIndexedDb(updatedBatch);
        
        alert(`Batch for ${updatedBatch.branchName} (${updatedBatch.bookCategory === 'lr_book' ? 'L/R Book' : 'M Book'}) successfully saved to Supabase Database!`);
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

      let pageCount = 0;
      let cloudUrl: string | undefined = undefined;
      try {
        pageCount = await getPdfPageCount(file);
        
        setProgressText(`Uploading ${file.name} to Supabase Storage (${idx + 1}/${files.length})...`);
        cloudUrl = await uploadPdfToSupabase(
          file,
          detected.branchName,
          detected.year,
          detected.month,
          detected.bookCategory
        );
      } catch (e) {
        console.error(`Failed to convert/upload PDF ${file.name}:`, e);
      }

      const item: BatchItem = {
        id: `batch-bulk-${Date.now()}-${idx}`,
        filename: file.name,
        branchName: detected.branchName,
        year: detected.year,
        month: detected.month,
        bookCategory: detected.bookCategory,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        pageCount: pageCount,
        extractedDate: `${detected.year}-${detected.month}`,
        status: "Pending",
        data: [],
        rawFile: file,
        pageImages: [],
        pdfUrl: cloudUrl
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
      setProgressText(`Analyzing PDF metadata for ${metadata.branchName}...`);
      const pageCount = await getPdfPageCount(file);

      setProgressText(`Uploading PDF to Supabase Storage...`);
      const cloudUrl = await uploadPdfToSupabase(
        file,
        metadata.branchName,
        metadata.year,
        metadata.month,
        metadata.bookCategory
      );

      const newBatchItem: BatchItem = {
        id: `batch-${Date.now()}`,
        filename: file.name,
        branchName: metadata.branchName,
        year: metadata.year,
        month: metadata.month,
        bookCategory: metadata.bookCategory,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        pageCount: pageCount,
        extractedDate: `${metadata.year}-${metadata.month}`,
        status: "Pending",
        data: [],
        rawFile: file,
        pageImages: [],
        pdfUrl: cloudUrl
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
    // 1. Update React local state
    setBatches((prev) =>
      prev.map((b) => (b.id === batchId ? { ...b, branchName: newBranch } : b))
    );

    // 2. Locate target batch and save changes to DBs
    const targetBatch = batches.find((b) => b.id === batchId);
    if (targetBatch) {
      updateBatchBranchInSupabase(
        batchId,
        newBranch,
        targetBatch.filename,
        targetBatch.year,
        targetBatch.month,
        targetBatch.bookCategory
      ).catch((e) => console.error("Error updating branch in Supabase:", e));

      const updatedBatch = { ...targetBatch, branchName: newBranch };
      saveBatchToIndexedDb(updatedBatch).catch((e) => console.error("Error saving moved batch to IndexedDB:", e));
    }
  };

  // DIRECT OCR SCANNING: Re-queue the batch as Pending to be processed automatically in the background
  const handleRunOcrOnBatch = async (targetBatch: BatchItem) => {
    try {
      let updatedBatch = targetBatch;
      if (!targetBatch.pageImages || targetBatch.pageImages.length === 0) {
        if (targetBatch.pdfUrl || targetBatch.filename) {
          setIsProcessing(true);
          setProgressText("Downloading PDF and preparing pages for OCR...");
          
          const sourceUrl = targetBatch.pdfUrl || (
            targetBatch.filename.startsWith("http") || targetBatch.filename.startsWith("/")
              ? targetBatch.filename
              : `/${targetBatch.filename}`
          );
          
          const imgs = await convertPdfToImages(sourceUrl);
          updatedBatch = { ...targetBatch, pageImages: imgs };
          
          setBatches((prev) =>
            prev.map((b) => (b.id === targetBatch.id ? updatedBatch : b))
          );
        }
      }
      
      setBatches((prev) =>
        prev.map((b) => (b.id === updatedBatch.id ? { ...b, status: "Pending", data: [] } : b))
      );
    } catch (e: any) {
      alert("Failed to load PDF for OCR: " + e.message);
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

  const handleMigrateBatches = async (files?: File[]) => {
    if (!files || files.length === 0) return;

    setIsMigrating(true);
    let successCount = 0;
    const errors: string[] = [];

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      setMigrationProgress(`Uploading ${file.name} (${idx + 1}/${files.length})...`);

      // Match selected file with existing batch by clean filename OR metadata fallback
      const detected = detectBranchAndCategoryFromFilename(file.name);
      const cleanFileName = file.name.toLowerCase().replace(/[\s_-]+/g, "");
      
      const matchedBatch = batches.find((b) => {
        // 1. Check clean filename match
        const bCleanName = b.filename.toLowerCase().replace(/[\s_-]+/g, "");
        if (bCleanName === cleanFileName || bCleanName.includes(cleanFileName) || cleanFileName.includes(bCleanName)) {
          return true;
        }

        // 2. Check metadata match fallback
        return (
          b.branchName === detected.branchName &&
          b.year === detected.year &&
          b.month === detected.month &&
          b.bookCategory === detected.bookCategory
        );
      });

      if (!matchedBatch) {
        const errMsg = `No matching archive found for "${file.name}" (Detected Branch: ${detected.branchName}, Month: ${detected.month}, Year: ${detected.year}, Category: ${detected.bookCategory})`;
        console.warn(errMsg);
        errors.push(errMsg);
        continue;
      }

      try {
        // Upload to storage
        const cloudUrl = await uploadPdfToSupabase(
          file,
          matchedBatch.branchName,
          matchedBatch.year,
          matchedBatch.month,
          matchedBatch.bookCategory
        );

        // Update database
        await updateBatchPdfUrlInSupabase(
          matchedBatch.id,
          cloudUrl,
          matchedBatch.filename,
          matchedBatch.year,
          matchedBatch.month,
          matchedBatch.bookCategory,
          matchedBatch.branchName
        );

        // Update local IndexedDB
        const updatedBatch = { ...matchedBatch, pdfUrl: cloudUrl };
        await saveBatchToIndexedDb(updatedBatch);

        // Update state
        setBatches((prev) =>
          prev.map((b) => (b.id === matchedBatch.id ? { ...b, pdfUrl: cloudUrl } : b))
        );
        successCount++;
      } catch (err: any) {
        console.error(`Migration error for ${file.name}:`, err);
        errors.push(`${file.name}: ${err.message || String(err)}`);
      }
    }

    setIsMigrating(false);
    setMigrationProgress("");
    
    if (errors.length > 0) {
      alert(`Uploaded and linked ${successCount} out of ${files.length} PDF files.\n\nErrors encountered:\n${errors.join("\n")}`);
    } else {
      alert(`Successfully uploaded and linked ${successCount} out of ${files.length} PDF files to Supabase Storage!`);
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
          bgTask={bgTask}
          onMigrateBatches={handleMigrateBatches}
          isMigrating={isMigrating}
          migrationProgress={migrationProgress}
        />
      ) : (
        <SideBySideDashboard
          batchName={`${activeBatch.branchName} - ${activeBatch.filename} (${activeBatch.bookCategory === 'lr_book' ? 'L/R Book' : 'M Book'})`}
          pdfUrl={activeBatch.pdfUrl || `/${activeBatch.filename}`}
          secondaryPdfUrl={secondaryBatch ? (secondaryBatch.pdfUrl || `/${secondaryBatch.filename}`) : undefined}
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
                batchName: updatedBatch.pdfUrl || updatedBatch.filename,
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
