import { useRef, useState } from "react";
import { uploadDocuments } from "../api";
import type { UploadedDocument } from "../types";

const ACCEPT = ".pdf,.txt,.md,.csv,application/pdf,text/plain,text/csv";

interface Props {
  onUploaded: (docs: UploadedDocument[]) => void;
}

export function FileUploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const { documents } = await uploadDocuments(Array.from(files));
      onUploaded(documents);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="uploader">
      <label className="uploader-label">
        <span>Upload documents (PDF, TXT, CSV)</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
      {busy && <p className="muted">Uploading & extracting…</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
