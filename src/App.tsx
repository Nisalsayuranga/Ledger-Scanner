import React, { useState, useEffect } from "react";
import { MainDashboard, BatchItem } from "./components/MainDashboard";
import { SideBySideDashboard } from "./components/SideBySideDashboard";
import { UploadMetadata } from "./components/PdfUploader";
import { convertPdfToImages, getPdfPageCount } from "./services/pdfProcessor";
import { extractLedgerFromImage } from "./services/ocrService";
import { exportBatchToExcel } from "./services/excelExportService";
import { BranchService } from "./services/api/BranchService";
import { BatchService } from "./services/api/BatchService";
import { DocumentService } from "./services/api/DocumentService";
import { LedgerService } from "./services/api/LedgerService";
import { TransactionService } from "./services/api/TransactionService";
import { VerificationService } from "./services/api/VerificationService";
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

  const [ocrError, setOcrError] = useState<{
    batchId: string;
    filename: string;
    message: string;
  } | null>(null);
  
  const [reuploadBatchId, setReuploadBatchId] = useState<string | null>(null);
  const reuploadInputRef = React.useRef<HTMLInputElement>(null);

  // Load batches from Supabase DB on app mount
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      const dbBatches = await BatchService.getBatches();
      if (isMounted) {
        setBatches(dbBatches);
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Background OCR processor queue loop
  useEffect(() => {
    // If a background task is already actively processing, do nothing
    if (bgTask) return;

    // Find the oldest pending batch (oldest first, so reverse batches array)
    // Find the oldest uploaded batch (oldest first, so reverse batches array)
    const nextUploaded = [...batches].reverse().find((b) => b.status === "uploaded");
    if (!nextUploaded) return;

    const processBatchInBackground = async (targetBatch: BatchItem) => {
      setBgTask({
        id: targetBatch.id,
        filename: targetBatch.filename,
        progress: 0,
        total: targetBatch.pageCount || 1,
        progressText: `Preparing pages for ${targetBatch.filename}...`
      });

      // Update to processing locally and in DB
      setBatches((prev) =>
        prev.map((b) => (b.id === targetBatch.id ? { ...b, status: "processing" } : b))
      );
      await BatchService.updateBatchStatus(targetBatch.id, "processing").catch(console.error);

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

        if (pageImages.length === 0) throw new Error("No page images rendered.");

        const yearStr = targetBatch.year || 2025;
        const monthStr = String(targetBatch.month || 10).padStart(2, "0");
        const parsedLedgers: DailyLedger[] = [];

        const CHUNK_SIZE = 2;
        for (let i = 0; i < pageImages.length; i += CHUNK_SIZE) {
          const chunk = pageImages.slice(i, i + CHUNK_SIZE);
          const startPage = i + 1;
          const endPage = Math.min(i + CHUNK_SIZE, pageImages.length);
          const pendingCount = batches.filter(b => b.status === "uploaded" && b.id !== targetBatch.id).length;
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
                const ledger: DailyLedger = {
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
                };

                // Stream into DB idempotently right away
                const dbLedgerId = await LedgerService.upsertLedger(targetBatch.id, ledger);
                if (ledger.transactions && ledger.transactions.length > 0) {
                  await TransactionService.upsertTransactions(dbLedgerId, ledger.transactions);
                }

                return ledger;
              } catch (ocrErr) {
                console.error(`Page ${pageNum} OCR error:`, ocrErr);
                throw new Error(`Page ${pageNum} failed: ${ocrErr instanceof Error ? ocrErr.message : String(ocrErr)}`);
              }
            })
          );
          parsedLedgers.push(...chunkResults);
        }

        // Successfully completed scan, mark as needs_review
        await BatchService.updateBatchStatus(targetBatch.id, "needs_review");
        
        const updatedBatch: BatchItem = {
          ...targetBatch,
          pageImages,
          pageCount: parsedLedgers.length,
          status: "needs_review",
          data: parsedLedgers
        };

        setBatches((prev) => prev.map((b) => (b.id === targetBatch.id ? updatedBatch : b)));

      } catch (err: any) {
        console.error("Background OCR error:", err);
        await BatchService.updateBatchStatus(targetBatch.id, "failed").catch(console.error);
        
        setBatches((prev) =>
          prev.map((b) => (b.id === targetBatch.id ? { ...b, status: "failed" } : b))
        );
        setOcrError({
          batchId: targetBatch.id,
          filename: targetBatch.filename,
          message: err?.message || String(err)
        });
      } finally {
        setBgTask(null);
      }
    };

    processBatchInBackground(nextUploaded);
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
      try {
        // Save any edits made by the user before verifying
        for (const ledger of activeLedgers) {
          const dbLedgerId = await LedgerService.upsertLedger(activeBatch.id, ledger);
          if (ledger.transactions && ledger.transactions.length > 0) {
            await TransactionService.upsertTransactions(dbLedgerId, ledger.transactions);
          }
        }

        // Mark as verified
        await VerificationService.verifyBatch(activeBatch.id);

        const updatedBatch = { ...activeBatch, status: "verified" as const };
        
        // Update React state
        setBatches(prev => prev.map(b => b.id === activeBatch.id ? updatedBatch : b));
        setActiveBatch(updatedBatch);
        
        alert(`Batch for ${updatedBatch.branchName} (${updatedBatch.bookCategory === 'lr_book' ? 'L/R Book' : 'M Book'}) successfully verified!`);
      } catch (err) {
        console.error(err);
        alert("Failed to verify batch. Please try again.");
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
      let dbBatchId: string | undefined = undefined;
      try {
        pageCount = await getPdfPageCount(file);
        
          const branchId = await BranchService.resolveBranchId(detected.branchName);
          dbBatchId = await BatchService.createOrGetBatch({
            branchId,
            year: detected.year,
            month: detected.month,
            bookCategory: detected.bookCategory,
            originalFilename: file.name,
            fileSizeBytes: file.size
          });
          
          setProgressText(`Uploading ${file.name} to Supabase Storage (${idx + 1}/${files.length})...`);
          cloudUrl = await DocumentService.uploadDocument(file, dbBatchId, branchId, detected.year, detected.month);
        } catch (e) {
          console.error(`Failed to convert/upload PDF ${file.name}:`, e);
        }

      const item: BatchItem = {
        id: dbBatchId || `batch-bulk-${Date.now()}-${idx}`,
        filename: file.name,
        branchName: detected.branchName,
        year: detected.year,
        month: detected.month,
        bookCategory: detected.bookCategory,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        pageCount: pageCount,
        extractedDate: `${detected.year}-${detected.month}`,
        status: "uploaded",
        data: [],
        rawFile: file,
        pageImages: [],
        pdfUrl: cloudUrl
      };

      newBatches.push(item);
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
      const branchId = await BranchService.resolveBranchId(metadata.branchName);
      const batchId = await BatchService.createOrGetBatch({
        branchId,
        year: metadata.year,
        month: metadata.month,
        bookCategory: metadata.bookCategory,
        originalFilename: file.name,
        fileSizeBytes: file.size
      });
      const cloudUrl = await DocumentService.uploadDocument(file, batchId, branchId, metadata.year, metadata.month);

      const newBatchItem: BatchItem = {
        id: batchId,
        filename: file.name,
        branchName: metadata.branchName,
        year: metadata.year,
        month: metadata.month,
        bookCategory: metadata.bookCategory,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        pageCount: pageCount,
        extractedDate: `${metadata.year}-${metadata.month}`,
        status: "uploaded",
        data: [],
        rawFile: file,
        pageImages: [],
        pdfUrl: cloudUrl
      };

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
      BranchService.resolveBranchId(newBranch).then(branchId => {
        BatchService.updateBatchBranch(batchId, branchId).catch(console.error);
      });
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
          updatedBatch = { ...targetBatch, pageImages: imgs, pageCount: imgs.length };
        }
      }

      setBatches((prev) =>
        prev.map((b) => (b.id === targetBatch.id ? { ...updatedBatch, status: "uploaded" } : b))
      );
      await BatchService.updateBatchStatus(targetBatch.id, "uploaded");
      
    } catch (e: any) {
      setOcrError({ batchId: targetBatch.id, filename: targetBatch.filename, message: e.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReuploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !reuploadBatchId) return;
    
    const targetBatch = batches.find(b => b.id === reuploadBatchId);
    if (!targetBatch) return;

    setIsProcessing(true);
    setProgressText(`Re-uploading ${file.name} to Cloud Storage...`);

    try {
      const pageCount = await getPdfPageCount(file);
      const branchId = await BranchService.resolveBranchId(targetBatch.branchName);
      
      const cloudUrl = await DocumentService.uploadDocument(
        file,
        targetBatch.id,
        branchId,
        targetBatch.year,
        targetBatch.month
      );

      const updatedBatch: BatchItem = {
        ...targetBatch,
        rawFile: file,
        pdfUrl: cloudUrl,
        pageCount,
        status: "uploaded",
      };

      setBatches(prev => prev.map(b => b.id === targetBatch.id ? updatedBatch : b));
      saveBatchToIndexedDb(updatedBatch);
    } catch (err: any) {
      console.error("Reupload failed", err);
      alert("Failed to reupload file: " + err.message);
    } finally {
      setIsProcessing(false);
      setReuploadBatchId(null);
      if (reuploadInputRef.current) {
        reuploadInputRef.current.value = "";
      }
    }
  };

  const handleDeleteBatch = async (batchToDelete: BatchItem) => {
    try {
      setIsProcessing(true);
      setProgressText(`Deleting ${batchToDelete.filename} from database...`);

      // 1. Delete from Supabase Database
      await BatchService.deleteBatch(batchToDelete.id, batchToDelete.branchName, batchToDelete.year, batchToDelete.month, batchToDelete.bookCategory);

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
        const uploadResult = await uploadPdfToSupabase(
          file,
          matchedBatch.branchName,
          matchedBatch.year,
          matchedBatch.month,
          matchedBatch.bookCategory
        );

        // Update database
        await updateBatchPdfUrlInSupabase(
          matchedBatch.id,
          uploadResult.publicUrl,
          matchedBatch.filename,
          matchedBatch.year,
          matchedBatch.month,
          matchedBatch.bookCategory,
          matchedBatch.branchName
        );

        // Update local IndexedDB
        const updatedBatch = { ...matchedBatch, pdfUrl: uploadResult.publicUrl };
        await saveBatchToIndexedDb(updatedBatch);

        // Update state
        setBatches((prev) =>
          prev.map((b) => (b.id === matchedBatch.id ? { ...b, pdfUrl: uploadResult.publicUrl } : b))
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
      {/* Hidden file input for Re-upload feature */}
      <input
        type="file"
        ref={reuploadInputRef}
        onChange={handleReuploadFile}
        className="hidden"
        accept=".pdf"
      />

      {/* OCR Error Modal */}
      {ocrError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-[#1C2128] rounded-xl shadow-2xl p-6 w-full max-w-md border border-red-500/30">
            <div className="flex items-start mb-4">
              <div className="bg-red-500/20 p-2 rounded-full mr-3 shrink-0">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">OCR Processing Failed</h3>
                <p className="text-sm text-gray-400 mt-1">Failed to process: <span className="text-gray-200">{ocrError.filename}</span></p>
              </div>
            </div>
            
            <div className="bg-black/30 rounded border border-[#30363D] p-3 text-sm text-red-400 mb-6 font-mono break-words max-h-32 overflow-y-auto">
              {ocrError.message}
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setOcrError(null)}
                className="px-4 py-2 bg-[#2D333B] hover:bg-[#3D444D] text-white text-sm font-medium rounded-lg transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setReuploadBatchId(ocrError.batchId);
                  if (reuploadInputRef.current) {
                    reuploadInputRef.current.click();
                  }
                  setOcrError(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center"
              >
                <svg className="w-4 h-4 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                </svg>
                Re-upload & Scan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
