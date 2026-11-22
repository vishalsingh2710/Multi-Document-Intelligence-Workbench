import type {
  AnalysisResult,
  ComparisonRow,
  Discrepancy,
  ExtractedFact,
  MissingInfo,
  StoredDocument,
} from "../types";

/**
 * Deterministic "mock LLM" analyzer. It reads extracted text per document,
 * pulls structured facts via explicit rules, then builds a comparison table,
 * discrepancies, and missing-info report — one document at a time so that
 * every finding stays traceable to its source.
 */

const MAX_TEXT_PER_DOC = 50_000; // guard rail on very large docs

interface FieldExtractor {
  field: string;
  extract: (text: string) => string | null;
}

const COMPANY_PATTERNS = [
  /(?:company\s*name|business\s*name|company|organisation|organization|entity)\s*[:\-]\s*([^\n\r]{2,120})/i,
  /^([A-Z][A-Za-z0-9&.,'\- ]{2,80}(?:\s+(?:Ltd|Limited|LLC|Inc|Pty|GmbH|PLC|Corp|Corporation))\.?)/m,
];

const MONEY_PATTERN = /(?:[$€£¥₹]|USD|EUR|GBP|AUD|INR)\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g;
const DATE_PATTERN =
  /\b(?:\d{1,2}[-/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi;

function labeled(label: RegExp): FieldExtractor["extract"] {
  return (text) => {
    const match = text.match(label);
    if (!match || !match[1]) return null;
    return match[1].trim().replace(/\s+/g, " ").slice(0, 200);
  };
}

const FIELD_EXTRACTORS: FieldExtractor[] = [
  {
    field: "Company Name",
    extract: (text) => {
      for (const pattern of COMPANY_PATTERNS) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1].trim().replace(/\s+/g, " ");
      }
      return null;
    },
  },
  {
    field: "Applicant Name",
    extract: labeled(/(?:applicant(?:'s)?\s*name|full\s*name|name)\s*[:\-]\s*([^\n\r]{2,120})/i),
  },
  {
    field: "Address",
    extract: labeled(/(?:registered\s*)?address\s*[:\-]\s*([^\n\r]{5,200})/i),
  },
  {
    field: "Email",
    extract: (text) => {
      const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      return match ? match[0] : null;
    },
  },
  {
    field: "Phone",
    extract: labeled(/(?:phone|telephone|mobile|contact\s*number)\s*[:\-]\s*(\+?[\d\s\-()]{7,25}\d)/i),
  },
  {
    field: "Licence Number",
    extract: labeled(/(?:licen[cs]e\s*(?:no\.?|number))\s*[:\-]\s*([A-Z0-9\-\/]{3,40})/i),
  },
  {
    field: "Registration Number",
    extract: labeled(/(?:registration|reg(?:istration)?\s*no\.?|abn|acn|ein|cin)\s*[:\-]\s*([A-Z0-9\-\/]{3,40})/i),
  },
  {
    field: "Annual Revenue",
    extract: labeled(/(?:annual\s*revenue|revenue|turnover|annual\s*turnover)\s*[:\-]\s*([^\n\r]{2,80})/i),
  },
  {
    field: "Net Profit",
    extract: labeled(/(?:net\s*profit|profit\s*after\s*tax|pat)\s*[:\-]\s*([^\n\r]{2,80})/i),
  },
  {
    field: "Date of Incorporation",
    extract: labeled(/(?:date\s*of\s*incorporation|incorporated\s*on|founded)\s*[:\-]\s*([^\n\r]{2,80})/i),
  },
];

interface PerDocument {
  document: StoredDocument;
  perField: Map<string, string>;
  monies: string[];
  dates: string[];
}

function normaliseValue(value: string): string {
  return value.toLowerCase().replace(/[\s,]/g, "").replace(/[.,]$/, "");
}

function analyseDocument(doc: StoredDocument): PerDocument {
  const text = doc.extractedText.slice(0, MAX_TEXT_PER_DOC);
  const perField = new Map<string, string>();
  for (const extractor of FIELD_EXTRACTORS) {
    const value = extractor.extract(text);
    if (value) perField.set(extractor.field, value);
  }
  const monies = Array.from(new Set(text.match(MONEY_PATTERN) ?? [])).slice(0, 10);
  const dates = Array.from(new Set(text.match(DATE_PATTERN) ?? [])).slice(0, 10);
  return { document: doc, perField, monies, dates };
}

function buildFacts(perDoc: PerDocument[]): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  for (const d of perDoc) {
    for (const [field, value] of d.perField.entries()) {
      facts.push({
        field,
        value,
        documentId: d.document.id,
        documentName: d.document.originalName,
        source: "extracted",
      });
    }
    for (const money of d.monies) {
      facts.push({
        field: "Monetary Value (detected)",
        value: money,
        documentId: d.document.id,
        documentName: d.document.originalName,
        source: "extracted",
      });
    }
    for (const date of d.dates) {
      facts.push({
        field: "Date (detected)",
        value: date,
        documentId: d.document.id,
        documentName: d.document.originalName,
        source: "extracted",
      });
    }
  }
  return facts;
}

function buildComparison(perDoc: PerDocument[]): AnalysisResult["comparison"] {
  const fieldSet = new Set<string>();
  for (const d of perDoc) for (const f of d.perField.keys()) fieldSet.add(f);
  const fields = Array.from(fieldSet).sort();
  const documents = perDoc.map((d) => ({
    id: d.document.id,
    name: d.document.originalName,
  }));
  const rows: ComparisonRow[] = fields.map((field) => {
    const values: Record<string, string | null> = {};
    for (const d of perDoc) {
      values[d.document.id] = d.perField.get(field) ?? null;
    }
    return { field, values };
  });
  return { fields, documents, rows };
}

function buildDiscrepancies(perDoc: PerDocument[]): Discrepancy[] {
  if (perDoc.length < 2) return [];
  const discrepancies: Discrepancy[] = [];
  const fieldSet = new Set<string>();
  for (const d of perDoc) for (const f of d.perField.keys()) fieldSet.add(f);
  for (const field of fieldSet) {
    const entries = perDoc
      .map((d) => ({
        documentId: d.document.id,
        documentName: d.document.originalName,
        value: d.perField.get(field),
      }))
      .filter((e): e is { documentId: string; documentName: string; value: string } => !!e.value);
    if (entries.length < 2) continue;
    const distinct = new Set(entries.map((e) => normaliseValue(e.value)));
    if (distinct.size > 1) {
      discrepancies.push({
        field,
        values: entries,
        source: "interpretation",
        note: `${distinct.size} differing values detected across ${entries.length} documents.`,
      });
    }
  }
  return discrepancies;
}

function buildMissing(perDoc: PerDocument[]): MissingInfo[] {
  if (perDoc.length < 2) return [];
  const missing: MissingInfo[] = [];
  const fieldSet = new Set<string>();
  for (const d of perDoc) for (const f of d.perField.keys()) fieldSet.add(f);
  for (const field of fieldSet) {
    const presentIn: { documentId: string; documentName: string }[] = [];
    const missingFrom: { documentId: string; documentName: string }[] = [];
    for (const d of perDoc) {
      const entry = { documentId: d.document.id, documentName: d.document.originalName };
      if (d.perField.has(field)) presentIn.push(entry);
      else missingFrom.push(entry);
    }
    if (presentIn.length > 0 && missingFrom.length > 0) {
      missing.push({ field, presentIn, missingFrom, source: "interpretation" });
    }
  }
  return missing;
}

function buildSummary(
  prompt: string,
  perDoc: PerDocument[],
  discrepancies: Discrepancy[],
  missing: MissingInfo[]
): string {
  const okDocs = perDoc.filter((d) => d.document.extractionStatus === "ok");
  const failedDocs = perDoc.filter((d) => d.document.extractionStatus === "failed");
  const parts: string[] = [];
  parts.push(
    `Analysed ${okDocs.length} document${okDocs.length === 1 ? "" : "s"} against the instruction: "${prompt.trim().slice(0, 200)}".`
  );
  if (failedDocs.length > 0) {
    parts.push(
      `${failedDocs.length} document${failedDocs.length === 1 ? " was" : "s were"} unreadable and excluded from comparison: ${failedDocs.map((d) => d.document.originalName).join(", ")}.`
    );
  }
  if (discrepancies.length > 0) {
    parts.push(
      `Detected ${discrepancies.length} field${discrepancies.length === 1 ? "" : "s"} with conflicting values across documents.`
    );
  } else if (okDocs.length >= 2) {
    parts.push(`No conflicting field values were detected across the uploaded documents.`);
  }
  if (missing.length > 0) {
    parts.push(
      `${missing.length} field${missing.length === 1 ? " is" : "s are"} present in some documents but missing from others.`
    );
  }
  return parts.join(" ");
}

export function analyseDocuments(
  prompt: string,
  documents: StoredDocument[]
): AnalysisResult {
  const okDocs = documents.filter((d) => d.extractionStatus === "ok");
  const perDoc = okDocs.map(analyseDocument);
  const facts = buildFacts(perDoc);
  const comparison = buildComparison(perDoc);
  const discrepancies = buildDiscrepancies(perDoc);
  const missing = buildMissing(perDoc);
  const summary = buildSummary(prompt, perDoc.concat(
    documents
      .filter((d) => d.extractionStatus === "failed")
      .map((d) => ({ document: d, perField: new Map(), monies: [], dates: [] }))
  ), discrepancies, missing);

  return {
    summary,
    prompt,
    comparison,
    facts,
    discrepancies,
    missing,
    disclaimer:
      "Facts are values extracted verbatim from the documents via deterministic rules. Discrepancies and missing-info entries are AI-generated interpretations based on those facts and may require human review.",
    generatedAt: new Date().toISOString(),
  };
}
