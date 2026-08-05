import { supabase } from "./supabaseClient";
import { getPdfPageImageDataUrl } from "./pdfPageRenderer";

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
