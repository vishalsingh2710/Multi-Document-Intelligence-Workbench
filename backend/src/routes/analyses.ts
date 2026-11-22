import { Router } from "express";
import crypto from "node:crypto";
import { analyseRequestSchema } from "../services/validation";
import { getAnalysis, getDocumentsByIds, insertAnalysis } from "../db";
import { analyseDocuments } from "../services/analyzer";
import type { AnalysisRecord } from "../types";

export function createAnalysesRouter(): Router {
  const router = Router();

  router.post("/", (req, res, next) => {
    try {
      const parsed = analyseRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid request body.",
          details: parsed.error.flatten(),
        });
        return;
      }
      const { prompt, documentIds } = parsed.data;
      const unique = Array.from(new Set(documentIds));
      const documents = getDocumentsByIds(unique);
      if (documents.length === 0) {
        res.status(404).json({ error: "None of the requested documents exist." });
        return;
      }
      const foundIds = new Set(documents.map((d) => d.id));
      const missing = unique.filter((id) => !foundIds.has(id));
      const result = analyseDocuments(prompt, documents);
      const record: AnalysisRecord = {
        id: crypto.randomUUID(),
        prompt,
        result,
        documentIds: documents.map((d) => d.id),
        createdAt: new Date().toISOString(),
      };
      insertAnalysis(record);
      res.status(201).json({
        analysis: record,
        missingDocumentIds: missing,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", (req, res) => {
    const record = getAnalysis(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Analysis not found." });
      return;
    }
    res.json({ analysis: record });
  });

  return router;
}
