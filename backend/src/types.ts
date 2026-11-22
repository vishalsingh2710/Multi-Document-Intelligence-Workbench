export type DocumentFormat = "pdf" | "txt" | "csv";

export interface StoredDocument {
  id: string;
  originalName: string;
  format: DocumentFormat;
  sizeBytes: number;
  storagePath: string;
  extractedText: string;
  extractionStatus: "ok" | "failed";
  extractionError?: string | null;
  createdAt: string;
}

export interface ExtractedFact {
  field: string;
  value: string;
  documentId: string;
  documentName: string;
  source: "extracted";
}

export interface Discrepancy {
  field: string;
  values: { documentId: string; documentName: string; value: string }[];
  source: "interpretation";
  note: string;
}

export interface MissingInfo {
  field: string;
  presentIn: { documentId: string; documentName: string }[];
  missingFrom: { documentId: string; documentName: string }[];
  source: "interpretation";
}

export interface ComparisonRow {
  field: string;
  values: Record<string, string | null>;
}

export interface AnalysisResult {
  summary: string;
  prompt: string;
  comparison: {
    fields: string[];
    documents: { id: string; name: string }[];
    rows: ComparisonRow[];
  };
  facts: ExtractedFact[];
  discrepancies: Discrepancy[];
  missing: MissingInfo[];
  disclaimer: string;
  generatedAt: string;
}

export interface AnalysisRecord {
  id: string;
  prompt: string;
  result: AnalysisResult;
  documentIds: string[];
  createdAt: string;
}
