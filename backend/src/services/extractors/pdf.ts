import fs from "node:fs/promises";
import pdfParse from "pdf-parse";

export async function extractPdf(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  return (parsed.text ?? "").trim();
}
