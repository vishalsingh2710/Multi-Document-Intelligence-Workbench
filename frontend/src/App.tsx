import { useEffect, useState } from "react";
import { FileUploader } from "./components/FileUploader";
import { DocumentList } from "./components/DocumentList";
import { PromptBox } from "./components/PromptBox";
import { ResultsView } from "./components/ResultsView";
import { listDocuments, runAnalysis } from "./api";
import type { AnalysisResult, UploadedDocument } from "./types";

export default function App() {
  const [docs, setDocs] = useState<UploadedDocument[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDocuments()
      .then((r) => setDocs(r.documents))
      .catch(() => undefined);
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onUploaded(newDocs: UploadedDocument[]) {
    setDocs((prev) => [...newDocs, ...prev]);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const d of newDocs) if (d.extractionStatus === "ok") next.add(d.id);
      return next;
    });
  }

  async function analyse() {
    if (selected.size === 0) {
      setError("Select at least one document.");
      return;
    }
    if (prompt.trim().length < 5) {
      setError("Enter an instruction (at least 5 characters).");
      return;
    }
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const { analysis } = await runAnalysis(prompt.trim(), Array.from(selected));
      setResult(analysis.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Multi-Document Intelligence Workbench</h1>
        <p className="muted">
          Upload documents, give an instruction, receive a structured comparison with per-document
          provenance.
        </p>
      </header>

      <section className="panel">
        <h2>1. Documents</h2>
        <FileUploader onUploaded={onUploaded} />
        <DocumentList documents={docs} selected={selected} onToggle={toggle} />
      </section>

      <section className="panel">
        <h2>2. Instruction</h2>
        <PromptBox value={prompt} onChange={setPrompt} disabled={busy} />
        <button
          type="button"
          className="primary"
          onClick={analyse}
          disabled={busy || selected.size === 0 || prompt.trim().length < 5}
        >
          {busy ? "Analysing…" : `Analyse ${selected.size} document${selected.size === 1 ? "" : "s"}`}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <section className="panel">
          <ResultsView result={result} />
        </section>
      )}
    </main>
  );
}
