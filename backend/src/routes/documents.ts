import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { insertDocument, listDocuments } from "../db";
import { detectFormat, extract } from "../services/extractors";
import type { StoredDocument } from "../types";

interface DocumentsRouterOptions {
  uploadDir: string;
  maxUploadBytes: number;
  maxFilesPerUpload: number;
}

export function createDocumentsRouter(opts: DocumentsRouterOptions): Router {
  if (!fs.existsSync(opts.uploadDir)) {
    fs.mkdirSync(opts.uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, opts.uploadDir),
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname).toLowerCase().slice(0, 10);
      const token = crypto.randomUUID();
      cb(null, `${token}${safeExt}`);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: opts.maxUploadBytes,
      files: opts.maxFilesPerUpload,
    },
    fileFilter: (_req, file, cb) => {
      const fmt = detectFormat(file.originalname, file.mimetype);
      if (!fmt) {
        cb(new Error(`Unsupported file type: ${file.originalname} (${file.mimetype}). Allowed: pdf, txt, csv.`));
        return;
      }
      cb(null, true);
    },
  });

  const router = Router();

  router.get("/", (_req, res) => {
    const docs = listDocuments().map((d) => ({
      id: d.id,
      originalName: d.originalName,
      format: d.format,
      sizeBytes: d.sizeBytes,
      extractionStatus: d.extractionStatus,
      extractionError: d.extractionError,
      createdAt: d.createdAt,
    }));
    res.json({ documents: docs });
  });

  router.post("/", upload.array("files", opts.maxFilesPerUpload), async (req, res, next) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({ error: "No files uploaded. Attach files under the 'files' field." });
        return;
      }
      const results: Array<Omit<StoredDocument, "extractedText" | "storagePath">> = [];
      for (const file of files) {
        const format = detectFormat(file.originalname, file.mimetype);
        if (!format) {
          // Should be caught by fileFilter, but guard anyway.
          await fs.promises.unlink(file.path).catch(() => undefined);
          continue;
        }
        const extraction = await extract(file.path, format);
        const doc: StoredDocument = {
          id: crypto.randomUUID(),
          originalName: path.basename(file.originalname),
          format,
          sizeBytes: file.size,
          storagePath: file.path,
          extractedText: extraction.text,
          extractionStatus: extraction.status,
          extractionError: extraction.error ?? null,
          createdAt: new Date().toISOString(),
        };
        insertDocument(doc);
        results.push({
          id: doc.id,
          originalName: doc.originalName,
          format: doc.format,
          sizeBytes: doc.sizeBytes,
          extractionStatus: doc.extractionStatus,
          extractionError: doc.extractionError,
          createdAt: doc.createdAt,
        });
      }
      res.status(201).json({ documents: results });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
