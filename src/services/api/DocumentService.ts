import { supabase } from "../supabaseClient";
import { BatchService } from "./BatchService";

const BUCKET = "ledger-documents";

export class DocumentService {
  static async uploadDocument(
    file: File,
    batchId: string,
    branchId: string,
    year: number,
    month: number
  ): Promise<string> {
    const mm = String(month).padStart(2, "0");
    const storagePath = `${branchId}/${year}/${mm}/${batchId}/original/${batchId}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: true // Allow upsert for retries if the network failed after upload but before DB commit
      });

    if (uploadErr) {
      console.error("Storage upload failed:", uploadErr);
      await BatchService.updateBatchStatus(batchId, 'failed');
      throw uploadErr;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    await BatchService.updateBatchPdfUrl(batchId, urlData.publicUrl, storagePath);

    return urlData.publicUrl;
  }

  static async deleteDocument(storagePath: string): Promise<void> {
    if (!storagePath) return;
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
}
