"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfModule = typeof import("pdfjs-dist");
let modPromise: Promise<PdfModule> | null = null;

/** pdf.js touches DOM globals at import time, so it is only ever loaded in the browser. */
export function loadPdfjs(): Promise<PdfModule> {
  modPromise ??= import("pdfjs-dist").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return mod;
  });
  return modPromise;
}

export async function openPdf(url: string): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ url }).promise;
}
