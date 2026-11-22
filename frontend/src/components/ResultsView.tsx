import { useMemo, useState } from "react";
import type { AnalysisResult } from "../types";

interface Props {
  result: AnalysisResult;
}

export function ResultsView({ result }: Props) {
  const [copied, setCopied] = useState(false);

  const textForCopy = useMemo(() => buildCopyText(result), [result]);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(textForCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="results">
      <header className="results-header">
        <h2>Analysis</h2>
        <button type="button" onClick={copyToClipboard}>
          {copied ? "Copied!" : "Copy output"}
        </button>
      </header>

      <div className="summary card">
        <h3>Summary</h3>
        <p>{result.summary}</p>
      </div>

      <div className="card">
        <h3>Comparison table</h3>
        {result.comparison.rows.length === 0 ? (
          <p className="muted">No structured fields extracted.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  {result.comparison.documents.map((doc) => (
                    <th key={doc.id} title={doc.id}>
                      {doc.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.comparison.rows.map((row) => (
                  <tr key={row.field}>
                    <th scope="row">{row.field}</th>
                    {result.comparison.documents.map((doc) => (
                      <td key={doc.id} className={row.values[doc.id] ? "" : "cell-missing"}>
                        {row.values[doc.id] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>
          Discrepancies <span className="badge badge-interp">interpretation</span>
        </h3>
        {result.discrepancies.length === 0 ? (
          <p className="muted">No conflicting values detected across documents.</p>
        ) : (
          <ul>
            {result.discrepancies.map((d) => (
              <li key={d.field}>
                <strong>{d.field}:</strong> {d.note}
                <ul>
                  {d.values.map((v) => (
                    <li key={v.documentId}>
                      <code>{v.value}</code> — <em>{v.documentName}</em>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>
          Missing information <span className="badge badge-interp">interpretation</span>
        </h3>
        {result.missing.length === 0 ? (
          <p className="muted">All detected fields appear in every document.</p>
        ) : (
          <ul>
            {result.missing.map((m) => (
              <li key={m.field}>
                <strong>{m.field}</strong> — missing from:{" "}
                {m.missingFrom.map((p) => p.documentName).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>
          Extracted facts <span className="badge badge-fact">verbatim</span>
        </h3>
        <ul className="facts">
          {result.facts.map((fact, idx) => (
            <li key={`${fact.documentId}-${fact.field}-${idx}`}>
              <strong>{fact.field}:</strong> {fact.value}{" "}
              <span className="provenance">({fact.documentName})</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="disclaimer">{result.disclaimer}</p>
    </section>
  );
}

function buildCopyText(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`Analysis generated ${result.generatedAt}`);
  lines.push(`Instruction: ${result.prompt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(result.summary);
  lines.push("");

  if (result.comparison.rows.length > 0) {
    lines.push("## Comparison");
    const header = ["Field", ...result.comparison.documents.map((d) => d.name)].join(" | ");
    lines.push(header);
    lines.push(new Array(result.comparison.documents.length + 1).fill("---").join(" | "));
    for (const row of result.comparison.rows) {
      const values = result.comparison.documents.map((d) => row.values[d.id] ?? "—");
      lines.push([row.field, ...values].join(" | "));
    }
    lines.push("");
  }

  if (result.discrepancies.length > 0) {
    lines.push("## Discrepancies (interpretation)");
    for (const d of result.discrepancies) {
      lines.push(`- ${d.field}: ${d.note}`);
      for (const v of d.values) lines.push(`    • ${v.value} — ${v.documentName}`);
    }
    lines.push("");
  }

  if (result.missing.length > 0) {
    lines.push("## Missing information (interpretation)");
    for (const m of result.missing) {
      lines.push(`- ${m.field} — missing from: ${m.missingFrom.map((p) => p.documentName).join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Extracted facts (verbatim)");
  for (const fact of result.facts) {
    lines.push(`- ${fact.field}: ${fact.value} (${fact.documentName})`);
  }
  lines.push("");
  lines.push(result.disclaimer);
  return lines.join("\n");
}
