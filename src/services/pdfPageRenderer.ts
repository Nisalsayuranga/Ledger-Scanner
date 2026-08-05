import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const getPdfPageImageDataUrl = async (pdfUrl: string, pageNum: number): Promise<string> => {
  try {
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const validPageNum = Math.min(Math.max(1, pageNum), pdf.numPages);
    const page = await pdf.getPage(validPageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL("image/jpeg", 0.85);
    }
  } catch (err) {
    console.error(`Failed to render page ${pageNum} from ${pdfUrl}:`, err);
  }
  return "";
};
