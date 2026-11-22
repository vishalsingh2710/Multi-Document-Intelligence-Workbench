import path from "node:path";
import { extractPdf } from "./pdf";
import { extractText } from "./text";
import { extractCsv } from "./csv";
import type { DocumentFormat } from "../../types";

export const SUPPORTED_EXTENSIONS: Record<string, DocumentFormat> = {
  ".pdf": "pdf",
  ".txt": "txt",
  ".md": "txt",
  ".csv": "csv",
};

export const SUPPORTED_MIME_PREFIXES: Record<string, DocumentFormat> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "txt",
  "text/csv": "csv",
  "application/csv": "csv",
  "application/vnd.ms-excel": "csv",
};

export function detectFormat(
  originalName: string,
  mimetype: string
): DocumentFormat | null {
  const ext = path.extname(originalName).toLowerCase();
  if (ext in SUPPORTED_EXTENSIONS) return SUPPORTED_EXTENSIONS[ext]!;
  if (mimetype in SUPPORTED_MIME_PREFIXES)
    return SUPPORTED_MIME_PREFIXES[mimetype]!;
  return null;
}

export interface ExtractionResult {
  status: "ok" | "failed";
  text: string;
  error?: string;
}

export async function extract(
  filePath: string,
  format: DocumentFormat
): Promise<ExtractionResult> {
  try {
    let text = "";
    switch (format) {
      case "pdf":
        text = await extractPdf(filePath);
        break;
      case "txt":
        text = await extractText(filePath);
        break;
      case "csv":
        text = await extractCsv(filePath);
        break;
    }
    if (!text || text.replace(/\s/g, "").length === 0) {
      return {
        status: "failed",
        text: "",
        error: "No readable text could be extracted.",
      };
    }
    return { status: "ok", text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "failed", text: "", error: message };
  }
}
