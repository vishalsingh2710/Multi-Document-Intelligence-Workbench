import fs from "node:fs/promises";

export async function extractText(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf8");
  return content.trim();
}
