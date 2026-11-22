import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";

export async function extractCsv(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, "utf8");
  const rows = parse(raw, {
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as string[][];
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  if (!header) return "";

  const lines: string[] = [];
  for (const row of body) {
    const pairs = header.map((key, idx) => `${key}: ${row[idx] ?? ""}`);
    lines.push(pairs.join(" | "));
  }
  return lines.join("\n");
}
