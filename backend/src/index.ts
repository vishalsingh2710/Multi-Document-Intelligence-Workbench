import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import path from "node:path";
import { initDb } from "./db";
import { createDocumentsRouter } from "./routes/documents";
import { createAnalysesRouter } from "./routes/analyses";

function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function createApp(options?: {
  dbPath?: string;
  uploadDir?: string;
  maxUploadBytes?: number;
  maxFilesPerUpload?: number;
  corsOrigin?: string;
}) {
  const dbPath = options?.dbPath ?? process.env.DB_PATH ?? path.resolve("data/app.db");
  const uploadDir = options?.uploadDir ?? process.env.UPLOAD_DIR ?? path.resolve("uploads");
  const maxUploadBytes = options?.maxUploadBytes ?? num(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
  const maxFilesPerUpload = options?.maxFilesPerUpload ?? num(process.env.MAX_FILES_PER_UPLOAD, 10);
  const corsOrigin = options?.corsOrigin ?? process.env.CORS_ORIGIN ?? "http://localhost:5173";

  initDb(dbPath);

  const app = express();
  app.use(
    cors({
      origin: corsOrigin.split(",").map((s) => s.trim()),
      methods: ["GET", "POST"],
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptimeSeconds: process.uptime() });
  });

  app.use(
    "/api/documents",
    createDocumentsRouter({ uploadDir, maxUploadBytes, maxFilesPerUpload })
  );
  app.use("/api/analyses", createAnalysesRouter());

  // 404 fallback for /api/*
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Error handler. Keeps responses JSON and avoids leaking stack traces.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : 400;
    const message = err instanceof Error ? err.message : "Unknown error.";
    // eslint-disable-next-line no-console
    console.error("[error]", message);
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  });

  return app;
}

if (require.main === module) {
  const port = num(process.env.PORT, 4000);
  const app = createApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[mdiw-backend] listening on http://localhost:${port}`);
  });
}
