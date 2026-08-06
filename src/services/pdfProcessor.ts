import * as pdfjsLib from "pdfjs-dist";

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const getPdfPageCount = async (fileOrUrl: File | string | ArrayBuffer): Promise<number> => {
  let docInit: any;
  if (typeof fileOrUrl === "string") {
    const res = await fetch(fileOrUrl);
    if (!res.ok) throw new Error("Failed to fetch PDF");
    docInit = { data: await res.arrayBuffer() };
  } else if (fileOrUrl instanceof File) {
    docInit = { data: await fileOrUrl.arrayBuffer() };
  } else {
    docInit = { data: fileOrUrl };
  }

  const pdf = await pdfjsLib.getDocument(docInit).promise;
  return pdf.numPages;
};

export const convertPdfToImages = async (fileOrUrl: File | string | ArrayBuffer): Promise<string[]> => {
  let docInit: any;
  if (typeof fileOrUrl === "string") {
    const res = await fetch(fileOrUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch PDF file from cloud: ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    docInit = { data: arrayBuffer };
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
    const viewport = page.getViewport({ scale: 1.5 }); // Balanced DPI rendering
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({ canvasContext: context, viewport }).promise;
      imageUrls.push(canvas.toDataURL("image/jpeg", 0.75));
    }
  }

  return imageUrls;
};
