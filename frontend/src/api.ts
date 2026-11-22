import type { AnalysisRecord, UploadedDocument } from "./types";

const BASE = "/api";

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function uploadDocuments(files: File[]): Promise<{ documents: UploadedDocument[] }> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch(`${BASE}/documents`, { method: "POST", body: form });
  return handle(res);
}

export async function listDocuments(): Promise<{ documents: UploadedDocument[] }> {
  return handle(await fetch(`${BASE}/documents`));
}

export async function runAnalysis(
  prompt: string,
  documentIds: string[]
): Promise<{ analysis: AnalysisRecord; missingDocumentIds: string[] }> {
  const res = await fetch(`${BASE}/analyses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, documentIds }),
  });
  return handle(res);
}
