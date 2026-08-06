import { supabase } from "./supabaseClient";
import { getPdfPageImageDataUrl } from "./pdfPageRenderer";
import { BatchService } from "./api/BatchService";
import { LedgerService } from "./api/LedgerService";
import { TransactionService } from "./api/TransactionService";
import { DailyLedger } from "../types/ledger";
import { BatchItem } from "../components/MainDashboard";
import { convertPdfToImages } from "./pdfProcessor";

const blobToBase64 = (blob: Blob): Promise<{ base64Data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
      if (match) {
        resolve({ mimeType: match[1], base64Data: match[2] });
      } else {
        const parts = dataUrl.split(",");
        resolve({ mimeType: blob.type || "image/jpeg", base64Data: parts[1] || dataUrl });
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const prepareImageData = async (imageInput: string): Promise<{ base64Data: string; mimeType: string }> => {
  if (!imageInput) {
    throw new Error("No image input provided for OCR scan");
  }

  if (imageInput.startsWith("data:image")) {
    const match = imageInput.match(/^data:(image\/\w+);base64,(.*)$/);
    if (match) {
      return { mimeType: match[1], base64Data: match[2] };
    }
    const clean = imageInput.replace(/^data:image\/\w+;base64,/, "");
    return { mimeType: "image/jpeg", base64Data: clean };
  }

  if (imageInput.toLowerCase().includes(".pdf")) {
    const dataUrl = await getPdfPageImageDataUrl(imageInput, 1);
    if (dataUrl) {
      const match = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
      if (match) {
        return { mimeType: match[1], base64Data: match[2] };
      }
    }
  }

  if (imageInput.startsWith("http") || imageInput.startsWith("/")) {
    try {
      const res = await fetch(imageInput);
      const blob = await res.blob();
      if (blob.type === "application/pdf") {
        const dataUrl = await getPdfPageImageDataUrl(imageInput, 1);
        if (dataUrl) {
          const match = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
          if (match) return { mimeType: match[1], base64Data: match[2] };
        }
      }
      return await blobToBase64(blob);
    } catch (e) {
      console.error("Fetch error preparing image data:", e);
    }
  }

  return { base64Data: imageInput, mimeType: "image/jpeg" };
};

/**
 * Invokes Supabase Edge Function 'ocr-proxy' to extract ledger details securely without exposing API keys.
 * Throws a clear error if OCR fails after trying all server-side keys and models.
 */
export const extractLedgerFromImage = async (imageInput: string) => {
  const { base64Data, mimeType } = await prepareImageData(imageInput);

  const { data, error } = await supabase.functions.invoke("ocr-proxy", {
    body: {
      action: "extract_ledger",
      base64Data,
      mimeType
    }
  });

  if (error || !data || data.error || !data.result) {
    const errDetail = data?.error || error?.message || "OCR failed after trying all keys and models";
    console.error("Supabase ocr-proxy Edge Function error:", errDetail);
    throw new Error(`OCR Scan Failed: ${errDetail}`);
  }

  return data.result;
};

/**
 * Invokes Supabase Edge Function 'ocr-proxy' to extract date from page image.
 * Only returns null after all server-side keys and models are exhausted.
 */
export const extractDateFromPageImage = async (imageInput: string): Promise<string | null> => {
  try {
    const { base64Data, mimeType } = await prepareImageData(imageInput);

    const { data, error } = await supabase.functions.invoke("ocr-proxy", {
      body: {
        action: "extract_date",
        base64Data,
        mimeType
      }
    });

    if (error || !data || data.error) {
      console.warn("Supabase ocr-proxy Date OCR notice:", data?.error || error?.message);
      return null;
    }

    return data.date || null;
  } catch (err) {
    console.error("Date OCR error:", err);
    return null;
  }
};

export interface OcrProgressInfo {
  progress: number;
  total: number;
  progressText: string;
}

export class OcrProcessor {
  /**
   * Processes a batch by converting its PDF to images, running Gemini OCR,
   * and saving the structured data directly to Supabase.
   *
   * @param targetBatch The batch to process.
   * @param onProgress Callback for UI progress updates.
   * @returns The updated BatchItem with parsed ledgers.
   */
  static async processBatch(
    targetBatch: BatchItem,
    onProgress?: (info: OcrProgressInfo) => void
  ): Promise<BatchItem> {
    
    // Safety protection against reprocessing verified data
    if (targetBatch.status === 'verified') {
      throw new Error("Cannot run OCR on a verified batch. Human corrections would be lost.");
    }

    onProgress?.({
      progress: 0,
      total: targetBatch.pageCount || 1,
      progressText: `Preparing pages for ${targetBatch.filename}...`
    });

    await BatchService.updateBatchStatus(targetBatch.id, "processing");

    let pageImages: string[] = targetBatch.pageImages || [];
    
    try {
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

      const CHUNK_SIZE = 2; // Process 2 pages at a time to respect rate limits
      for (let i = 0; i < pageImages.length; i += CHUNK_SIZE) {
        const chunk = pageImages.slice(i, i + CHUNK_SIZE);
        const startPage = i + 1;
        const endPage = Math.min(i + CHUNK_SIZE, pageImages.length);

        onProgress?.({
          progress: startPage - 1,
          total: pageImages.length,
          progressText: `Scanning Pages ${startPage}–${endPage} of ${pageImages.length} with Gemini...`
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
                transactions: (extracted.transactions || []).map((tx: any) => ({
                  ...tx,
                  ocr_raw_data: tx
                })),
                ocr_raw_data: extracted
              };

              // Stream into DB idempotently right away (as OCR update)
              const dbLedgerId = await LedgerService.upsertLedger(targetBatch.id, ledger, true);
              if (ledger.transactions && ledger.transactions.length > 0) {
                await TransactionService.upsertTransactions(dbLedgerId, ledger.transactions, true);
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
      
      return {
        ...targetBatch,
        pageImages,
        pageCount: parsedLedgers.length,
        status: "needs_review",
        data: parsedLedgers
      };
      
    } catch (err: any) {
      await BatchService.updateBatchStatus(targetBatch.id, "failed").catch(console.error);
      throw err;
    }
  }
}
