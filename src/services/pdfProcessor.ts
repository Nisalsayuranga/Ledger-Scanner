import * as pdfjsLib from "pdfjs-dist";

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const convertPdfToImages = async (fileOrUrl: File | string | ArrayBuffer): Promise<string[]> => {
  let docInit: any;
  if (typeof fileOrUrl === "string") {
    docInit = { url: fileOrUrl };
  } else if (fileOrUrl instanceof File) {
    const arrayBuffer = await fileOrUrl.arrayBuffer();
    docInit = { data: arrayBuffer };
  } else {
    docInit = { data: fileOrUrl };
  }

  const pdf = await pdfjsLib.getDocument(docInit).promise;
  const imageUrls: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // High DPI rendering
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({ canvasContext: context, viewport }).promise;
      imageUrls.push(canvas.toDataURL("image/jpeg", 0.85));
    }
  }

  return imageUrls;
};
