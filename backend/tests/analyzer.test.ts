import { describe, expect, it } from "vitest";
import { analyseDocuments } from "../src/services/analyzer";
import type { StoredDocument } from "../src/types";

function mkDoc(input: { id: string; text: string; name: string }): StoredDocument {
  return {
    id: input.id,
    originalName: input.name,
    format: "txt",
    sizeBytes: input.text.length,
    storagePath: `/tmp/${input.id}.txt`,
    extractedText: input.text,
    extractionStatus: "ok",
    extractionError: null,
    createdAt: new Date().toISOString(),
  };
}

describe("analyseDocuments", () => {
  it("detects a discrepancy on Company Name across two documents and preserves provenance", () => {
    const docA = mkDoc({
      id: "11111111-1111-1111-1111-111111111111",
      name: "application-form.txt",
      text: [
        "Company Name: Acme Trading Ltd",
        "Address: 1 Main St, Sydney",
        "Email: info@acme.example",
        "Annual Revenue: $2,500,000",
      ].join("\n"),
    });
    const docB = mkDoc({
      id: "22222222-2222-2222-2222-222222222222",
      name: "supporting-doc.txt",
      text: [
        "Company Name: Acme Trading Pty",
        "Address: 1 Main St, Sydney",
        "Annual Revenue: $2,750,000",
      ].join("\n"),
    });

    const result = analyseDocuments("Compare the application form and supporting document.", [docA, docB]);

    expect(result.comparison.documents).toHaveLength(2);
    expect(result.comparison.fields).toContain("Company Name");

    const companyDiscrepancy = result.discrepancies.find((d) => d.field === "Company Name");
    expect(companyDiscrepancy, "expected a Company Name discrepancy").toBeDefined();
    expect(companyDiscrepancy!.source).toBe("interpretation");
    expect(companyDiscrepancy!.values.map((v) => v.documentId).sort()).toEqual([docA.id, docB.id].sort());

    const revenueDiscrepancy = result.discrepancies.find((d) => d.field === "Annual Revenue");
    expect(revenueDiscrepancy, "expected Annual Revenue discrepancy").toBeDefined();

    // Address matches in both documents — should NOT be a discrepancy.
    expect(result.discrepancies.find((d) => d.field === "Address")).toBeUndefined();

    // Email is present only in docA — should appear in the missing-info report.
    const emailMissing = result.missing.find((m) => m.field === "Email");
    expect(emailMissing, "expected Email to be flagged as missing from docB").toBeDefined();
    expect(emailMissing!.presentIn.map((p) => p.documentId)).toContain(docA.id);
    expect(emailMissing!.missingFrom.map((p) => p.documentId)).toContain(docB.id);

    // Every fact must carry a documentId — provenance guarantee.
    for (const fact of result.facts) {
      expect(fact.documentId).toBeTruthy();
      expect(fact.documentName).toBeTruthy();
      expect(fact.source).toBe("extracted");
    }

    // Disclaimer must distinguish facts from interpretation.
    expect(result.disclaimer).toMatch(/extracted/i);
    expect(result.disclaimer).toMatch(/interpretation/i);
  });

  it("gracefully handles a failed-extraction document by excluding it from comparison", () => {
    const good = mkDoc({
      id: "33333333-3333-3333-3333-333333333333",
      name: "good.txt",
      text: "Company Name: Beta Ltd\nAnnual Revenue: $1,000,000",
    });
    const bad: StoredDocument = {
      id: "44444444-4444-4444-4444-444444444444",
      originalName: "corrupt.pdf",
      format: "pdf",
      sizeBytes: 123,
      storagePath: "/tmp/corrupt.pdf",
      extractedText: "",
      extractionStatus: "failed",
      extractionError: "No readable text could be extracted.",
      createdAt: new Date().toISOString(),
    };

    const result = analyseDocuments("Summarise the documents.", [good, bad]);
    expect(result.comparison.documents).toHaveLength(1);
    expect(result.comparison.documents[0]!.id).toBe(good.id);
    expect(result.summary).toMatch(/unreadable/i);
  });
});
