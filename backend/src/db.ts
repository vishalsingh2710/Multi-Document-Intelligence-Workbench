import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { AnalysisRecord, StoredDocument } from "./types";

let db: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      format TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      extracted_text TEXT NOT NULL,
      extraction_status TEXT NOT NULL,
      extraction_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      result_json TEXT NOT NULL,
      document_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db = instance;
  return instance;
}

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialised. Call initDb() first.");
  return db;
}

export function insertDocument(doc: StoredDocument): void {
  getDb()
    .prepare(
      `INSERT INTO documents
       (id, original_name, format, size_bytes, storage_path, extracted_text, extraction_status, extraction_error, created_at)
       VALUES (@id, @originalName, @format, @sizeBytes, @storagePath, @extractedText, @extractionStatus, @extractionError, @createdAt)`
    )
    .run(doc);
}

interface DocumentRow {
  id: string;
  original_name: string;
  format: string;
  size_bytes: number;
  storage_path: string;
  extracted_text: string;
  extraction_status: string;
  extraction_error: string | null;
  created_at: string;
}

function rowToDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    originalName: row.original_name,
    format: row.format as StoredDocument["format"],
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    extractedText: row.extracted_text,
    extractionStatus: row.extraction_status as StoredDocument["extractionStatus"],
    extractionError: row.extraction_error,
    createdAt: row.created_at,
  };
}

export function getDocumentsByIds(ids: string[]): StoredDocument[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM documents WHERE id IN (${placeholders})`)
    .all(...ids) as DocumentRow[];
  return rows.map(rowToDocument);
}

export function listDocuments(): StoredDocument[] {
  const rows = getDb()
    .prepare(`SELECT * FROM documents ORDER BY created_at DESC`)
    .all() as DocumentRow[];
  return rows.map(rowToDocument);
}

export function insertAnalysis(record: AnalysisRecord): void {
  getDb()
    .prepare(
      `INSERT INTO analyses (id, prompt, result_json, document_ids_json, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      record.id,
      record.prompt,
      JSON.stringify(record.result),
      JSON.stringify(record.documentIds),
      record.createdAt
    );
}

interface AnalysisRow {
  id: string;
  prompt: string;
  result_json: string;
  document_ids_json: string;
  created_at: string;
}

export function getAnalysis(id: string): AnalysisRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM analyses WHERE id = ?`)
    .get(id) as AnalysisRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    prompt: row.prompt,
    result: JSON.parse(row.result_json),
    documentIds: JSON.parse(row.document_ids_json),
    createdAt: row.created_at,
  };
}
